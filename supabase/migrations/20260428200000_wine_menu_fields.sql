-- Session 19 follow-up: Structured fields for wine menu items
--
-- Wines have historically had origin + multi-tier prices crammed into the
-- description field, which pollutes auto-generated quiz/game questions.
-- New columns let managers enter location + 3 prices as first-class fields.
-- The legacy `price` column stays untouched for non-wines; wines may leave
-- it empty going forward (UI will hide it for wine cards).

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS location_es TEXT,
  ADD COLUMN IF NOT EXISTS glass_price TEXT,
  ADD COLUMN IF NOT EXISTS bottle_price TEXT,
  ADD COLUMN IF NOT EXISTS member_bottle_price TEXT;

-- Recreate create_menu_item with the 4 new optional params at the tail.
-- Existing callers that pass only the original 15 params still work because
-- the new params default to NULL.
CREATE OR REPLACE FUNCTION public.create_menu_item(
  p_user_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_price TEXT,
  p_category TEXT,
  p_subcategory TEXT,
  p_available_for_lunch BOOLEAN,
  p_available_for_dinner BOOLEAN,
  p_is_gluten_free BOOLEAN,
  p_is_gluten_free_available BOOLEAN,
  p_is_vegetarian BOOLEAN,
  p_is_vegetarian_available BOOLEAN,
  p_thumbnail_url TEXT,
  p_thumbnail_shape TEXT,
  p_display_order INTEGER DEFAULT 0,
  p_location TEXT DEFAULT NULL,
  p_glass_price TEXT DEFAULT NULL,
  p_bottle_price TEXT DEFAULT NULL,
  p_member_bottle_price TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
  v_menu_item_id UUID;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;

  IF v_user_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can create menu items';
  END IF;

  INSERT INTO menu_items (
    name, description, price, category, subcategory,
    available_for_lunch, available_for_dinner,
    is_gluten_free, is_gluten_free_available,
    is_vegetarian, is_vegetarian_available,
    thumbnail_url, thumbnail_shape, display_order, created_by,
    location, glass_price, bottle_price, member_bottle_price
  ) VALUES (
    p_name, p_description, p_price, p_category, p_subcategory,
    p_available_for_lunch, p_available_for_dinner,
    p_is_gluten_free, p_is_gluten_free_available,
    p_is_vegetarian, p_is_vegetarian_available,
    p_thumbnail_url, p_thumbnail_shape, p_display_order, p_user_id,
    p_location, p_glass_price, p_bottle_price, p_member_bottle_price
  )
  RETURNING id INTO v_menu_item_id;

  RETURN v_menu_item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_menu_item(
  p_user_id UUID,
  p_menu_item_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_price TEXT,
  p_category TEXT,
  p_subcategory TEXT,
  p_available_for_lunch BOOLEAN,
  p_available_for_dinner BOOLEAN,
  p_is_gluten_free BOOLEAN,
  p_is_gluten_free_available BOOLEAN,
  p_is_vegetarian BOOLEAN,
  p_is_vegetarian_available BOOLEAN,
  p_thumbnail_url TEXT,
  p_thumbnail_shape TEXT,
  p_display_order INTEGER DEFAULT 0,
  p_location TEXT DEFAULT NULL,
  p_glass_price TEXT DEFAULT NULL,
  p_bottle_price TEXT DEFAULT NULL,
  p_member_bottle_price TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;

  IF v_user_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can update menu items';
  END IF;

  UPDATE menu_items
  SET
    name = p_name,
    description = p_description,
    price = p_price,
    category = p_category,
    subcategory = p_subcategory,
    available_for_lunch = p_available_for_lunch,
    available_for_dinner = p_available_for_dinner,
    is_gluten_free = p_is_gluten_free,
    is_gluten_free_available = p_is_gluten_free_available,
    is_vegetarian = p_is_vegetarian,
    is_vegetarian_available = p_is_vegetarian_available,
    thumbnail_url = p_thumbnail_url,
    thumbnail_shape = p_thumbnail_shape,
    display_order = p_display_order,
    location = p_location,
    glass_price = p_glass_price,
    bottle_price = p_bottle_price,
    member_bottle_price = p_member_bottle_price,
    updated_at = NOW()
  WHERE id = p_menu_item_id;
END;
$function$;
