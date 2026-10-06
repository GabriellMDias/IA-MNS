GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_conversations, public.agent_turns TO orion_runtime;
-- Traces are appended with their turn and removed only by cascade.
GRANT SELECT, INSERT ON TABLE public.agent_turn_traces TO orion_runtime;
