-- B4a Phase-0 PROOF bucket (2026-07-18, session 48) — TEMPORARY.
-- Creates a public bucket with ZERO storage.objects policies, i.e. exactly the
-- post-lockdown state, to prove BEFORE any client rewiring that:
--   1. direct anon-key uploads are denied (RLS, no policy), and
--   2. signed upload URLs minted by the storage-broker edge function (service
--      role) still work — signed-upload tokens carry their own authorization.
-- The bucket row is REMOVED by 20260718090000_b4a_storage_write_lockdown once
-- its rehearsal objects are cleaned up.
INSERT INTO storage.buckets (id, name, public)
VALUES ('b4a-proof', 'b4a-proof', true)
ON CONFLICT (id) DO NOTHING;
