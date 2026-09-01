/**
 * Org-level checkout HOUSE DEFAULTS (s79 presets phase) — the O/M-authored
 * baseline for the Checkouts ritual, stored server-side (org_checkout_defaults
 * via the two s79 RPCs).
 *
 * SEED-EVERY-CHECKOUT semantics (Steve's lockdown): when house defaults exist
 * they are the standing baseline for EVERY checkout — a user's day-of edits
 * (the "manager said the busser gets more tonight" case) apply to that
 * checkout only and are deliberately NOT persisted. Without house defaults the
 * legacy behavior stands: device-remembered prefs, else the canonical trio
 * seed. Solo/Pooled mode stays a device preference either way.
 */
import { supabase } from '@/app/integrations/supabase/client';
import type { TipOutLine } from './checkoutMath';

export interface HouseDefaults {
  declarePct: number;
  tipOuts: TipOutLine[];
}

/** null = the org has no house defaults (or the fetch failed — fail open to legacy). */
export async function fetchHouseDefaults(actorId: string): Promise<HouseDefaults | null> {
  try {
    const { data, error } = await supabase.rpc('get_checkout_defaults', { p_actor_id: actorId });
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    // PostgREST serializes the NUMERIC column as a STRING ("0.12") — a strict
    // typeof-number guard here silently disabled house defaults entirely (the
    // s79 punch bug). Coerce; the jsonb pcts ride through as JSON numbers but
    // get the same treatment for symmetry.
    const declarePct = Number(row.declare_pct);
    if (!Number.isFinite(declarePct)) return null;
    const rawTipOuts = Array.isArray(row.tip_outs) ? (row.tip_outs as any[]) : [];
    const tipOuts: TipOutLine[] = rawTipOuts
      .filter((l) => l && typeof l.title === 'string')
      .map((l) => ({ title: l.title, pct: Number(l.pct) }))
      .filter((l) => Number.isFinite(l.pct));
    return { declarePct, tipOuts };
  } catch {
    return null;
  }
}

/** O/M only (the server enforces regardless). Throws on failure — the sheet shows the message. */
export async function saveHouseDefaults(actorId: string, defaults: HouseDefaults): Promise<void> {
  const { error } = await supabase.rpc('set_checkout_defaults', {
    p_actor_id: actorId,
    p_declare_pct: defaults.declarePct,
    p_tip_outs: defaults.tipOuts.map((l) => ({ title: l.title, pct: l.pct })) as any,
  });
  if (error) throw error;
}
