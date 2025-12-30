
-- =====================================================
-- FIX SIGNATURE RECIPES IMAGE UPLOAD - FINAL SOLUTION
-- =====================================================
-- This migration fixes the storage bucket RLS policies to match
-- the working implementation used in menu-items and announcements
-- 
-- INSTRUCTIONS:
-- 1. Copy this entire SQL script
-- 2. Go to Supabase Dashboard > SQL Editor
-- 3. Paste and run this script
-- 4. Test image upload in the app
-- =====================================================

-- Step 1: Drop all existing storage policies for signature-recipe-images
DROP POLICY IF EXISTS "Anyone can view signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can delete signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete signature recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for signature recipe images" ON storage.objects;

-- Step 2: Create PUBLIC storage policies (matching menu-items and announcements)
-- These policies allow authenticated users to upload without checking the users table

-- Allow anyone to view images (public read)
CREATE POLICY "Public read access for signature recipe images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signature-recipe-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload signature recipe images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'signature-recipe-images');

-- Allow authenticated users to update their uploaded images
CREATE POLICY "Authenticated users can update signature recipe images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'signature-recipe-images')
  WITH CHECK (bucket_id = 'signature-recipe-images');

-- Allow authenticated users to delete images
CREATE POLICY "Authenticated users can delete signature recipe images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'signature-recipe-images');

-- Step 3: Ensure the bucket is public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'signature-recipe-images';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries after the migration to verify everything worked:

-- 1. Check storage bucket configuration
SELECT id, name, public FROM storage.buckets WHERE id = 'signature-recipe-images';

-- 2. Check storage policies for signature-recipe-images
SELECT 
  policyname, 
  cmd as operation,
  CASE 
    WHEN roles = '{authenticated}' THEN 'authenticated'
    WHEN roles = '{public}' THEN 'public'
    ELSE roles::text
  END as roles
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%signature recipe%'
ORDER BY policyname;

-- 3. Compare with working menu-items policies (for reference)
SELECT 
  policyname, 
  cmd as operation,
  CASE 
    WHEN roles = '{authenticated}' THEN 'authenticated'
    WHEN roles = '{public}' THEN 'public'
    ELSE roles::text
  END as roles
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%menu%'
ORDER BY policyname;

-- =====================================================
-- EXPECTED RESULTS
-- =====================================================
-- After running this script, you should see:
-- 
-- 1. Bucket 'signature-recipe-images' with public = true
-- 
-- 2. Four policies for signature-recipe-images:
--    - Public read access for signature recipe images (SELECT)
--    - Authenticated users can upload signature recipe images (INSERT)
--    - Authenticated users can update signature recipe images (UPDATE)
--    - Authenticated users can delete signature recipe images (DELETE)
--
-- 3. These policies should match the pattern used by menu-items and announcements
-- =====================================================
