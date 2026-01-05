
-- Fix RLS policies for cocktails table to allow manager CRUD operations

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Managers can insert cocktails" ON cocktails;
DROP POLICY IF EXISTS "Managers can update cocktails" ON cocktails;
DROP POLICY IF EXISTS "Managers can delete cocktails" ON cocktails;
DROP POLICY IF EXISTS "Everyone can view active cocktails" ON cocktails;

-- Allow everyone to view active cocktails
CREATE POLICY "Everyone can view active cocktails"
ON cocktails FOR SELECT
TO authenticated
USING (is_active = true OR EXISTS (
  SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager'
));

-- Allow managers to insert cocktails
CREATE POLICY "Managers can insert cocktails"
ON cocktails FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager'
));

-- Allow managers to update cocktails
CREATE POLICY "Managers can update cocktails"
ON cocktails FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager'
));

-- Allow managers to delete cocktails
CREATE POLICY "Managers can delete cocktails"
ON cocktails FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager'
));

-- Fix storage bucket policies for cocktail-images
INSERT INTO storage.buckets (id, name, public)
VALUES ('cocktail-images', 'cocktail-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies
DROP POLICY IF EXISTS "Managers can upload cocktail images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view cocktail images" ON storage.objects;

-- Allow managers to upload to cocktail-images bucket
CREATE POLICY "Managers can upload cocktail images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cocktail-images' AND
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager')
);

-- Allow managers to update cocktail images
CREATE POLICY "Managers can update cocktail images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cocktail-images' AND
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager')
);

-- Allow managers to delete cocktail images
CREATE POLICY "Managers can delete cocktail images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cocktail-images' AND
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'manager')
);

-- Allow public to view cocktail images
CREATE POLICY "Public can view cocktail images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'cocktail-images');
