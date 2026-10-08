-- s91 part C — retire the early-era signature_recipes orphan (0 rows, zero client callers;
-- the Kitchen Assistant has its own kitchen_recipes). Steve's go-ahead 2026-10-07.
DROP FUNCTION IF EXISTS public.create_signature_recipe(uuid, text, text, text, text, jsonb, text, text, integer, uuid);
DROP FUNCTION IF EXISTS public.update_signature_recipe(uuid, uuid, text, text, text, text, jsonb, text, text, integer, uuid);
DROP FUNCTION IF EXISTS public.delete_signature_recipe(uuid, uuid, uuid);
DROP TABLE IF EXISTS public.signature_recipes;
