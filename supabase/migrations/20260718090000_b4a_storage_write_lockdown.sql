-- B4a STORAGE WRITE LOCKDOWN (2026-07-18, session 48) — USER-APPROVED EARLY DROP.
--
-- Drops every anon-reachable write policy on storage.objects (46 total: 18
-- INSERT / 15 UPDATE / 13 DELETE — incl. the signature-recipe-images orphans
-- and the 6 dead {authenticated}+auth.uid() "Managers can…" policies) and
-- revokes write privileges from anon/authenticated. READS ARE UNAFFECTED:
-- every bucket stays public=true, all SELECT policies and the SELECT grant
-- remain — stored public URLs keep rendering. Writes now happen ONLY through
-- the storage-broker edge function (service role; signed upload URLs carry
-- their own authorization and need no storage.objects permissions — proven in
-- the Phase-0/2 rehearsals). Also: per-bucket size/mime hard caps, removal of
-- the temporary b4a-proof bucket, and DROP of the legacy ungated 3-arg
-- update_profile_picture(uuid,text,uuid) overload (no internal callers; the
-- client uses the gated 4-arg form — anyone could rewrite any user's photo URL
-- through the 3-arg one).
--
-- Old-build impact (accepted): uploads/deletes and 3-arg photo updates from
-- pre-B4a builds (TestFlight #10 test devices; dormant Boathouse v2.2.1) fail
-- from this migration onward. Reads unaffected.
--
-- ============================== ROLLBACK ==============================
-- REVOKES/limits:
--   GRANT INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
--   UPDATE storage.buckets SET file_size_limit=NULL, allowed_mime_types=NULL
--     WHERE id <> 'libation-recipe-images';
-- 3-arg fn: recreate from pre-B2B3 definition (bare UPDATE of
--   users.profile_picture_url WHERE id = user_id; see git history) — or skip:
--   the 4-arg gated form serves all current clients.
-- Policies: recreate each dropped policy as
--   CREATE POLICY "<name>" ON storage.objects FOR <CMD> TO public
--     [USING / WITH CHECK] (bucket_id = '<bucket>');
--   (the 6 "Managers can …" cocktail/libation policies: TO authenticated with
--    the auth.uid()-manager EXISTS clause — dead either way);
--   and INSERT INTO storage.buckets (id,name,public) VALUES
--     ('b4a-proof','b4a-proof',true) if the proof bucket is ever needed again.
-- ======================================================================

-- INSERT policies (18)
DROP POLICY IF EXISTS "Allow authenticated users to upload puree syrup recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to upload announcements" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to upload special-features" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to upload upcoming-events" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to guides-and-training" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to cocktail-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to libation-recipe-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to menu-items bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to signature-recipe-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload cocktail images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload libation recipe images" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_menu_uploads" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_schedules" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_host_section_images" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_org_logos" ON storage.objects;
DROP POLICY IF EXISTS "summer_libation_images_insert" ON storage.objects;

-- UPDATE policies (15)
DROP POLICY IF EXISTS "Allow authenticated users to update puree syrup recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to update announcements" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to update special-features" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to update upcoming-events" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to guides-and-training" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to cocktail-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to libation-recipe-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to menu-items bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to signature-recipe-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update cocktail images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update libation recipe images" ON storage.objects;
DROP POLICY IF EXISTS "public_update_host_section_images" ON storage.objects;
DROP POLICY IF EXISTS "public_update_org_logos" ON storage.objects;
DROP POLICY IF EXISTS "summer_libation_images_update" ON storage.objects;

-- DELETE policies (13)
DROP POLICY IF EXISTS "Allow authenticated users to delete puree syrup recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from cocktail-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from libation-recipe-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from menu-items bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from signature-recipe-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to delete announcements" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to delete special-features" ON storage.objects;
DROP POLICY IF EXISTS "Allow managers to delete upcoming-events" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from guides-and-training" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete cocktail images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete libation recipe images" ON storage.objects;
DROP POLICY IF EXISTS "summer_libation_images_delete" ON storage.objects;

-- Belt and braces: no writes for the API roles even if a policy reappears.
-- (service_role untouched; SELECT grant retained for list/info endpoints.)
REVOKE INSERT, UPDATE, DELETE ON storage.objects FROM anon, authenticated;

-- Bucket hard caps (storage API enforces on ALL upload paths incl. signed URLs).
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'guides-and-training';            -- 50MB, mimes stay open (video/docs vary)
UPDATE storage.buckets SET file_size_limit = 26214400,
       allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/gif','image/webp']
 WHERE id IN ('menu-uploads','schedules');                                                          -- 25MB
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'message-attachments';             -- 10MB, mimes open (doc union; broker gates per purpose)
UPDATE storage.buckets SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp']
 WHERE id IN ('announcements','special-features','upcoming-events','host-section-images','menu-items',
              'cocktail-images','summer-libation-recipe-images','puree-syrup-recipe-images','profile-pictures');
UPDATE storage.buckets SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'organization-logos';                                                                   -- 5MB
-- libation-recipe-images: unchanged (already 5MB + image allowlist)

-- NOTE: the temporary Phase-0 proof bucket `b4a-proof` is EMPTY but its row
-- cannot be dropped here — storage.protect_delete() blocks direct SQL deletes
-- on storage tables. It is inert post-lockdown (no policies, no objects, writes
-- revoked); remove it via the dashboard Storage UI / Storage API at leisure.

-- Adjacent hole (verified: no internal callers; client uses the 4-arg form):
DROP FUNCTION IF EXISTS public.update_profile_picture(uuid, text, uuid);
