-- Extend audit_log.action CHECK to cover user-management entity_type.
-- New actions: delete (hard-delete), disable, enable.
-- Existing: create, update, deactivate, reactivate, merge, import.

alter table public."audit_log" drop constraint if exists audit_log_action_check;
alter table public."audit_log" add constraint audit_log_action_check
    check (action in (
        'create',
        'update',
        'deactivate',
        'reactivate',
        'merge',
        'import',
        'delete',
        'disable',
        'enable'
    ));
