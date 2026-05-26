-- ============================================================================
-- Migration: Create organization-logos storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-logos', 'organization-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_org_logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'organization-logos');

CREATE POLICY "public_insert_org_logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'organization-logos');

CREATE POLICY "public_update_org_logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'organization-logos')
  WITH CHECK (bucket_id = 'organization-logos');
