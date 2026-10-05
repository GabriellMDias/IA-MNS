GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.identity_persons, public.identity_external_identities, public.identity_local_credentials, public.identity_recovery_codes, public.identity_sessions, public.identity_role_assignments, public.identity_capability_grants, public.identity_tickets, public.identity_used_assertions TO orion_runtime;
-- Audit evidence is append-only for the runtime role.
GRANT SELECT, INSERT ON TABLE public.identity_audit_events TO orion_runtime;
