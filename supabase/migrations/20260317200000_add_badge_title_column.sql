-- Add optional badge_title column for custom role badge display
-- The 'role' column remains unchanged for authentication/authorization
-- badge_title is purely cosmetic (e.g., "General Manager" instead of "Manager")
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_title TEXT;

-- Set Deanna McBain (username 6956) as General Manager
UPDATE users SET badge_title = 'General Manager' WHERE username = '6956';
