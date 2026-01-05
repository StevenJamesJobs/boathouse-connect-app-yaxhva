
# Profile Picture Upload Fix

## Issue
Profile pictures upload to storage but don't persist in the database `profile_picture_url` column.

## Root Cause
The `uploadImage()` function uploads to storage and sets local state, but `handleSaveChanges()` doesn't properly save the URL to the database.

## Fix Required in Both Files:
- `app/(portal)/employee/profile.tsx`
- `app/(portal)/manager/profile.tsx`

### Changes Needed:

1. **In `uploadImage()` function**:
```typescript
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('profile-pictures')
  .upload(fileName, fileData, { contentType: 'image/jpeg', upsert: true });

if (uploadError) throw uploadError;

const publicUrl = `${supabase.storage.from('profile-pictures').getPublicUrl(fileName).data.publicUrl}`;

// Save to database immediately
const { error: updateError } = await supabase
  .from('users')
  .update({ profile_picture_url: publicUrl })
  .eq('id', user.id)
  .select();

if (updateError) throw updateError;

setProfilePictureUrl(publicUrl);
```

2. **In `handleSaveChanges()` function**:
```typescript
const { data, error } = await supabase
  .from('users')
  .update({
    email: email,
    phone_number: phoneNumber,
    profile_picture_url: profilePictureUrl // Include this
  })
  .eq('id', user.id)
  .select(); // Add .select() to return updated data

if (error) throw error;

// Update local state with returned data
if (data && data[0]) {
  setProfilePictureUrl(data[0].profile_picture_url);
}
```

3. **In `loadProfile()` function**:
Ensure it fetches `profile_picture_url` from database:
```typescript
const { data, error } = await supabase
  .from('users')
  .select('name, email, phone_number, job_titles, role, profile_picture_url')
  .eq('id', user.id)
  .single();
```
