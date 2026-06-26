-- Spanish label for custom redemption options (Session 37 follow-up).
-- Adds label_es + extends the upsert RPC with p_label_es so the Redeem Settings
-- editor can save an auto-translated/manual Spanish name; the redeem screen then
-- shows it via getLocalizedField when the app language is Spanish.

ALTER TABLE public.redemption_custom_options ADD COLUMN IF NOT EXISTS label_es text;

DROP FUNCTION IF EXISTS public.upsert_redemption_custom_option(uuid, uuid, uuid, text, int, boolean);

CREATE OR REPLACE FUNCTION public.upsert_redemption_custom_option(
  p_user_id uuid, p_organization_id uuid, p_id uuid, p_label text, p_cost int, p_is_active boolean, p_label_es text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_id uuid; v_es text;
BEGIN
  IF NOT public._can_manage_redemptions(p_organization_id, p_user_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  IF p_label IS NULL OR length(trim(p_label)) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'label_required');
  END IF;
  v_es := NULLIF(trim(COALESCE(p_label_es, '')), '');
  IF p_id IS NULL THEN
    INSERT INTO public.redemption_custom_options (organization_id, label, label_es, cost, is_active, display_order)
    VALUES (p_organization_id, trim(p_label), v_es, GREATEST(0, p_cost), COALESCE(p_is_active, true),
      COALESCE((SELECT max(display_order) + 1 FROM public.redemption_custom_options WHERE organization_id = p_organization_id), 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.redemption_custom_options
       SET label = trim(p_label), label_es = v_es, cost = GREATEST(0, p_cost), is_active = COALESCE(p_is_active, true)
     WHERE id = p_id AND organization_id = p_organization_id
    RETURNING id INTO v_id;
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_redemption_custom_option(uuid, uuid, uuid, text, int, boolean, text) TO anon, authenticated;
