#!/usr/bin/env python3
"""Ensure Railway serviceDomain.targetPort is declared for every service.

Reads RAILWAY_TOKEN from env (Project Access Token — created in the Railway
dashboard, scoped to a project+environment). Queries current serviceDomains
via the implicit projectToken entrypoint, compares targetPort vs expected,
and calls serviceDomainUpdate for any drift.

Idempotent: exits 0 when everything already matches. Exits 1 on any API
error or unexpected state that a human must inspect.

Invariants (documented in docs/deploy-railway.md):
  - backend serviceDomain  -> targetPort 8000
  - frontend serviceDomain -> targetPort 80
  - workers has no public domain today; if one is added, expected 9000.

Dry-run: pass --dry-run to log planned mutations without executing them.

Auth note: Project Access Tokens use the `Project-Access-Token` HTTP header
(NOT `Authorization: Bearer`). Bearer auth with a project token returns
"Not Authorized" on the `project(id:)` query. The implicit `projectToken`
field works instead — the project+env are derived from the token.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "b410fbce-b67d-4820-8906-846f705ae37c"
ENVIRONMENT_ID = "bbda7196-9ba1-42a2-9570-ca46281a3ae3"

EXPECTED_TARGET_PORTS: dict[str, int] = {
    "backend": 8000,
    "frontend": 80,
    "workers": 9000,
}


@dataclass
class ServiceDomain:
    service_id: str
    service_name: str
    domain_id: str
    domain: str
    target_port: int | None


def log(event: str, **fields: Any) -> None:
    """Emit a single JSON line to stdout."""
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "event": event}
    record.update(fields)
    print(json.dumps(record, default=str), flush=True)


def die(event: str, **fields: Any) -> "None":
    log(event, **fields)
    sys.exit(1)


def gql(token: str, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_ENDPOINT,
        data=body,
        headers={
            # Project Access Tokens use this header; Bearer returns "Not Authorized".
            "Project-Access-Token": token,
            "Content-Type": "application/json",
            # Railway's edge (Cloudflare) rejects default urllib UA with error 1010.
            "User-Agent": "railway-ensure-target-ports/1.0 (+github.com/cartorio-paulista)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        die(
            "graphql_http_error",
            status=e.code,
            reason=e.reason,
            body=e.read().decode("utf-8", errors="replace"),
        )
    except urllib.error.URLError as e:
        die("graphql_network_error", reason=str(e.reason))

    payload = json.loads(raw)
    if "errors" in payload and payload["errors"]:
        die("graphql_errors", errors=payload["errors"])
    return payload["data"]


QUERY_PROJECT = """
query ProjectDomains {
  projectToken {
    projectId
    environmentId
    project {
      id
      name
      services {
        edges {
          node {
            id
            name
            serviceInstances {
              edges {
                node {
                  environmentId
                  domains {
                    serviceDomains {
                      id
                      domain
                      targetPort
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""

MUTATION_UPDATE = """
mutation UpdateTargetPort($input: ServiceDomainUpdateInput!) {
  serviceDomainUpdate(input: $input)
}
"""


def fetch_domains(token: str) -> tuple[str, str, list[ServiceDomain]]:
    data = gql(token, QUERY_PROJECT)
    pt = data.get("projectToken") or {}
    token_project_id = pt.get("projectId", "")
    token_env_id = pt.get("environmentId", "")
    if token_project_id != PROJECT_ID:
        die(
            "token_project_mismatch",
            token_project=token_project_id,
            expected=PROJECT_ID,
            message="RAILWAY_TOKEN is scoped to a different project than expected.",
        )
    if token_env_id != ENVIRONMENT_ID:
        die(
            "token_environment_mismatch",
            token_env=token_env_id,
            expected=ENVIRONMENT_ID,
            message="RAILWAY_TOKEN is scoped to a different environment than expected.",
        )
    services = pt.get("project", {}).get("services", {}).get("edges", [])
    result: list[ServiceDomain] = []
    for svc_edge in services:
        svc = svc_edge["node"]
        svc_id = svc["id"]
        svc_name = svc["name"]
        for inst_edge in svc.get("serviceInstances", {}).get("edges", []):
            inst = inst_edge["node"]
            if inst.get("environmentId") != ENVIRONMENT_ID:
                continue
            domains = inst.get("domains") or {}
            for sd in domains.get("serviceDomains") or []:
                result.append(
                    ServiceDomain(
                        service_id=svc_id,
                        service_name=svc_name,
                        domain_id=sd["id"],
                        domain=sd["domain"],
                        target_port=sd.get("targetPort"),
                    )
                )
    return token_project_id, token_env_id, result


def update_target_port(token: str, sd: ServiceDomain, expected: int, dry_run: bool) -> None:
    payload = {
        "serviceDomainId": sd.domain_id,
        "serviceId": sd.service_id,
        "environmentId": ENVIRONMENT_ID,
        "domain": sd.domain,
        "targetPort": expected,
    }
    if dry_run:
        log("would_update", service=sd.service_name, domain=sd.domain, from_=sd.target_port, to=expected)
        return
    log("updating", service=sd.service_name, domain=sd.domain, from_=sd.target_port, to=expected)
    gql(token, MUTATION_UPDATE, {"input": payload})
    log("updated", service=sd.service_name, domain=sd.domain, target_port=expected)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="log intended mutations without executing")
    args = parser.parse_args()

    token = os.environ.get("RAILWAY_TOKEN", "").strip()
    if not token:
        die(
            "missing_token",
            message=(
                "Set RAILWAY_TOKEN to a Project Access Token (Dashboard -> Project "
                "Settings -> Tokens). CLI session tokens lack mutation scope."
            ),
        )

    log("start", project_id=PROJECT_ID, environment_id=ENVIRONMENT_ID, dry_run=args.dry_run)

    _, _, domains = fetch_domains(token)
    if not domains:
        die("no_domains_found", message="no serviceDomains returned for production environment")

    drift: list[tuple[ServiceDomain, int]] = []
    unknown: list[ServiceDomain] = []

    for sd in domains:
        expected = EXPECTED_TARGET_PORTS.get(sd.service_name)
        if expected is None:
            unknown.append(sd)
            continue
        log(
            "inspect",
            service=sd.service_name,
            domain=sd.domain,
            target_port=sd.target_port,
            expected=expected,
            status="ok" if sd.target_port == expected else "drift",
        )
        if sd.target_port != expected:
            drift.append((sd, expected))

    for sd in unknown:
        log(
            "unknown_service",
            service=sd.service_name,
            domain=sd.domain,
            target_port=sd.target_port,
            message="no expected targetPort configured; edit EXPECTED_TARGET_PORTS",
        )

    if not drift:
        log("done", status="clean", checked=len(domains))
        return 0

    for sd, expected in drift:
        update_target_port(token, sd, expected, args.dry_run)

    log("done", status="dry_run" if args.dry_run else "fixed", fixed_count=len(drift))
    return 0


if __name__ == "__main__":
    sys.exit(main())
