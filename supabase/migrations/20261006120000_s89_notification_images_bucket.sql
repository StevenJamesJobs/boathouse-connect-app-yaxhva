-- s89 (D1): a private bucket for the optional photo on a general notification
-- (Notification Center → shade row + detail Poster; Android push thumbnail).
-- Writes go through the storage-broker (purpose notification_image, managers);
-- reads are broker sign-reads. No storage.objects policies: RLS-on/zero-policies
-- is the b4a lockdown contract (service-role broker only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'notification-images', 'notification-images', false, 10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
