GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.identity_persons, public.identity_external_identities, public.identity_local_credentials, public.identity_recovery_codes, public.identity_sessions, public.identity_role_assignments, public.identity_capability_grants, public.identity_tickets, public.identity_used_assertions TO orion_runtime;
-- Audit evidence is append-only for the runtime role.
GRANT SELECT, INSERT ON TABLE public.identity_audit_events TO orion_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.identity_security_policies TO orion_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.identity_trusted_devices TO orion_runtime;
-- Owners link, change and remove WhatsApp numbers; the channel learns the
-- WhatsApp user identifier of a linked number.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.identity_whatsapp_links TO orion_runtime;
-- Owners restrict grants and manage groups, their members and their grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.identity_grant_restrictions, public.identity_groups, public.identity_group_members, public.identity_group_grants, public.identity_group_grant_restrictions TO orion_runtime;
-- Fixed provider rows are seeded by migration; owners only change selections.
GRANT SELECT, UPDATE ON TABLE public.identity_provider_groups TO orion_runtime;
