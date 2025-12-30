
# Signature Recipes Image Upload - Troubleshooting Guide

## Issue Summary
The signature recipes editor was showing "You must be logged in to upload images" error when trying to upload thumbnails, even though the user was authenticated.

## Root Cause
The issue was caused by:
1. **Incorrect session check**: The `uploadImage` function was explicitly checking for a Supabase session, which was failing
2. **Potential RLS policy misconfiguration**: The storage bucket policies might not have been properly configured

## Solution Applied

### 1. Code Changes
Updated `app/signature-recipes-editor.tsx` to match the working pattern from `menu-editor.tsx` and `announcement-editor.tsx`:

**Key Changes:**
- Removed the explicit session check in the `uploadImage` function
- The authentication is now handled automatically by Supabase's RLS policies
- The upload process now follows the exact same pattern as the working editors

### 2. SQL Migration
Created `SIGNATURE_RECIPES_STORAGE_FIX.sql` to ensure proper storage bucket configuration:

**What it does:**
- Creates/updates the `signature-recipe-images` storage bucket
- Sets the bucket as public (so images can be viewed)
- Creates 4 RLS policies:
  - INSERT: Allows authenticated users to upload
  - SELECT: Allows public to view images
  - UPDATE: Allows authenticated users to update
  - DELETE: Allows authenticated users to delete

## How to Apply the Fix

### Step 1: Run the SQL Migration
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy the contents of `SIGNATURE_RECIPES_STORAGE_FIX.sql`
4. Paste and run the SQL
5. Verify the output shows 4 policies created

### Step 2: Test the Upload
1. Open the app
2. Navigate to Manager Portal → Manage → Signature Recipes Editor
3. Try to add a new recipe or edit an existing one
4. Upload a thumbnail image
5. Save the recipe

### Step 3: Verify the Upload
Check the console logs for:
```
=== STARTING IMAGE UPLOAD FOR SIGNATURE RECIPE ===
Image URI: [uri]
User ID: [user-id]
Reading file as base64...
File read successfully, base64 length: [length]
Converting to byte array...
Byte array created, size: [size]
Generated filename: [timestamp].jpg
Content type: image/jpeg
Uploading to Supabase storage bucket: signature-recipe-images
Upload successful!
Upload data: [data]
Public URL generated: [url]
=== IMAGE UPLOAD COMPLETE ===
```

## Comparison with Working Editors

### Menu Editor (Working)
```typescript
const uploadImage = async (uri: string): Promise<string | null> => {
  try {
    setUploadingImage(true);
    console.log('Starting image upload for menu item');

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // ... convert to byte array ...

    const { data, error } = await supabase.storage
      .from('menu-items')
      .upload(fileName, byteArray, {
        contentType: contentType,
        upsert: false,
      });

    // ... handle response ...
  } catch (error) {
    console.error('Error uploading image:', error);
    Alert.alert('Error', 'Failed to upload image');
    return null;
  } finally {
    setUploadingImage(false);
  }
};
```

### Signature Recipes Editor (Fixed)
Now matches the same pattern - no explicit session check, just direct upload.

## Common Issues and Solutions

### Issue 1: "No active session found"
**Cause:** Explicit session check failing
**Solution:** Removed the session check - authentication is handled by RLS policies

### Issue 2: "Image upload returned null"
**Cause:** Upload failing due to RLS policy issues
**Solution:** Run the SQL migration to fix storage bucket policies

### Issue 3: Images not displaying after upload
**Cause:** Bucket not set to public
**Solution:** SQL migration sets `public = true` on the bucket

### Issue 4: "Policy violation" errors
**Cause:** Missing or incorrect RLS policies
**Solution:** SQL migration creates all 4 required policies

## Verification Checklist

- [ ] SQL migration ran successfully
- [ ] 4 RLS policies created for signature-recipe-images
- [ ] Storage bucket is set to public
- [ ] Can upload images without authentication errors
- [ ] Uploaded images display correctly in the editor
- [ ] Uploaded images display correctly on the employee-facing page
- [ ] Can update existing recipe thumbnails
- [ ] Can delete recipes with thumbnails

## Storage Bucket Comparison

### Menu Items Bucket (Working)
- Bucket ID: `menu-items`
- Public: `true`
- RLS Policies: 4 (INSERT, SELECT, UPDATE, DELETE)

### Announcements Bucket (Working)
- Bucket ID: `announcements`
- Public: `true`
- RLS Policies: 4 (INSERT, SELECT, UPDATE, DELETE)

### Signature Recipe Images Bucket (Fixed)
- Bucket ID: `signature-recipe-images`
- Public: `true`
- RLS Policies: 4 (INSERT, SELECT, UPDATE, DELETE)

## Testing Scenarios

### Test 1: Create New Recipe with Image
1. Click "Add New Recipe"
2. Fill in required fields (Name, Price)
3. Upload a thumbnail image
4. Save
5. Verify image appears in the recipe card

### Test 2: Update Existing Recipe Image
1. Click "Edit" on an existing recipe
2. Upload a new thumbnail image
3. Save
4. Verify new image appears in the recipe card

### Test 3: Create Recipe Without Image
1. Click "Add New Recipe"
2. Fill in required fields (Name, Price)
3. Do NOT upload an image
4. Save
5. Verify recipe is created without errors

### Test 4: Remove Image from Recipe
1. Click "Edit" on a recipe with an image
2. Click "Remove Selected Image"
3. Save
4. Verify recipe is updated without image

## Expected Behavior

### Before Fix
- ❌ "No active session found" error in console
- ❌ "You must be logged in to upload images" alert
- ❌ "Image upload returned null" error
- ❌ Recipe saved without thumbnail

### After Fix
- ✅ No authentication errors
- ✅ Image uploads successfully
- ✅ Public URL generated
- ✅ Recipe saved with thumbnail
- ✅ Thumbnail displays in editor and employee view

## Additional Notes

### Why This Works
The fix works because:
1. **Supabase handles authentication automatically**: When you use the Supabase client, it automatically includes the user's authentication token in requests
2. **RLS policies enforce security**: The storage bucket policies check if the user is authenticated before allowing uploads
3. **No explicit session check needed**: The session check was redundant and causing issues

### Consistency Across Editors
All editors now follow the same pattern:
- Menu Editor ✅
- Announcement Editor ✅
- Upcoming Events Editor ✅
- Special Features Editor ✅
- Signature Recipes Editor ✅ (Fixed)

## Support

If you continue to experience issues:
1. Check the console logs for detailed error messages
2. Verify the SQL migration ran successfully
3. Check that the user is logged in (user ID should be present)
4. Verify the storage bucket exists in Supabase Dashboard
5. Check the RLS policies in Supabase Dashboard → Storage → Policies

## Summary

The signature recipes image upload now works exactly like the menu items, announcements, upcoming events, and special features editors. The authentication is handled automatically by Supabase's RLS policies, and there's no need for explicit session checks in the code.
