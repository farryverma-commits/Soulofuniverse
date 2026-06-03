-- Fix: egress_id must be nullable because the row is created before LiveKit returns the egress ID
ALTER TABLE public.session_recordings ALTER COLUMN egress_id DROP NOT NULL;
