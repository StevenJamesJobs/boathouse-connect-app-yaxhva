-- S50 THE FLIP (2026-07-21): 14 read buckets + b4a-proof -> public=false.
-- organization-logos DELIBERATELY stays public FOREVER (pre-auth login branding;
-- decision 2026-07-18; client carve-out ALWAYS_PUBLIC_BUCKETS shipped in PR #57).
-- Also drops ALL 18 storage.objects SELECT policies: signed-URL redemption is
-- token-based and org-logos serves via the public render endpoint — no RLS
-- SELECT path is needed by anything; dropping them closes anon LIST/REST reads.
-- Pre-conditions met: all ~1,021 legacy objects org-prefixed or _orphaned/
-- quarantined; all 799 referencing rows rewritten (manifests in the private
-- session50_manifests/ archive).
--
-- ROLLBACK:
--   UPDATE storage.buckets SET public = true WHERE id IN (
--     'announcements','cocktail-images','guides-and-training','host-section-images',
--     'libation-recipe-images','menu-items','menu-uploads','message-attachments',
--     'profile-pictures','puree-syrup-recipe-images','schedules','special-features',
--     'summer-libation-recipe-images','upcoming-events','b4a-proof');
--   -- then re-CREATE the 18 SELECT policies from session50_manifests/restore_policies.sql

UPDATE storage.buckets SET public = false
WHERE id IN (
  'announcements','cocktail-images','guides-and-training','host-section-images',
  'libation-recipe-images','menu-items','menu-uploads','message-attachments',
  'profile-pictures','puree-syrup-recipe-images','schedules','special-features',
  'summer-libation-recipe-images','upcoming-events','b4a-proof');

DROP POLICY "Allow public read access to announcements" ON storage.objects;
DROP POLICY "Allow public read access to guides-and-training" ON storage.objects;
DROP POLICY "Allow public read access to puree syrup recipe images" ON storage.objects;
DROP POLICY "Allow public read access to special-features" ON storage.objects;
DROP POLICY "Allow public read access to upcoming-events" ON storage.objects;
DROP POLICY "Anyone can view cocktail images" ON storage.objects;
DROP POLICY "Anyone can view libation recipe images" ON storage.objects;
DROP POLICY "Message attachments are publicly accessible" ON storage.objects;
DROP POLICY "Profile pictures are publicly accessible" ON storage.objects;
DROP POLICY "Public can view cocktail images" ON storage.objects;
DROP POLICY "Public can view libation recipe images" ON storage.objects;
DROP POLICY "Public can view menu item images" ON storage.objects;
DROP POLICY "Public can view signature recipe images" ON storage.objects;
DROP POLICY "public_read_host_section_images" ON storage.objects;
DROP POLICY "public_read_menu_uploads_bucket" ON storage.objects;
DROP POLICY "public_read_org_logos" ON storage.objects;
DROP POLICY "public_read_schedules" ON storage.objects;
DROP POLICY "summer_libation_images_select" ON storage.objects;
