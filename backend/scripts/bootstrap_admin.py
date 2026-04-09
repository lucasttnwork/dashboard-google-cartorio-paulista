"""Idempotent CLI to bootstrap the first admin (and additional users)
in Supabase Auth + public.user_profiles.

Usage:
    SUPABASE_URL=https://<ref>.supabase.co \\
    SUPABASE_SECRET_KEY=sb_secret_... \\
    DATABASE_URL=postgresql+asyncpg://... \\
        python -m scripts.bootstrap_admin \\
            --email admin@cartorio.com \\
            --role admin
            [--dry-run]

Behaviour:
1. Reads env vars (fail fast with clear error if missing).
2. Prompts for password via getpass (unless --dry-run).
3. Ensures a Supabase Auth user exists for the email — tries to
   create via POST /admin/users, falls back to admin lookup on
   409 email_exists.
4. Upserts a row in public.user_profiles using ON CONFLICT so the
   second run just updates the role and clears disabled_at.
5. Prints a JSON summary to stdout and exits 0.

This CLI is used in dev against any Supabase project, and in T1.W4.4
against production (human gate).
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import httpx
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Local imports — use relative to `app` package.
# The CLI is invoked from backend/ (where pyproject.toml lives), so the
# `app` package is importable via the editable install (`uv pip install -e .`).
from app.services.supabase_auth import (
    SupabaseAuthClient,
    SupabaseAuthError,
    SupabaseUser,
)

logger = structlog.get_logger("bootstrap_admin")

Role = Literal["admin", "manager", "viewer"]
VALID_ROLES: tuple[Role, ...] = ("admin", "manager", "viewer")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_env_or_fail(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"ERROR: {name} is required but not set", file=sys.stderr)
        sys.exit(2)
    return value


def _validate_role(raw: str) -> Role:
    if raw not in VALID_ROLES:
        print(
            f"ERROR: role must be one of {VALID_ROLES}, got {raw!r}",
            file=sys.stderr,
        )
        sys.exit(2)
    return raw  # type: ignore[return-value]


def _validate_password(password: str) -> None:
    """Basic guard — gotrue enforces its own rules, but we catch the
    obvious cases before the round trip."""
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters", file=sys.stderr)
        sys.exit(2)


# ---------------------------------------------------------------------------
# Core async functions
# ---------------------------------------------------------------------------


async def ensure_supabase_user(
    client: SupabaseAuthClient,
    *,
    email: str,
    password: str,
    dry_run: bool,
) -> SupabaseUser:
    """Create the Supabase auth user, or return the existing one."""
    if dry_run:
        logger.info("bootstrap_admin.dry_run.ensure_user", email=email)
        # Return a fake user so the rest of the flow can be exercised
        return SupabaseUser(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            email=email,
        )
    try:
        user = await client.admin_create_user(
            email=email,
            password=password,
            email_confirm=True,
            app_metadata={"bootstrap": True},
        )
        logger.info("bootstrap_admin.user_created", user_id=str(user.id), email=email)
        return user
    except SupabaseAuthError as exc:
        if exc.status_code == 409 and exc.message == "email_exists":
            logger.info("bootstrap_admin.user_exists", email=email)
            existing = await client.admin_get_user_by_email(email)
            if existing is None:
                print(
                    f"ERROR: gotrue reports email exists but admin_get_user_by_email "
                    f"returned None for {email}",
                    file=sys.stderr,
                )
                sys.exit(3)
            return existing
        raise


async def upsert_user_profile(
    database_url: str,
    *,
    user_id: UUID,
    role: Role,
    dry_run: bool,
) -> None:
    """Insert or update public.user_profiles with ON CONFLICT."""
    if dry_run:
        logger.info(
            "bootstrap_admin.dry_run.upsert_profile",
            user_id=str(user_id),
            role=role,
        )
        return
    engine = create_async_engine(database_url, pool_pre_ping=True)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    insert into public.user_profiles (user_id, role, created_at, updated_at)
                    values (:user_id, :role, now(), now())
                    on conflict (user_id) do update
                      set role = excluded.role,
                          disabled_at = null,
                          updated_at = now()
                    """
                ),
                {"user_id": str(user_id), "role": role},
            )
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def run(args: argparse.Namespace) -> int:
    supabase_url = _read_env_or_fail("SUPABASE_URL")
    secret_key = _read_env_or_fail("SUPABASE_SECRET_KEY")
    database_url = _read_env_or_fail("DATABASE_URL")

    role = _validate_role(args.role)

    if args.dry_run:
        password = "dry-run-placeholder-not-used"
    else:
        password = getpass.getpass(f"Password for {args.email}: ")
        _validate_password(password)
        confirm = getpass.getpass("Confirm password: ")
        if confirm != password:
            print("ERROR: passwords do not match", file=sys.stderr)
            return 2

    base_url = f"{supabase_url.rstrip('/')}/auth/v1"
    async with httpx.AsyncClient(timeout=30.0) as http:
        client = SupabaseAuthClient(
            base_url=base_url,
            secret_key=secret_key,
            http=http,
        )
        user = await ensure_supabase_user(
            client,
            email=args.email,
            password=password,
            dry_run=args.dry_run,
        )

    await upsert_user_profile(
        database_url,
        user_id=user.id,
        role=role,
        dry_run=args.dry_run,
    )

    result = {
        "ok": True,
        "dry_run": args.dry_run,
        "user_id": str(user.id),
        "email": args.email,
        "role": role,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps(result, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="bootstrap_admin",
        description="Bootstrap an admin (or any role) user for the cartorio dashboard.",
    )
    parser.add_argument("--email", required=True, help="User email")
    parser.add_argument(
        "--role",
        required=True,
        choices=list(VALID_ROLES),
        help="Role to assign in public.user_profiles",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without calling Supabase or writing to DB",
    )
    args = parser.parse_args()

    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nAborted by user", file=sys.stderr)
        return 130
    except SupabaseAuthError as exc:
        logger.error(
            "bootstrap_admin.supabase_auth_error",
            status_code=exc.status_code,
            message=exc.message,
            upstream_status=exc.upstream_status,
            upstream_body=exc.upstream_body,
        )
        print(
            f"ERROR: Supabase Auth call failed: "
            f"{exc.status_code} {exc.message}",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:  # noqa: BLE001
        logger.exception("bootstrap_admin.unexpected_error")
        print(f"ERROR: unexpected: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
