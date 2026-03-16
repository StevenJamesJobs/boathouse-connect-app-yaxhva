-- Create content_images table for storing multiple images per content item
CREATE TABLE content_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('announcement', 'special_feature', 'upcoming_event')),
  content_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX idx_content_images_lookup ON content_images (content_type, content_id, display_order);

-- RLS policies (public role covers both anon and authenticated)
ALTER TABLE content_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read content images"
  ON content_images FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert content images"
  ON content_images FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update content images"
  ON content_images FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete content images"
  ON content_images FOR DELETE
  USING (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
