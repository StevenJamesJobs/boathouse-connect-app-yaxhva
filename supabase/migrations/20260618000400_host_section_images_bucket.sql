-- Storage bucket for host-section card + tile images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('host-section-images', 'host-section-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_host_section_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'host-section-images');

CREATE POLICY "public_insert_host_section_images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'host-section-images');

CREATE POLICY "public_update_host_section_images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'host-section-images')
  WITH CHECK (bucket_id = 'host-section-images');
