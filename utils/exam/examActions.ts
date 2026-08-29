// Shared quiz lifecycle actions (s77) — the activate-with-defaults + notify
// flow used by BOTH the editor and the hub's quick actions, so the push block
// and the +7d default close_at rule live in exactly one place.

import { supabase } from '@/app/integrations/supabase/client';
import { sendCustomNotification, bothLanguages } from '@/utils/notificationHelpers';
import { getExamTypeName, type ExamType } from '@/utils/exam/questionGenerator';
import i18n from '@/i18n';

/** Which job titles each quiz type notifies (the editor's original mapping). */
export const EXAM_JOB_TITLES: Record<ExamType, string[]> = {
  server: ['Server', 'Lead Server', 'Busser', 'Runner'],
  bartender: ['Bartender'],
  host: ['Host'],
};

/**
 * Activate an exam: fills the default close_at (+7 days at 23:59 local) when
 * none is set, runs the atomic activate_exam RPC (server closes any other
 * active exam of this type first), and fires the staff push if the manager
 * armed notify_on_activate. Push failure is non-fatal — activation stands.
 * Returns the effective close_at so callers can sync their local state.
 */
export async function activateExamWithDefaults(opts: {
  actorId: string;
  organizationId: string | null;
  examId: string;
  examType: ExamType;
  notifyOnActivate: boolean;
  closeAt: Date | null;
}): Promise<Date> {
  let effectiveCloseAt = opts.closeAt;
  if (!effectiveCloseAt) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 0, 0);
    effectiveCloseAt = d;
  }

  const { error } = await supabase.rpc('activate_exam', {
    p_actor_id: opts.actorId,
    p_exam_id: opts.examId,
    p_close_at: effectiveCloseAt.toISOString(),
  });
  if (error) throw error;

  if (opts.notifyOnActivate) {
    try {
      const quizTitle = bothLanguages('notifications.quiz_live_title');
      // Body interpolates the language-specific quiz-type name, so the two
      // copies are built individually.
      const quizBodyEn = i18n.t('notifications.quiz_live_body', { lng: 'en', type: getExamTypeName(opts.examType) });
      const quizBodyEs = i18n.t('notifications.quiz_live_body', { lng: 'es', type: getExamTypeName(opts.examType, true) });
      await sendCustomNotification(
        quizTitle.en,
        quizBodyEn,
        {
          destination: 'weekly-quizzes',
          exam_id: opts.examId,
          job_titles: EXAM_JOB_TITLES[opts.examType] || [],
        },
        opts.organizationId ?? undefined,
        quizTitle.es,
        quizBodyEs
      );
    } catch (pushErr) {
      // Non-fatal: activation still succeeded.
      console.error('Notify Staff push failed:', pushErr);
    }
  }

  return effectiveCloseAt;
}
