
-- =====================================================
-- SIGNATURE RECIPES STORAGE - FINAL FIX
-- =====================================================
-- This migration fixes the storage bucket policies for signature-recipe-images
-- to match the working configuration of menu-items and announcements buckets
-- =====================================================

-- Step 1: Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-recipe-images', 'signature-recipe-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 2: Drop ALL existing policies for this bucket to start fresh
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname LIKE '%signature-recipe%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
    END LOOP;
END $$;

-- Step 3: Create policies that match the working buckets exactly
-- These policies allow authenticated users to perform all operations

-- INSERT policy - Allow authenticated users to upload
CREATE POLICY "signature-recipe-images: authenticated users can insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signature-recipe-images');

-- SELECT policy - Allow authenticated users to read
CREATE POLICY "signature-recipe-images: authenticated users can select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'signature-recipe-images');

-- UPDATE policy - Allow authenticated users to update
CREATE POLICY "signature-recipe-images: authenticated users can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'signature-recipe-images')
WITH CHECK (bucket_id = 'signature-recipe-images');

-- DELETE policy - Allow authenticated users to delete
CREATE POLICY "signature-recipe-images: authenticated users can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'signature-recipe-images');

-- Step 4: Also add public read access (since bucket is public)
CREATE POLICY "signature-recipe-images: public can select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'signature-recipe-images');

-- Step 5: Verify the policies were created
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname LIKE '%signature-recipe%';
    
    RAISE NOTICE 'Created % policies for signature-recipe-images bucket', policy_count;
END $$;

-- Step 6: Display all policies for verification
SELECT 
    policyname,
    cmd as operation,
    roles,
    CASE 
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as using_clause,
    CASE 
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as with_check_clause
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%signature-recipe%'
ORDER BY policyname;
