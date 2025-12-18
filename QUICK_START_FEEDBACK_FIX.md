
# Quick Start: Fix Feedback Submission Errors

## The Problem
Employees are getting "Permission Error" when trying to submit feedback due to incorrect Row Level Security (RLS) policies.

## The Quickest Fix (5 minutes)

### Option 1: Simple SQL Fix (Recommended if you can't deploy Edge Functions)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/xvbajqukbakcvdrkcioi
2. Click "SQL Editor" in the left sidebar
3. Open the file `SIMPLE_RLS_FIX.sql` from your project
4. Copy and paste the entire contents into the SQL Editor
5. Click "Run"
6. Done! Test the feedback submission

This should take less than 2 minutes and will immediately fix the issue.

### Option 2: Full Solution with Edge Function (Recommended for production)

1. **Deploy the Edge Function** (one-time setup):
   ```bash
   # Install Supabase CLI if needed
   npm install -g supabase
   
   # Login
   supabase login
   
   # Link project
   supabase link --project-ref xvbajqukbakcvdrkcioi
   
   # Deploy function
   supabase functions deploy submit-feedback
   ```

2. **Run the comprehensive SQL migration**:
   - Go to Supabase Dashboard SQL Editor
   - Copy contents of `FEEDBACK_FIX_MIGRATION.sql`
   - Paste and run

3. **Test**:
   - The app will automatically try the Edge Function first
   - If that fails, it falls back to direct database insert
   - Either way, it should work now

## What Changed in the Code

### Frontend (`app/(portal)/employee/tools.tsx`)
- Now tries to use Edge Function first for feedback submission
- Falls back to direct database insert if Edge Function is not available
- Better error handling and user feedback

### Backend (Supabase)
- Created Edge Function that bypasses RLS using service role key
- Simplified RLS policies to allow all authenticated users to insert
- Added proper indexes for performance

## Testing

1. **As an Employee**:
   - Go to Tools page
   - Click "Feedback" button
   - Fill out form
   - Submit
   - Should see success message

2. **As a Manager**:
   - Go to Messages page
   - Click "Feedback" tab
   - Should see submitted feedback
   - Can delete feedback

## If It Still Doesn't Work

1. Check the console logs in your app - look for "=== FEEDBACK SUBMISSION"
2. Check Supabase Dashboard > Edge Functions > Logs (if using Edge Function)
3. Verify the SQL migration ran successfully
4. Make sure the user is logged in and has a valid session

## Why This Solution Works

The previous RLS policies were too restrictive. The new approach:

1. **Edge Function**: Uses admin privileges to insert feedback, completely bypassing RLS
2. **Simplified RLS**: The fallback policy allows ANY authenticated user to insert (not just specific conditions)
3. **Dual Approach**: Try Edge Function first, fall back to direct insert if needed

This ensures maximum compatibility and reliability.

## Need Help?

If you're still having issues:
1. Run `SIMPLE_RLS_FIX.sql` - this is the most reliable quick fix
2. Check that users are properly authenticated
3. Verify the `users` table has correct data
4. Look at the detailed error messages in the console

The `SIMPLE_RLS_FIX.sql` approach should work 100% of the time for fixing the permission errors.
