-- Add Spanish translation columns to dynamic content tables
-- These columns store auto-translated (or manually edited) Spanish versions
-- of user-generated content. All nullable — English is the primary/fallback.

-- Announcements
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS content_es TEXT;

-- Special Features
ALTER TABLE special_features ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE special_features ADD COLUMN IF NOT EXISTS content_es TEXT;

-- Upcoming Events
ALTER TABLE upcoming_events ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE upcoming_events ADD COLUMN IF NOT EXISTS content_es TEXT;

-- Menu Items
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS name_es TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description_es TEXT;
