/**
 * The Schedule wave's notification round-trips (s83) — the redemption grammar
 * (app/redeem.tsx / app/manager-approvals.tsx) lifted into helpers so every
 * caller writes the same shade row + push pair:
 *
 *   request  → managers' shade row (requesterId carve-out) + push to active O/M
 *   decision → per-user shade row (targetUserId) + push to that user
 *   release  → push ONLY, to title-matched coworkers (server resolves them),
 *              governed by the Profile "Shift releases" toggle
 *
 * Copy is built in BOTH languages here (bothLanguages) so each recipient gets
 * their own; the manager-typed reason rides verbatim. Fire-and-forget: nothing
 * here throws — the RPC that changed state already succeeded.
 */
import i18n from '@/i18n';
import { supabase } from '@/app/integrations/supabase/client';
import { bothLanguages, sendNotification } from '@/utils/notificationHelpers';
import { getOrgDirectory } from '@/utils/orgDirectory';
import { formatDateRange, formatDateShort, formatTimeRange } from '@/utils/schedule/format';

export interface ShiftSummary {
  shift_date: string;
  start_time: string;
  end_time: string;
  roles: string[] | null;
}

interface Actor {
  id: string;
  name?: string | null;
}

/** "Sat, Sep 20 · 5:00 – 11:00 PM" in a given language */
function whenText(lng: 'en' | 'es', s: ShiftSummary): string {
  const locale = lng === 'es' ? 'es' : 'en-US';
  return `${formatDateShort(s.shift_date, locale)} · ${formatTimeRange(s.start_time, s.end_time, locale)}`;
}

function rangeText(lng: 'en' | 'es', start: string, end: string | null): string {
  return formatDateRange(start, end, lng === 'es' ? 'es' : 'en-US');
}

function roleText(lng: 'en' | 'es', s: ShiftSummary): string {
  return s.roles && s.roles.length ? s.roles[0] : i18n.t('notifications.shift_generic_role', { lng });
}

function nameOr(lng: 'en' | 'es', name?: string | null): string {
  return name || i18n.t('notifications.an_employee', { lng });
}

function reasonSuffix(lng: 'en' | 'es', reason?: string | null): string {
  const r = (reason || '').trim();
  return r ? i18n.t('notifications.decision_reason_suffix', { lng, reason: r }) : '';
}

async function activeManagerIds(actorId: string): Promise<string[]> {
  const dir = await getOrgDirectory(actorId);
  return dir.filter((r) => (r.role === 'manager' || r.role === 'owner') && r.is_active !== false).map((r) => r.id);
}

async function shadeRow(actorId: string, title: string, body: string, data: Record<string, unknown>) {
  try {
    await supabase.rpc('create_notification', { p_actor_id: actorId, p_title: title, p_body: body, p_data: data as any });
  } catch (e) {
    console.error('[scheduleNotify] shade row failed:', e);
  }
}

// ───────────────────────────── releases ─────────────────────────────

/** A coworker released a shift you're qualified for (Steve, round 1). */
export async function notifyShiftReleased(actor: Actor, releaseId: string, shift: ShiftSummary) {
  try {
    const { data } = await supabase.rpc('get_shift_release_recipients', { p_actor_id: actor.id, p_release_id: releaseId });
    const ids = (data || []).map((r) => r.user_id).filter(Boolean);
    if (!ids.length) return;
    const title = {
      en: i18n.t('notifications.shift_release_title', { lng: 'en', role: roleText('en', shift) }),
      es: i18n.t('notifications.shift_release_title', { lng: 'es', role: roleText('es', shift) }),
    };
    const body = {
      en: i18n.t('notifications.shift_release_body', { lng: 'en', when: whenText('en', shift), name: nameOr('en', actor.name) }),
      es: i18n.t('notifications.shift_release_body', { lng: 'es', when: whenText('es', shift), name: nameOr('es', actor.name) }),
    };
    await sendNotification({
      userIds: ids,
      notificationType: 'shift_release',
      title: title.en,
      body: body.en,
      title_es: title.es,
      body_es: body.es,
      data: { type: 'custom', destination: 'schedule', releaseId },
    });
  } catch (e) {
    console.error('[scheduleNotify] release push failed:', e);
  }
}

// ───────────────────────────── requests (→ managers) ─────────────────────────────

export async function notifyTimeOffRequested(actor: Actor, requestId: string, startDate: string, endDate: string | null) {
  const title = bothLanguages('notifications.time_off_request_title');
  const body = {
    en: i18n.t('notifications.time_off_request_body', { lng: 'en', name: nameOr('en', actor.name), range: rangeText('en', startDate, endDate) }),
    es: i18n.t('notifications.time_off_request_body', { lng: 'es', name: nameOr('es', actor.name), range: rangeText('es', startDate, endDate) }),
  };
  await shadeRow(actor.id, title.en, body.en, {
    type: 'custom',
    destination: 'schedule-approvals',
    notificationType: 'time_off_requested',
    requestId,
    targetRole: 'manager',
    requesterId: actor.id,
    title_es: title.es,
    body_es: body.es,
  });
  try {
    const ids = (await activeManagerIds(actor.id)).filter((id) => id !== actor.id);
    if (!ids.length) return;
    await sendNotification({
      userIds: ids,
      notificationType: 'schedule',
      title: title.en,
      body: body.en,
      title_es: title.es,
      body_es: body.es,
      data: { type: 'custom', destination: 'schedule-approvals' },
    });
  } catch (e) {
    console.error('[scheduleNotify] time-off request push failed:', e);
  }
}

