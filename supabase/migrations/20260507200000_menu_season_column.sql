-- Session 26: Add season column for Winter/Summer menu switching.
-- Values: 'both' (shared), 'winter' (winter-only), 'summer' (summer-only).
-- Existing items default to 'both'; seed data marks winter-only and creates summer items.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS season TEXT NOT NULL DEFAULT 'both';
CREATE INDEX IF NOT EXISTS idx_menu_items_season ON menu_items(season);

-- Recreate create_menu_item with p_season at the tail.
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
  p_member_bottle_price TEXT DEFAULT NULL,
  p_flavor_profile TEXT DEFAULT NULL,
  p_flavor_profile_es TEXT DEFAULT NULL,
  p_unique_selling_points TEXT DEFAULT NULL,
  p_unique_selling_points_es TEXT DEFAULT NULL,
  p_season TEXT DEFAULT 'both'
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
    location, glass_price, bottle_price, member_bottle_price,
    flavor_profile, flavor_profile_es,
    unique_selling_points, unique_selling_points_es,
    season
  ) VALUES (
    p_name, p_description, p_price, p_category, p_subcategory,
    p_available_for_lunch, p_available_for_dinner,
    p_is_gluten_free, p_is_gluten_free_available,
    p_is_vegetarian, p_is_vegetarian_available,
    p_thumbnail_url, p_thumbnail_shape, p_display_order, p_user_id,
    p_location, p_glass_price, p_bottle_price, p_member_bottle_price,
    p_flavor_profile, p_flavor_profile_es,
    p_unique_selling_points, p_unique_selling_points_es,
    p_season
  )
  RETURNING id INTO v_menu_item_id;

  RETURN v_menu_item_id;
END;
$function$;

-- Recreate update_menu_item with p_season at the tail.
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
  p_member_bottle_price TEXT DEFAULT NULL,
  p_flavor_profile TEXT DEFAULT NULL,
  p_flavor_profile_es TEXT DEFAULT NULL,
  p_unique_selling_points TEXT DEFAULT NULL,
  p_unique_selling_points_es TEXT DEFAULT NULL,
  p_season TEXT DEFAULT 'both'
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
    flavor_profile = p_flavor_profile,
    flavor_profile_es = p_flavor_profile_es,
    unique_selling_points = p_unique_selling_points,
    unique_selling_points_es = p_unique_selling_points_es,
    season = p_season,
    updated_at = NOW()
  WHERE id = p_menu_item_id;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════
-- SEED DATA: Mark winter-only items and create summer replacements
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: get a manager user ID for created_by on new rows
DO $$
DECLARE
  v_manager_id UUID;
