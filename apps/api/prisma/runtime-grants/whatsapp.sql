-- The channel records, processes and prunes its own inbound and outbound
-- messages and keeps one conversation pointer per Person.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_inbound_messages, public.whatsapp_outbound_messages, public.whatsapp_threads TO orion_runtime;
