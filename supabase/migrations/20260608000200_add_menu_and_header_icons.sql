-- Customizable menu + header icons (build checklist D2 / D2b).
-- Each org can choose an icon for Menu 1, Menu 2, and the portal header brand.
-- Values are iOS SF Symbol names; the app maps them to Android MaterialIcons
-- (see constants/menuIcons.ts + components/IconSymbol.tsx ICON_MAP).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS menu_1_icon TEXT NOT NULL DEFAULT 'snowflake',
  ADD COLUMN IF NOT EXISTS menu_2_icon TEXT NOT NULL DEFAULT 'sun.max.fill',
  ADD COLUMN IF NOT EXISTS header_icon TEXT NOT NULL DEFAULT 'fork.knife';

-- McLoone's keeps its original sailboat header mark. All other orgs get the
-- neutral 'fork.knife' default (applied automatically by the column default).
UPDATE organizations
  SET header_icon = 'sailboat.fill'
  WHERE slug = 'mcloones-boathouse';
