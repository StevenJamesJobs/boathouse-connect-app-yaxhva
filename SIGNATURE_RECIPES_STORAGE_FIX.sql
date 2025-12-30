
-- =====================================================
-- SIGNATURE RECIPES STORAGE BUCKET FIX
-- =====================================================
-- This migration fixes the storage bucket configuration and RLS policies
-- for signature recipe image uploads.
--
-- Run this in the Supabase SQL Editor to fix the authentication issue.
-- =====================================================

-- Step 1: Ensure the storage bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signature-recipe-images',
  'signature-recipe-images',
  true,  -- Make bucket public so images can be viewed
  5242880,  -- 5MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- Step 2: Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Authenticated users can upload signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to signature-recipe-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from signature-recipe-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to signature-recipe-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from signature-recipe-images" ON storage.objects;

-- Step 3: Create new RLS policies for the signature-recipe-images bucket
-- These policies match the working patterns from menu-items and announcements buckets

-- Allow authenticated users to INSERT (upload) images
CREATE POLICY "Allow authenticated uploads to signature-recipe-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signature-recipe-images');

-- Allow public to SELECT (view) images
CREATE POLICY "Allow public reads from signature-recipe-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'signature-recipe-images');

-- Allow authenticated users to UPDATE images
CREATE POLICY "Allow authenticated updates to signature-recipe-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'signature-recipe-images')
WITH CHECK (bucket_id = 'signature-recipe-images');

-- Allow authenticated users to DELETE images
CREATE POLICY "Allow authenticated deletes from signature-recipe-images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'signature-recipe-images');

-- Step 4: Verify the policies were created successfully
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE tablename = 'objects' 
  AND policyname LIKE '%signature-recipe-images%'
ORDER BY policyname;

-- Step 5: Verify the bucket configuration
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'signature-recipe-images';

-- =====================================================
-- EXPECTED OUTPUT:
-- =====================================================
-- You should see 4 policies created:
-- 1. Allow authenticated uploads to signature-recipe-images (INSERT)
-- 2. Allow public reads from signature-recipe-images (SELECT)
-- 3. Allow authenticated updates to signature-recipe-images (UPDATE)
-- 4. Allow authenticated deletes from signature-recipe-images (DELETE)
--
-- The bucket should show:
-- - public: true
-- - file_size_limit: 5242880
-- - allowed_mime_types: {image/jpeg, image/jpg, image/png, image/gif, image/webp}
-- =====================================================
