-- D4 follow-up: drop the obsolete category enum CHECK constraint.
--
-- menu_items_category_check restricted `category` to the original 6 hardcoded
-- names (Lunch/Dinner/Libations/Wine/Happy Hour/Weekly Specials). Now that
-- categories are owner-editable (per-org menu_categories table) and validated by
-- the manage_menu_* RPCs, this enum check blocks the rename cascade
-- (UPDATE menu_items SET category = <new name>) whenever the category has items.
-- Remove it. The thumbnail_shape check is unrelated and stays.

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_check;
