# Architecture

This stub points to the authoritative architecture documents.

- **Strategic overview:** [`.planning/enterprise-rebuild/OVERVIEW.md`](../.planning/enterprise-rebuild/OVERVIEW.md)
- **Invariants (13 articles):** [`.planning/enterprise-rebuild/CONSTITUTION.md`](../.planning/enterprise-rebuild/CONSTITUTION.md)
- **Design decisions (D1–D18):** [`.planning/enterprise-rebuild/DESIGN-DISCUSSION.md`](../.planning/enterprise-rebuild/DESIGN-DISCUSSION.md)
- **Production snapshot:** [`.planning/enterprise-rebuild/phase-0-security-baseline/snapshot/prod-state-2026-04-09.md`](../.planning/enterprise-rebuild/phase-0-security-baseline/snapshot/prod-state-2026-04-09.md)

## Runtime topology (target)

```
┌────────────┐     ┌──────────────┐     ┌────────────┐
│  Frontend  │     │   Backend    │     │   Workers  │
│  nginx     │────▶│   FastAPI    │────▶│     arq    │
│  (Vite)    │     │  (uvicorn)   │     │  + cron    │
└────────────┘     └──────┬───────┘     └──────┬─────┘
                          │                    │
                          ▼                    ▼
                   ┌─────────────┐      ┌────────────┐
                   │   Supabase  │      │   Redis    │
                   │  (Postgres  │      │  (Railway  │
                   │   + Auth)   │      │   addon)   │
                   └─────────────┘      └────────────┘
```

All four application containers run on Railway. Supabase is managed
separately (Free plan) and used exclusively as the Postgres database
plus the Auth identity provider.

## Diagrams will land here

As the rebuild progresses (phases 0 → 5), this file will grow into
a live architecture reference with sequence diagrams, data models,
and request flow traces. For now, defer to `.planning/`.
