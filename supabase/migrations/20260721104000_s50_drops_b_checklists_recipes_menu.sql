-- S50 B5 teardown group B (2026-07-21): checklists (both families) + recipes +
-- menu-core — drop every legacy policy and revoke table grants. All client
-- access is via DEFINER RPCs (session 44). signature_recipes has zero client
-- access (teardown-only table).
-- ROLLBACK: re-CREATE from session50_manifests/restore_policies.sql;
--           re-GRANT from session50_manifests/restore_table_grants.sql.

-- checklists (host + bartender families, 24 policies)
DROP POLICY "Everyone can view checklist categories" ON public.checklist_categories;
DROP POLICY "Managers can delete checklist categories" ON public.checklist_categories;
DROP POLICY "Managers can insert checklist categories" ON public.checklist_categories;
DROP POLICY "Managers can update checklist categories" ON public.checklist_categories;
DROP POLICY "Everyone can view checklist items" ON public.checklist_items;
DROP POLICY "Managers can delete checklist items" ON public.checklist_items;
DROP POLICY "Managers can insert checklist items" ON public.checklist_items;
DROP POLICY "Managers can update checklist items" ON public.checklist_items;
DROP POLICY "Everyone can view checklist categories" ON public.bartender_checklist_categories;
DROP POLICY "Managers can delete checklist categories" ON public.bartender_checklist_categories;
DROP POLICY "Managers can insert checklist categories" ON public.bartender_checklist_categories;
DROP POLICY "Managers can update checklist categories" ON public.bartender_checklist_categories;
DROP POLICY "Everyone can view checklist items" ON public.bartender_checklist_items;
DROP POLICY "Managers can delete checklist items" ON public.bartender_checklist_items;
DROP POLICY "Managers can insert checklist items" ON public.bartender_checklist_items;
DROP POLICY "Managers can update checklist items" ON public.bartender_checklist_items;
DROP POLICY "Users can delete their own progress" ON public.user_checklist_progress;
DROP POLICY "Users can insert their own progress" ON public.user_checklist_progress;
DROP POLICY "Users can update their own progress" ON public.user_checklist_progress;
DROP POLICY "Users can view their own progress" ON public.user_checklist_progress;
DROP POLICY "Users can delete their own progress" ON public.user_bartender_checklist_progress;
DROP POLICY "Users can insert their own progress" ON public.user_bartender_checklist_progress;
DROP POLICY "Users can update their own progress" ON public.user_bartender_checklist_progress;
DROP POLICY "Users can view their own progress" ON public.user_bartender_checklist_progress;
-- recipes (6 tables)
DROP POLICY "Anyone can view active cocktails" ON public.cocktails;
DROP POLICY "Everyone can view active cocktails" ON public.cocktails;
DROP POLICY "Managers can delete cocktails" ON public.cocktails;
DROP POLICY "Managers can insert cocktails" ON public.cocktails;
DROP POLICY "Managers can update cocktails" ON public.cocktails;
DROP POLICY "Managers can view all cocktails" ON public.cocktails;
DROP POLICY "Anyone can view active libation recipes" ON public.libation_recipes;
DROP POLICY "Everyone can view active libation recipes" ON public.libation_recipes;
DROP POLICY "Managers can delete libation recipes" ON public.libation_recipes;
DROP POLICY "Managers can insert libation recipes" ON public.libation_recipes;
DROP POLICY "Managers can update libation recipes" ON public.libation_recipes;
DROP POLICY "Managers can view all libation recipes" ON public.libation_recipes;
DROP POLICY "summer_libation_all" ON public.summer_libation_recipes;
DROP POLICY "Allow all users to read active puree syrup recipes" ON public.puree_syrup_recipes;
DROP POLICY "Allow managers to delete puree syrup recipes" ON public.puree_syrup_recipes;
DROP POLICY "Allow managers to insert puree syrup recipes" ON public.puree_syrup_recipes;
DROP POLICY "Allow managers to update puree syrup recipes" ON public.puree_syrup_recipes;
DROP POLICY "wine_pairings_delete_all" ON public.wine_pairings;
DROP POLICY "wine_pairings_insert_all" ON public.wine_pairings;
DROP POLICY "wine_pairings_select_all" ON public.wine_pairings;
DROP POLICY "wine_pairings_update_all" ON public.wine_pairings;
DROP POLICY "public_delete_signature_recipes" ON public.signature_recipes;
DROP POLICY "public_insert_signature_recipes" ON public.signature_recipes;
DROP POLICY "public_read_signature_recipes" ON public.signature_recipes;
DROP POLICY "public_update_signature_recipes" ON public.signature_recipes;
-- menu-core
DROP POLICY "Allow all inserts for authenticated users" ON public.menu_items;
DROP POLICY "Allow all updates for authenticated users" ON public.menu_items;
DROP POLICY "Anyone can view active menu items" ON public.menu_items;
DROP POLICY "Authenticated users can delete menu items" ON public.menu_items;
DROP POLICY "Authenticated users can view all menu items" ON public.menu_items;
DROP POLICY "menu_categories_all" ON public.menu_categories;
DROP POLICY "menu_subcategories_all" ON public.menu_subcategories;
DROP POLICY "public_delete_menu_uploads" ON public.menu_uploads;
DROP POLICY "public_insert_menu_uploads" ON public.menu_uploads;
DROP POLICY "public_read_menu_uploads" ON public.menu_uploads;
DROP POLICY "public_update_menu_uploads" ON public.menu_uploads;

REVOKE ALL ON public.checklist_categories FROM anon, authenticated;
REVOKE ALL ON public.checklist_items FROM anon, authenticated;
REVOKE ALL ON public.bartender_checklist_categories FROM anon, authenticated;
REVOKE ALL ON public.bartender_checklist_items FROM anon, authenticated;
REVOKE ALL ON public.user_checklist_progress FROM anon, authenticated;
REVOKE ALL ON public.user_bartender_checklist_progress FROM anon, authenticated;
REVOKE ALL ON public.cocktails FROM anon, authenticated;
REVOKE ALL ON public.libation_recipes FROM anon, authenticated;
REVOKE ALL ON public.summer_libation_recipes FROM anon, authenticated;
REVOKE ALL ON public.puree_syrup_recipes FROM anon, authenticated;
REVOKE ALL ON public.wine_pairings FROM anon, authenticated;
REVOKE ALL ON public.signature_recipes FROM anon, authenticated;
REVOKE ALL ON public.menu_items FROM anon, authenticated;
REVOKE ALL ON public.menu_categories FROM anon, authenticated;
REVOKE ALL ON public.menu_subcategories FROM anon, authenticated;
REVOKE ALL ON public.menu_uploads FROM anon, authenticated;
