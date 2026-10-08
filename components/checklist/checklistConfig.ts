import { supabase } from '@/app/integrations/supabase/client';
import type { Json } from '@/app/integrations/supabase/types';
import type { UploadPurpose } from '@/utils/storageBroker';
import { saveTranslations } from '@/utils/translateContent';

/**
 * s91 — the checklist family's shared wiring. Three kinds (host · bartender ·
 * kitchen) × three types (opening · closing · running side work) all render
 * through ChecklistScreen / ChecklistEditorScreen; the per-kind differences
 * (routes, title keys, translation RPCs, upload purpose) live HERE so the two
 * components stay kind-agnostic.
 *
 * The checklist RPCs still take the legacy `p_bartender` boolean AND the new
 * `p_kind` — both are sent everywhere (`kindArgs`) until the server drops the
 * boolean.
 */
export type ChecklistKind = 'host' | 'bartender' | 'kitchen';
export type ChecklistType = 'opening' | 'closing' | 'running_side_work';

export const ATTACHMENT_CAP = 3;

/**
 * A category attachment as the server stores it (jsonb, cap 3). A `type`
 * alias, not an interface — interfaces aren't assignable to Json.
 */
export type ChecklistAttachment =
  | { kind: 'file'; name: string; url: string; mime: string | null; size: number | null }
  | { kind: 'guide'; guide_id: string; name: string };

/** Both RPC flags for a kind — spread into every checklist RPC call. */
export function kindArgs(kind: ChecklistKind): { p_bartender: boolean; p_kind: ChecklistKind } {
  return { p_bartender: kind === 'bartender', p_kind: kind };
}

export const ATTACHMENT_PURPOSE: Record<ChecklistKind, UploadPurpose> = {
  host: 'host_checklist_attachment',
  bartender: 'bartender_checklist_attachment',
  kitchen: 'kitchen_checklist_attachment',
};

interface ChecklistRoutes {
  user: string;
  editor: string;
}

/** User ↔ editor routes per kind × type (the hub back targets are the header's default router.back()). */
export const CHECKLIST_ROUTES: Record<ChecklistKind, Record<ChecklistType, ChecklistRoutes>> = {
  host: {
    opening: { user: '/opening-checklist', editor: '/opening-checklist-editor' },
    closing: { user: '/closing-checklist', editor: '/closing-checklist-editor' },
    running_side_work: { user: '/running-side-work-checklist', editor: '/running-side-work-editor' },
  },
  bartender: {
    opening: { user: '/bartender-opening-checklist', editor: '/bartender-opening-checklist-editor' },
    closing: { user: '/bartender-closing-checklist', editor: '/bartender-closing-checklist-editor' },
    // The bar has no running-side-work set today; this pair names the routes it
    // WOULD use so the Record stays total (no route file exists for it yet).
    running_side_work: { user: '/bartender-running-side-work-checklist', editor: '/bartender-running-side-work-checklist-editor' },
  },
  kitchen: {
    opening: { user: '/kitchen-opening-checklist', editor: '/kitchen-opening-checklist-editor' },
    closing: { user: '/kitchen-closing-checklist', editor: '/kitchen-closing-checklist-editor' },
    running_side_work: { user: '/kitchen-running-side-work-checklist', editor: '/kitchen-running-side-work-checklist-editor' },
  },
};

/** Staff-view title key — the per-family keys the route files used before s91. */
export function userTitleKey(kind: ChecklistKind, type: ChecklistType): string {
  if (kind === 'kitchen') {
    return type === 'opening'
      ? 'kitchen_assistant_checklists:opening_title'
      : type === 'closing'
        ? 'kitchen_assistant_checklists:closing_title'
        : 'kitchen_assistant_checklists:running_title';
  }
  if (kind === 'bartender') {
    return type === 'closing' ? 'checklist:title_bartender_closing' : 'checklist:title_bartender_opening';
  }
  return type === 'opening'
    ? 'checklist:title_opening'
    : type === 'closing'
      ? 'checklist:title_closing'
      : 'checklist:title_running_side_work';
}

/** Editor title key — shared across kinds ("Opening Checklist Editor"). */
export function editorTitleKey(type: ChecklistType): string {
  return type === 'opening'
    ? 'checklist_editor:opening_checklist_editor'
    : type === 'closing'
      ? 'checklist_editor:closing_checklist_editor'
      : 'checklist_editor:running_side_work_editor';
}

