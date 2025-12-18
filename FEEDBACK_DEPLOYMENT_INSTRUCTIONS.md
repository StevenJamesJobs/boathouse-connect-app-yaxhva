
# Feedback System Deployment Instructions

## Problem Summary
Employees are getting "42501" RLS policy violation errors when trying to submit feedback. This is because the Row Level Security (RLS) policies on the `feedback` table are not configured correctly.

## Solution Overview
We're implementing a two-part solution:

1. **Supabase Edge Function**: A serverless function that handles feedback submissions with elevated privileges (bypasses RLS)
2. **Updated Frontend**: Modified the employee tools page to use the Edge Function instead of direct database inserts
3. **Fixed RLS Policies**: Simplified and corrected RLS policies as a backup

## Deployment Steps

### Step 1: Deploy the Supabase Edge Function

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project**:
   ```bash
   supabase link --project-ref xvbajqukbakcvdrkcioi
   ```

4. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy submit-feedback
   ```

   The function is located at: `supabase/functions/submit-feedback/index.ts`

5. **Verify deployment**:
   - Go to your Supabase Dashboard
   - Navigate to Edge Functions
   - You should see "submit-feedback" listed

### Step 2: Run the SQL Migration

1. **Open Supabase SQL Editor**:
   - Go to https://supabase.com/dashboard/project/xvbajqukbakcvdrkcioi
   - Click on "SQL Editor" in the left sidebar

2. **Run the migration**:
   - Open the file `FEEDBACK_FIX_MIGRATION.sql`
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click "Run" to execute

3. **Verify the migration**:
   - The SQL includes verification queries at the end
   - Check that all policies are created correctly
   - You should see 4 policies:
     - `authenticated_users_can_insert_feedback`
     - `managers_can_view_all_feedback`
     - `users_can_view_own_feedback`
     - `managers_can_update_feedback`

### Step 3: Test the Feedback System

1. **Test as an Employee**:
   - Log in as an employee (not a manager)
   - Go to the Tools page
   - Click the "Feedback" button
   - Fill out the form with:
     - Title: "Test Feedback"
     - Description: "This is a test to verify the feedback system works"
   - Click "Submit Feedback"
   - You should see a success message

2. **Test as a Manager**:
   - Log in as a manager
   - Go to the Messages page
   - Click on the "Feedback" tab
   - You should see the test feedback you just submitted
   - Try deleting the feedback to verify that works too

### Step 4: Monitor for Issues

1. **Check Edge Function Logs**:
   - In Supabase Dashboard, go to Edge Functions
   - Click on "submit-feedback"
   - Click on "Logs" to see execution logs
   - Look for any errors

2. **Check App Logs**:
   - In your development environment, watch the console
   - Look for the log messages that start with "=== FEEDBACK SUBMISSION"
   - Verify there are no errors

## How It Works

### Edge Function Approach (Primary Solution)
- When an employee submits feedback, the app calls the Edge Function
- The Edge Function uses the Supabase Service Role Key (which has admin privileges)
- This bypasses RLS policies entirely
- The function still verifies the user is authenticated before inserting
- This is the most reliable approach

### RLS Policies (Backup Solution)
- The simplified RLS policies allow ANY authenticated user to insert feedback
- This is more permissive but still secure (users must be logged in)
- Managers can view all feedback
- Users can view their own feedback
- Only managers can update/delete feedback

## Troubleshooting

### If Edge Function deployment fails:
1. Make sure you're logged into Supabase CLI
2. Verify your project is linked correctly
3. Check that the function file exists at `supabase/functions/submit-feedback/index.ts`

### If feedback submission still fails:
1. Check the Edge Function logs in Supabase Dashboard
2. Verify the user is authenticated (check session in app)
3. Try running the SQL migration again
4. Check that the `users` table has the correct user data

### If managers can't see feedback:
1. Verify the manager's role is set to 'manager' in the users table
2. Check the RLS policies are created correctly
3. Try refreshing the Feedback tab

## Alternative: Direct Database Insert (If Edge Function Can't Be Used)

If you cannot deploy Edge Functions, the updated RLS policies in `FEEDBACK_FIX_MIGRATION.sql` should allow direct database inserts to work. The key change is the policy:

```sql
CREATE POLICY "authenticated_users_can_insert_feedback"
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

This allows ANY authenticated user to insert feedback, which should resolve the permission errors.

## Support

If you continue to experience issues after following these steps:

1. Check the console logs in the app for detailed error messages
2. Check the Supabase Dashboard logs
3. Verify all migration steps completed successfully
4. Ensure the Edge Function is deployed and active

The Edge Function approach is the most robust solution and should resolve all permission issues permanently.
