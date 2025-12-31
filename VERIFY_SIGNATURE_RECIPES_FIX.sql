
-- =====================================================
-- VERIFICATION SCRIPT FOR SIGNATURE RECIPES FIX
-- =====================================================
-- Run this script to verify that the signature recipes
-- storage policies are correctly configured
-- =====================================================

-- 1. Check storage policies for signature-recipe-images bucket
SELECT 
    '=== STORAGE POLICIES FOR SIGNATURE-RECIPE-IMAGES ===' as section,
    policyname, 
    cmd as command, 
    roles,
    CASE 
        WHEN roles = '{public}' THEN '✅ CORRECT'
        ELSE '❌ INCORRECT - Should be {public}'
    END as status
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND (policyname LIKE '%signature-recipe%' OR policyname LIKE '%signature recipe%')
ORDER BY cmd, policyname;

-- 2. Verify all 4 required policies exist
SELECT 
    '=== POLICY COUNT CHECK ===' as section,
    COUNT(*) as policy_count,
    CASE 
        WHEN COUNT(*) = 4 THEN '✅ CORRECT - All 4 policies exist (INSERT, UPDATE, DELETE, SELECT)'
        ELSE '❌ INCORRECT - Should have exactly 4 policies'
    END as status
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND (policyname LIKE '%signature-recipe%' OR policyname LIKE '%signature recipe%');

-- 3. Check RPC functions for signature recipes
SELECT 
    '=== RPC FUNCTIONS CHECK ===' as section,
    p.proname as function_name,
    CASE 
        WHEN p.prosecdef THEN '✅ SECURITY DEFINER'
        ELSE '❌ NOT SECURITY DEFINER'
    END as security_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('create_signature_recipe', 'update_signature_recipe', 'delete_signature_recipe')
ORDER BY p.proname;

-- 4. Compare with working editors (menu-items and announcements)
SELECT 
    '=== COMPARISON WITH WORKING EDITORS ===' as section,
    CASE 
        WHEN policyname LIKE '%menu-items%' THEN 'menu-items'
        WHEN policyname LIKE '%announcements%' THEN 'announcements'
        WHEN policyname LIKE '%signature-recipe%' THEN 'signature-recipe-images'
    END as bucket,
    cmd as command,
    roles,
    CASE 
        WHEN roles = '{public}' THEN '✅ Consistent'
        ELSE '❌ Inconsistent'
    END as consistency
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND (
    policyname LIKE '%menu-items%' 
    OR policyname LIKE '%announcements%' 
    OR policyname LIKE '%signature-recipe%'
)
AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT')
ORDER BY bucket, cmd;

-- 5. Check signature_recipes table structure
SELECT 
    '=== SIGNATURE_RECIPES TABLE CHECK ===' as section,
    column_name,
    data_type,
    CASE 
        WHEN column_name = 'thumbnail_url' AND data_type = 'text' THEN '✅ CORRECT'
        WHEN column_name = 'ingredients' AND data_type = 'text' THEN '✅ CORRECT (stores JSONB as text)'
        WHEN column_name = 'created_by' AND data_type = 'uuid' THEN '✅ CORRECT'
        ELSE '✅ OK'
    END as status
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'signature_recipes'
AND column_name IN ('id', 'name', 'price', 'thumbnail_url', 'ingredients', 'created_by')
ORDER BY ordinal_position;

-- =====================================================
-- EXPECTED RESULTS
-- =====================================================
-- 
-- Section 1: Should show 4 policies, all with {public} role
-- Section 2: Should show policy_count = 4 with ✅ status
-- Section 3: Should show all 3 RPC functions with ✅ SECURITY DEFINER
-- Section 4: Should show all buckets with {public} role and ✅ Consistent
-- Section 5: Should show all columns with ✅ status
--
-- If all checks pass, the signature recipes editor is correctly configured!
-- =====================================================
