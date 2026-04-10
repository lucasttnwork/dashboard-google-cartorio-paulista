-- 20260410200000_audit_log.sql
-- Phase 2: Collaborators Admin Panel
-- Append-only audit log for tracking all mutations to collaborators.

create table if not exists public."audit_log" (
    "id" bigint generated always as identity primary key,
    "entity_type" text not null,
    "entity_id" bigint not null,
    "action" text not null,
    "actor_id" uuid not null,
    "actor_email" text not null,
    "diff" jsonb not null default '{}',
    "created_at" timestamptz not null default now()
);

-- Enforce RLS deny_all (consistent with Phase 0 pattern).
-- Backend bypasses via service_role.
alter table public."audit_log" enable row level security;
alter table public."audit_log" force row level security;
create policy "audit_log_deny_all" on public."audit_log"
    as restrictive for all to public using (false);

-- Indexes for common queries
create index idx_audit_log_entity on public.audit_log (entity_type, entity_id);
create index idx_audit_log_created on public.audit_log (created_at desc);

-- Constrain action values for collaborators
alter table public."audit_log" add constraint audit_log_action_check
    check (action in ('create', 'update', 'deactivate', 'reactivate', 'merge', 'import'));

comment on table public.audit_log is 'Append-only audit trail for entity mutations. Phase 2.';