BEGIN
  SELECT id INTO v_manager_id FROM users WHERE role = 'manager' LIMIT 1;

  -- ─── STARTERS: Mark winter-only ─────────────────────────────────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Fig Flatbread%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Fried Brussels%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Firecracker Shrimp%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Drunken Clams%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Roasted Rainbow Carrots%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';

  -- Starters with changed descriptions: mark originals winter-only, clone as summer
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Artisan Bread%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Artisan Bread', 'Honey butter, olive tapenade', price, category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Artisan Bread%' AND category = 'Lunch' AND subcategory = 'Starters' AND season = 'winter' LIMIT 1;
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Artisan Bread', 'Honey butter, olive tapenade', price, category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Artisan Bread%' AND category = 'Dinner' AND subcategory = 'Starters' AND season = 'winter' LIMIT 1;

  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Burrata%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Summer Burrata', 'Heirloom tomato, mango puree, strawberry, arugula, pistachio, raspberry coulis, crostini', '$16', category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Burrata%' AND category = 'Lunch' AND subcategory = 'Starters' AND season = 'winter' LIMIT 1;
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Summer Burrata', 'Heirloom tomato, mango puree, strawberry, arugula, pistachio, raspberry coulis, crostini', '$16', category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Burrata%' AND category = 'Dinner' AND subcategory = 'Starters' AND season = 'winter' LIMIT 1;

  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Signature Crab Cake%' AND category IN ('Lunch','Dinner') AND subcategory = 'Starters' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Signature Crab Cake', 'Corn Succotash, Sriracha Tomato Butter, Micro Basil', '$18', category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Signature Crab Cake%' AND category = 'Lunch' AND subcategory = 'Starters' AND season = 'winter' LIMIT 1;
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Signature Crab Cake', 'Corn Succotash, Sriracha Tomato Butter, Micro Basil', '$18', category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Signature Crab Cake%' AND category = 'Dinner' AND subcategory = 'Starters' AND season = 'winter' LIMIT 1;

  -- New summer-only starters
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
  VALUES
    ('Shrimp Ceviche', 'Citrus Marinated Shrimp, Tomato Passata, Bell Pepper, Onion, Mango, Avocado, Cilantro, Tortilla Chip', '$17', 'Lunch', 'Starters', true, false, 'summer', v_manager_id, 900),
    ('Shrimp Ceviche', 'Citrus Marinated Shrimp, Tomato Passata, Bell Pepper, Onion, Mango, Avocado, Cilantro, Tortilla Chip', '$17', 'Dinner', 'Starters', false, true, 'summer', v_manager_id, 900),
    ('Coconut Shrimp', 'House made breaded coconut shrimp, mango pineapple salsa, balsamic raspberry reduction, cilantro', '$17', 'Lunch', 'Starters', true, false, 'summer', v_manager_id, 901),
    ('Coconut Shrimp', 'House made breaded coconut shrimp, mango pineapple salsa, balsamic raspberry reduction, cilantro', '$17', 'Dinner', 'Starters', false, true, 'summer', v_manager_id, 901),
    ('PEI Mussels', 'Yellow Curry, Fresno Chili, Cilantro, Lime', '$20', 'Lunch', 'Starters', true, false, 'summer', v_manager_id, 902),
    ('PEI Mussels', 'Yellow Curry, Fresno Chili, Cilantro, Lime', '$20', 'Dinner', 'Starters', false, true, 'summer', v_manager_id, 902),
    ('Tuna Tostada', 'Citrus Soy Marinated Tuna, Smashed Avocado, Mango, Radish, Wasabi Aioli, Corn Tortilla, Sesame', '$20', 'Lunch', 'Starters', true, false, 'summer', v_manager_id, 903),
    ('Tuna Tostada', 'Citrus Soy Marinated Tuna, Smashed Avocado, Mango, Radish, Wasabi Aioli, Corn Tortilla, Sesame', '$20', 'Dinner', 'Starters', false, true, 'summer', v_manager_id, 903);

  -- ─── SOUPS: Mark winter-only and create summer ─────────────────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Potato Leek%' AND subcategory = 'Soups' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Fire Side Chili%' AND subcategory = 'Soups' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Fireside Chili%' AND subcategory = 'Soups' AND season = 'both';

  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
  VALUES
    ('Southwest Tortilla', 'Summer Squash, San Marzano Tomato, Roasted Corn, Mirepoix, Tortilla Strips', '$14', 'Lunch', 'Soups', true, false, 'summer', v_manager_id, 900),
    ('Southwest Tortilla', 'Summer Squash, San Marzano Tomato, Roasted Corn, Mirepoix, Tortilla Strips', '$14', 'Dinner', 'Soups', false, true, 'summer', v_manager_id, 900),
    ('Heirloom Tomato Gazpacho', 'Pickled Cucumber, Micro Basil, Evoo', '$12', 'Lunch', 'Soups', true, false, 'summer', v_manager_id, 901),
    ('Heirloom Tomato Gazpacho', 'Pickled Cucumber, Micro Basil, Evoo', '$12', 'Dinner', 'Soups', false, true, 'summer', v_manager_id, 901);

  -- ─── SALADS: changed description ───────────────────────────────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Steak and Burrata%' AND subcategory = 'Salads' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Steak & Burrata%' AND subcategory = 'Salads' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT name, 'Arugula, corn salsa, pickled red onion, heirloom grape tomato, pine nuts, lemon vinaigrette', price, category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE (name ILIKE 'Steak and Burrata%' OR name ILIKE 'Steak & Burrata%') AND category = 'Lunch' AND subcategory = 'Salads' AND season = 'winter' LIMIT 1;
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT name, 'Arugula, corn salsa, pickled red onion, heirloom grape tomato, pine nuts, lemon vinaigrette', price, category, subcategory, available_for_lunch, available_for_dinner, 'summer', v_manager_id, display_order
    FROM menu_items WHERE (name ILIKE 'Steak and Burrata%' OR name ILIKE 'Steak & Burrata%') AND category = 'Dinner' AND subcategory = 'Salads' AND season = 'winter' LIMIT 1;

  -- ─── BURGERS (Lunch only): Mark winter-only, create summer ─────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Black Bean Burger%' AND subcategory = 'Burgers' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
  VALUES ('Portobello Burger', 'Balsamic marinated grilled portobello, roasted red pepper, mozzarella, pesto, multigrain', '$17', 'Lunch', 'Burgers', true, false, 'summer', v_manager_id, 900);

  -- ─── SANDWICHES (Lunch only) ───────────────────────────────────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Caprese Panini%' AND subcategory = 'Sandwiches' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Crispy Chicken Sandwich%' AND subcategory = 'Sandwiches' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Blackened Ahi Tuna Wrap%' AND subcategory = 'Sandwiches' AND season = 'both';

  -- Changed description: Steak Sandwich
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Steak Sandwich%' AND subcategory = 'Sandwiches' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Steak Sandwich', 'Marinated Skirt Steak, Broccoli Rabe, Pickled Red Onion, Mozzarella, Chimichurri', price, 'Lunch', 'Sandwiches', true, false, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Steak Sandwich%' AND subcategory = 'Sandwiches' AND season = 'winter' LIMIT 1;

  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
  VALUES
    ('Bruschetta Chicken Panini', 'Grilled Chicken, Bruschetta, Mozzarella, Basil Pesto, Arugula, Ciabatta', '$18', 'Lunch', 'Sandwiches', true, false, 'summer', v_manager_id, 901),
    ('BBQ Pulled Chicken Sandwich', 'Pulled Chicken, Carolina Slaw, Jalapeno, Cheddar, Pretzel Bun', '$17', 'Lunch', 'Sandwiches', true, false, 'summer', v_manager_id, 902),
    ('Blackened Shrimp Wrap', 'Arugula, pineapple salsa, pickled red onion, cucumber, carrot, Thai chili glaze, spinach tortilla', '$20', 'Lunch', 'Sandwiches', true, false, 'summer', v_manager_id, 903),
    ('Blackened Mahi Sandwich', 'Pan Seared Mahi Mahi, Avocado, Carolina Slaw, Chipotle Mayo, Brioche', '$20', 'Lunch', 'Sandwiches', true, false, 'summer', v_manager_id, 904);

  -- ─── ENTREES (Dinner only) ─────────────────────────────────────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Bell and Evans Chicken%' AND subcategory = 'Entrees' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Osso Buco%' AND subcategory = 'Entrees' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Pork Milanese%' AND subcategory = 'Entrees' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Pan Seared Flounder%' AND subcategory = 'Entrees' AND season = 'both';

  -- Changed desc/price: Skirt Steak
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Skirt Steak%' AND subcategory = 'Entrees' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Skirt Steak', 'Roasted Red Bliss Potato, Jersey Corn Succotash, Chimichurri', '$36', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Skirt Steak%' AND subcategory = 'Entrees' AND season = 'winter' LIMIT 1;

  -- Changed: Salmon → Summer Salmon
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Salmon%' AND category = 'Dinner' AND subcategory = 'Entrees' AND season = 'both';
  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
    SELECT 'Summer Salmon', 'Arugula, Sun Dried Tomato Cream, Toasted Almonds, Orzo, Olive Tapenade', '$32', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, display_order
    FROM menu_items WHERE name ILIKE 'Salmon%' AND category = 'Dinner' AND subcategory = 'Entrees' AND season = 'winter' LIMIT 1;

  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
  VALUES
    ('Caprese Chicken', 'Balsamic marinated chicken breast, parmesan whipped potato, broccoli rabe, Bruschetta, pesto cream', '$34', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, 900),
    ('Half Rack of Ribs', 'Roasted Red Bliss Potato, Corn On The Cob, Honey BBQ', '$24', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, 901),
    ('Full Rack of Ribs', 'Roasted Red Bliss Potato, Corn On The Cob, Honey BBQ', '$32', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, 902),
    ('Pork Chop Diavolo', 'Roasted Red Bliss Potato, Broccoli Rabe, Long Hot, Sauce Provencal', '$38', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, 903),
    ('Mahi-Mahi', 'Pan Seared Blackened Mahi, Basmati Rice Pilaf, Carrot, Spinach, Yellow Curry, Coriander', '$30', 'Dinner', 'Entrees', false, true, 'summer', v_manager_id, 904);

  -- ─── PASTA (Dinner only) ───────────────────────────────────────────
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Cavatelli%' AND subcategory = 'Pasta' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Squash Ravioli%' AND subcategory = 'Pasta' AND season = 'both';
  UPDATE menu_items SET season = 'winter'
    WHERE name ILIKE 'Clams with Attitude%' AND subcategory = 'Pasta' AND season = 'both';

  INSERT INTO menu_items (name, description, price, category, subcategory, available_for_lunch, available_for_dinner, season, created_by, display_order)
  VALUES
    ('Lemon Orzo Chicken', 'Pulled Chicken, Mirepoix, Spinach, Roasted Red Peppers, Shaved Parmesan, Oregano', '$28', 'Dinner', 'Pasta', false, true, 'summer', v_manager_id, 900),
    ('House Made Ricotta Agnolotti', 'Heirloom Tomato, Corn Puree, Calabrian Chili, Shaved Parmesan, Pine Nuts', '$28', 'Dinner', 'Pasta', false, true, 'summer', v_manager_id, 901),
    ('Seafood Fra Diavolo', 'Sauteed Shrimp, Pei Mussels, San Marzano Tomato, Fried Caper, Fettucine', '$34', 'Dinner', 'Pasta', false, true, 'summer', v_manager_id, 902);

  -- ─── LIBATIONS: Mark cocktail items as winter-only ─────────────────
  -- (Summer cocktail libations will be pulled live from summer_libation_recipes)
  UPDATE menu_items SET season = 'winter'
    WHERE category = 'Libations'
      AND subcategory IN ('Signature Cocktails', 'Martinis', 'Sangria', 'Low ABV', 'Zero ABV')
      AND season = 'both';

END $$;
