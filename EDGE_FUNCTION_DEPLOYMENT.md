
# Edge Function Deployment Guide

## Overview
The feedback submission feature requires a Supabase Edge Function to be deployed. This Edge Function bypasses Row Level Security (RLS) policies to allow employees to submit feedback.

## Prerequisites
1. Supabase CLI installed
2. Supabase project linked to your local environment

## Installation Steps

### Step 1: Install Supabase CLI (if not already installed)

**macOS/Linux:**
```bash
brew install supabase/tap/supabase
```

**Windows:**
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**npm (all platforms):**
```bash
npm install -g supabase
```

### Step 2: Login to Supabase
```bash
npx supabase login
```

This will open a browser window for you to authenticate.

### Step 3: Link Your Project
```bash
npx supabase link --project-ref xvbajqukbakcvdrkcioi
```

You'll be prompted to enter your database password.

### Step 4: Deploy the Edge Function
```bash
npx supabase functions deploy submit-feedback
```

### Step 5: Verify Deployment
After deployment, you should see a success message. You can verify the function is deployed by:

1. Going to your Supabase Dashboard
2. Navigate to Edge Functions
3. Look for "submit-feedback" in the list

## Testing the Function

After deployment, test the feedback submission:

1. Open the app
2. Login as an employee
3. Navigate to Tools
4. Click the "Feedback" button
5. Fill out the form and submit

## Troubleshooting

### Error: "Supabase CLI not found"
- Make sure you've installed the Supabase CLI using one of the methods above
- Restart your terminal after installation

### Error: "Project not linked"
- Run `npx supabase link --project-ref xvbajqukbakcvdrkcioi`
- Enter your database password when prompted

### Error: "Function deployment failed"
- Check that you're in the project root directory
- Verify the function file exists at `supabase/functions/submit-feedback/index.ts`
- Check your internet connection

### Error: "Permission denied"
- Make sure you're logged in: `npx supabase login`
- Verify you have access to the project

## Alternative: Deploy via Supabase Dashboard

If CLI deployment doesn't work, you can deploy via the dashboard:

1. Go to https://supabase.com/dashboard/project/xvbajqukbakcvdrkcioi/functions
2. Click "Create a new function"
3. Name it "submit-feedback"
4. Copy the contents of `supabase/functions/submit-feedback/index.ts`
5. Paste into the editor
6. Click "Deploy"

## Verification

After deployment, check the logs:
```bash
npx supabase functions logs submit-feedback
```

Or view logs in the Supabase Dashboard under Edge Functions > submit-feedback > Logs.
