
# Signature Recipes Image Upload - Troubleshooting Guide

## Problem Summary
The signature recipes image upload is failing with "new row violates row-level security policy" error, even though other image uploads (menu items, announcements, upcoming events, special features) work correctly.

## Root Cause
The storage bucket RLS policies for `signature-recipe-images` are checking the `users` table and user roles, which causes RLS violations during direct client uploads. The working buckets use simpler policies that only check if the user is authenticated.

## Solution

### Step 1: Run the SQL Fix Script

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `SIGNATURE_RECIPES_IMAGE_UPLOAD_FIX_FINAL.sql`
4. Click "Run" to execute the script

### Step 2: Verify the Fix

After running the script, verify the following:

#### Check Storage Bucket Configuration
```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'signature-recipe-images';
```
Expected result: `public` should be `true`

#### Check Storage Policies
```sql
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
```

Expected result: You should see 4 policies:
- `Public read access for signature recipe images` (SELECT)
- `Authenticated users can upload signature recipe images` (INSERT)
- `Authenticated users can update signature recipe images` (UPDATE)
- `Authenticated users can delete signature recipe images` (DELETE)

All policies should have `roles = 'authenticated'` except the SELECT policy which can be public.

### Step 3: Test Image Upload

1. Open the app
2. Navigate to Signature Recipes Editor (Manager Portal > Manage > Signature Recipes Editor)
3. Try to:
   - Create a new recipe with an image
   - Edit an existing recipe and upload a new image
4. Check the console logs for detailed upload information

## How This Differs from the Previous Fix

The previous fix (`SIGNATURE_RECIPES_FIX_RLS_AND_RPC.sql`) created storage policies that checked the `users` table:

```sql
-- OLD (INCORRECT) POLICY
CREATE POLICY "Managers can upload signature recipe images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signature-recipe-images'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'manager'
    )
  );
```

The new fix uses simpler policies that match the working buckets:

```sql
-- NEW (CORRECT) POLICY
CREATE POLICY "Authenticated users can upload signature recipe images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'signature-recipe-images');
```

## Why the Old Approach Failed

1. **RLS Context**: When uploading directly from the client, the storage RLS policies are evaluated in a context where the `users` table might not be accessible or the subquery might fail.

2. **Complexity**: The subquery to check user roles adds unnecessary complexity and can cause RLS violations.

3. **Inconsistency**: The working buckets (menu-items, announcements) use simple authentication checks, not role-based checks.

## Code Changes

The React Native code has been updated with:

1. **Enhanced Logging**: Detailed console logs throughout the upload process to help debug issues
2. **Session Verification**: Checks for active session before attempting upload
3. **Better Error Handling**: More descriptive error messages
4. **Consistent Pattern**: Matches the upload pattern used in menu-editor.tsx and announcement-editor.tsx

## If the Problem Persists

If you still encounter issues after running the SQL fix:

1. **Check Console Logs**: Look for detailed error messages in the app console
2. **Verify Session**: Ensure the user is logged in and has an active session
3. **Check Bucket Existence**: Verify the `signature-recipe-images` bucket exists
4. **Compare Policies**: Compare the policies with working buckets (menu-items, announcements)
5. **Test Direct Upload**: Try uploading directly via Supabase Dashboard to isolate the issue

## Additional Debugging

Run these queries to compare policies across buckets:

```sql
-- Compare all storage policies
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN policyname LIKE '%menu%' THEN 'menu-items'
    WHEN policyname LIKE '%announcement%' THEN 'announcements'
    WHEN policyname LIKE '%signature recipe%' THEN 'signature-recipe-images'
    ELSE 'other'
  END as bucket_type
FROM pg_policies 
WHERE tablename = 'objects'
AND (
  policyname LIKE '%menu%' 
  OR policyname LIKE '%announcement%' 
  OR policyname LIKE '%signature recipe%'
)
ORDER BY bucket_type, cmd;
```

This will show you all policies side-by-side so you can verify they match.

## Success Indicators

After applying the fix, you should see:

1. ✅ No "row-level security policy" errors in the console
2. ✅ Images upload successfully
3. ✅ Public URLs are generated correctly
4. ✅ Images display in the app
5. ✅ The upload process matches menu items and announcements

## Contact

If you continue to experience issues after following this guide, please provide:
- Console logs from the app
- Results of the verification queries
- Screenshots of any error messages
