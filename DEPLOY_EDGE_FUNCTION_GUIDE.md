
# How to Deploy the Supabase Edge Function

## What is a Terminal?

A **terminal** (also called Command Prompt on Windows or Terminal on Mac/Linux) is a text-based interface where you can type commands to interact with your computer.

### How to Open the Terminal:

**On Mac:**
1. Press `Command + Space` to open Spotlight
2. Type "Terminal" and press Enter
3. A window with a black or white background will open

**On Windows:**
1. Press `Windows Key + R`
2. Type "cmd" and press Enter
3. A black window will open (Command Prompt)

**Alternative for Windows:**
1. Press `Windows Key`
2. Type "PowerShell" and press Enter
3. A blue window will open

## Step-by-Step Deployment Instructions

### Step 1: Install Supabase CLI (One-time setup)

First, you need to install the Supabase Command Line Interface (CLI). This is a tool that lets you interact with Supabase from your computer.

**In your terminal, type this command and press Enter:**

```bash
npm install -g supabase
```

Wait for it to finish installing. You'll see some text scrolling by, and when it's done, you'll see a new prompt line.

### Step 2: Navigate to Your Project Folder

You need to tell the terminal where your project is located. Use the `cd` (change directory) command.

**Example:**
If your project is in a folder called "McLoonesBoathouseConnect" on your Desktop:

**On Mac:**
```bash
cd ~/Desktop/McLoonesBoathouseConnect
```

**On Windows:**
```bash
cd C:\Users\YourUsername\Desktop\McLoonesBoathouseConnect
```

Replace "YourUsername" with your actual Windows username.

**Tip:** You can also drag and drop the project folder into the terminal window, and it will automatically type the path for you!

### Step 3: Login to Supabase

Now you need to authenticate with Supabase:

```bash
supabase login
```

This will open a browser window asking you to authorize the CLI. Click "Authorize" and then return to your terminal.

### Step 4: Link Your Project

Link your local project to your Supabase project:

```bash
supabase link --project-ref xvbajqukbakcvdrkcioi
```

You'll be asked to enter your database password. This is the password you set when you created your Supabase project.

### Step 5: Deploy the Edge Function

Finally, deploy the Edge Function:

```bash
supabase functions deploy submit-feedback
```

This will upload your Edge Function to Supabase and make it available for your app to use.

### Step 6: Verify Deployment

After deployment, you should see a success message like:

```
Deployed Function submit-feedback on project xvbajqukbakcvdrkcioi
```

## Testing the Feedback Form

Once deployed, go back to your app and try submitting feedback again. It should now work without any permission errors!

## Troubleshooting

### "Command not found: supabase"

This means the Supabase CLI wasn't installed correctly. Try:

1. Close and reopen your terminal
2. Run the install command again: `npm install -g supabase`
3. If that doesn't work, try: `npm install -g @supabase/cli`

### "Not logged in"

Run `supabase login` again and make sure to authorize in the browser window that opens.

### "Project not linked"

Make sure you ran the `supabase link` command with the correct project reference.

### Still having issues?

Make sure you're in the correct project directory. You can check by running:

```bash
pwd
```

This will show you the current directory path. Make sure it matches your project location.

## What This Does

The Edge Function acts as a secure intermediary between your app and the database. It:

1. Verifies the user is authenticated
2. Uses elevated permissions to insert feedback into the database
3. Bypasses Row Level Security (RLS) policies that were causing permission errors
4. Returns a success or error message to your app

This is a common pattern when you need to perform database operations that require special permissions.