export async function notifyPickupRequested(actor: Actor, releaseId: string, releaserName: string | null, shift: ShiftSummary) {
  const title = bothLanguages('notifications.pickup_request_title');
  const body = {
    en: i18n.t('notifications.pickup_request_body', { lng: 'en', claimer: nameOr('en', actor.name), releaser: nameOr('en', releaserName), role: roleText('en', shift), when: whenText('en', shift) }),
    es: i18n.t('notifications.pickup_request_body', { lng: 'es', claimer: nameOr('es', actor.name), releaser: nameOr('es', releaserName), role: roleText('es', shift), when: whenText('es', shift) }),
  };
  await shadeRow(actor.id, title.en, body.en, {
    type: 'custom',
    destination: 'schedule-approvals',
    notificationType: 'shift_pickup_requested',
    requestId: releaseId,
    targetRole: 'manager',
    requesterId: actor.id,
    title_es: title.es,
    body_es: body.es,
  });
  try {
    const ids = (await activeManagerIds(actor.id)).filter((id) => id !== actor.id);
    if (!ids.length) return;
    await sendNotification({
      userIds: ids,
      notificationType: 'schedule',
      title: title.en,
      body: body.en,
      title_es: title.es,
      body_es: body.es,
      data: { type: 'custom', destination: 'schedule-approvals' },
    });
  } catch (e) {
    console.error('[scheduleNotify] pick-up request push failed:', e);
  }
}

// ───────────────────────────── decisions (→ the people involved) ─────────────────────────────

async function decisionRow(actorId: string, targetUserId: string, requestId: string, kind: 'time_off_decision' | 'shift_pickup_decision', status: 'approved' | 'denied', title: { en: string; es: string }, body: { en: string; es: string }) {
  await shadeRow(actorId, title.en, body.en, {
    type: 'custom',
    destination: 'schedule',
    notificationType: kind,
    targetUserId,
    requestId,
    status,
    title_es: title.es,
    body_es: body.es,
  });
  try {
    await sendNotification({
      userIds: [targetUserId],
      notificationType: 'schedule',
      title: title.en,
      body: body.en,
      title_es: title.es,
      body_es: body.es,
      data: { type: 'custom', destination: 'schedule' },
    });
  } catch (e) {
    console.error('[scheduleNotify] decision push failed:', e);
  }
}

export async function notifyTimeOffDecision(actor: Actor, targetUserId: string, requestId: string, approved: boolean, startDate: string, endDate: string | null, reason?: string | null) {
  const title = bothLanguages(approved ? 'notifications.time_off_approved_title' : 'notifications.time_off_denied_title');
  const key = approved ? 'notifications.time_off_approved_body' : 'notifications.time_off_denied_body';
  const body = {
    en: i18n.t(key, { lng: 'en', range: rangeText('en', startDate, endDate) }) + reasonSuffix('en', reason),
    es: i18n.t(key, { lng: 'es', range: rangeText('es', startDate, endDate) }) + reasonSuffix('es', reason),
  };
  await decisionRow(actor.id, targetUserId, requestId, 'time_off_decision', approved ? 'approved' : 'denied', title, body);
}

export async function notifyPickupDecision(
  actor: Actor,
  releaseId: string,
  approved: boolean,
  parties: { releaserId: string; releaserName: string | null; claimerId: string; claimerName: string | null },
  shift: ShiftSummary,
  reason?: string | null
) {
  const title = bothLanguages(approved ? 'notifications.pickup_approved_title' : 'notifications.pickup_denied_title');
  const status = approved ? 'approved' : 'denied';
  const vars = (lng: 'en' | 'es') => ({
    lng,
    role: roleText(lng, shift),
    when: whenText(lng, shift),
    claimer: nameOr(lng, parties.claimerName),
    releaser: nameOr(lng, parties.releaserName),
  });
  const claimerKey = approved ? 'notifications.pickup_approved_body_claimer' : 'notifications.pickup_denied_body_claimer';
  const releaserKey = approved ? 'notifications.pickup_approved_body_releaser' : 'notifications.pickup_denied_body_releaser';
  const claimerBody = { en: i18n.t(claimerKey, vars('en')) + reasonSuffix('en', reason), es: i18n.t(claimerKey, vars('es')) + reasonSuffix('es', reason) };
  const releaserBody = { en: i18n.t(releaserKey, vars('en')) + reasonSuffix('en', reason), es: i18n.t(releaserKey, vars('es')) + reasonSuffix('es', reason) };
  await decisionRow(actor.id, parties.claimerId, releaseId, 'shift_pickup_decision', status, title, claimerBody);
  await decisionRow(actor.id, parties.releaserId, releaseId, 'shift_pickup_decision', status, title, releaserBody);
}