/** The ⓘ sheet's blurb key per kind × type. */
export function editorInfoKey(kind: ChecklistKind, type: ChecklistType): string {
  if (kind === 'kitchen') {
    return type === 'opening'
      ? 'kitchen_assistant_checklists:info_opening'
      : type === 'closing'
        ? 'kitchen_assistant_checklists:info_closing'
        : 'kitchen_assistant_checklists:info_running';
  }
  if (kind === 'bartender') {
    return type === 'closing' ? 'checklist_editor:info_bartender_closing' : 'checklist_editor:info_bartender_opening';
  }
  return type === 'opening'
    ? 'checklist_editor:info_opening_hosts'
    : type === 'closing'
      ? 'checklist_editor:info_closing_hosts'
      : 'checklist_editor:info_running_side_work';
}

/** Category-name placeholder — the host editors carry per-type examples. */
export function categoryPlaceholderKey(kind: ChecklistKind, type: ChecklistType): string {
  if (kind !== 'host') return 'checklist_editor:category_name_placeholder';
  return type === 'opening'
    ? 'checklist_editor:category_name_placeholder_opening'
    : type === 'closing'
      ? 'checklist_editor:category_name_placeholder_closing'
      : 'checklist_editor:category_name_placeholder_side_work';
}

/**
 * Spanish side of a category name / item text. Host + bartender ride
 * saveTranslations' table map; the kitchen tables aren't in that map (utils/
 * is out of this wave's reach), so they call their RPCs directly with the same
 * contract: '' is a confirmed clear and must write through (the RPCs
 * COALESCE a null into "keep the old value").
 */
export async function saveCategoryNameEs(kind: ChecklistKind, categoryId: string, nameEs: string, actorId: string): Promise<void> {
  if (kind === 'kitchen') {
    const { error } = await supabase.rpc('update_kitchen_checklist_category_translations_actor', {
      p_actor_id: actorId,
      p_id: categoryId,
      p_name_es: nameEs.trim() ? nameEs : '',
    });
    if (error) console.error('Failed to save kitchen category translation:', error);
    return;
  }
  await saveTranslations(
    kind === 'bartender' ? 'bartender_checklist_categories' : 'checklist_categories',
    categoryId,
    { name_es: nameEs },
    actorId,
    { clearBlank: ['name_es'] }
  );
}

export async function saveItemTextEs(kind: ChecklistKind, itemId: string, textEs: string, actorId: string): Promise<void> {
  if (kind === 'kitchen') {
    const { error } = await supabase.rpc('update_kitchen_checklist_item_translations_actor', {
      p_actor_id: actorId,
      p_id: itemId,
      p_text_es: textEs.trim() ? textEs : '',
    });
    if (error) console.error('Failed to save kitchen item translation:', error);
    return;
  }
  await saveTranslations(
    kind === 'bartender' ? 'bartender_checklist_items' : 'checklist_items',
    itemId,
    { text_es: textEs },
    actorId,
    { clearBlank: ['text_es'] }
  );
}

/** Defensive parse of the jsonb `attachments` column (null / malformed → []). */
export function parseAttachments(raw: Json | null | undefined): ChecklistAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, Json | undefined>;
    if (e.kind === 'file' && typeof e.url === 'string') {
      out.push({
        kind: 'file',
        name: typeof e.name === 'string' && e.name ? e.name : fileNameFromUrl(e.url),
        url: e.url,
        mime: typeof e.mime === 'string' ? e.mime : null,
        size: typeof e.size === 'number' ? e.size : e.size != null && !Number.isNaN(Number(e.size)) ? Number(e.size) : null,
      });
    } else if (e.kind === 'guide' && typeof e.guide_id === 'string') {
      out.push({ kind: 'guide', guide_id: e.guide_id, name: typeof e.name === 'string' ? e.name : '' });
    }
    if (out.length >= ATTACHMENT_CAP) break;
  }
  return out;
}

export function fileNameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0];
    return decodeURIComponent(clean.slice(clean.lastIndexOf('/') + 1)) || 'file';
  } catch {
    return 'file';
  }
}

/** True for a PDF (by mime, falling back to the name's extension). */
export function isPdf(mime: string | null | undefined, name: string): boolean {
  if (mime && mime.toLowerCase().includes('pdf')) return true;
  return /\.pdf$/i.test(name);
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
