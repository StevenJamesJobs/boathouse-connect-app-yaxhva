
-- =====================================================
-- STORAGE POLICIES VERIFICATION SCRIPT
-- =====================================================
-- Run this script to compare policies across all storage buckets
-- =====================================================

-- 1. List all storage buckets
SELECT 
    id,
    name,
    public,
    created_at
FROM storage.buckets
ORDER BY name;

-- 2. Compare policies for menu-items (WORKING)
SELECT 
    'menu-items' as bucket,
    policyname,
    cmd as operation,
    roles,
    permissive
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%menu-item%'
ORDER BY policyname;

-- 3. Compare policies for announcements (WORKING)
SELECT 
    'announcements' as bucket,
    policyname,
    cmd as operation,
    roles,
    permissive
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%announcement%'
ORDER BY policyname;

-- 4. Compare policies for signature-recipe-images (NOT WORKING)
SELECT 
    'signature-recipe-images' as bucket,
    policyname,
    cmd as operation,
    roles,
    permissive
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%signature-recipe%'
ORDER BY policyname;

-- 5. Check if there are any conflicting policies
SELECT 
    policyname,
    cmd,
    roles,
    qual::text as using_clause,
    with_check::text as with_check_clause
FROM pg_policies 
WHERE tablename = 'objects' 
AND (
    policyname LIKE '%signature-recipe%'
    OR (qual::text LIKE '%signature-recipe%' OR with_check::text LIKE '%signature-recipe%')
)
ORDER BY policyname;

-- 6. Count policies per bucket
SELECT 
    CASE 
        WHEN policyname LIKE '%menu-item%' THEN 'menu-items'
        WHEN policyname LIKE '%announcement%' THEN 'announcements'
        WHEN policyname LIKE '%signature-recipe%' THEN 'signature-recipe-images'
        ELSE 'other'
    END as bucket,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename = 'objects'
GROUP BY bucket
ORDER BY bucket;
