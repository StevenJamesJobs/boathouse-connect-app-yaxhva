import { useCallback, useState } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The schedule scan credit meter (s83) — schedules have their OWN monthly pool
 * (15 by default = five PDF scans; menus keep their pool of 10). Same costs:
 * PDF 3 · photo page 1 · first scan free.
 *
 * Lazy by design (the menu pattern): callers refresh on sheet-open / page focus,
 * never on an interval. `null` until the first read, or when the actor may not
 * upload (get_schedule_upload_quota returns success:false for an ungranted
 * manager / base tier) — the strip simply doesn't render.
 */
export interface ScheduleQuota {
  remaining: number;
  max: number;
  freeAvailable: boolean;
  pdfCost: number;
  imagePageCost: number;
}

export const SCHEDULE_PDF_COST = 3;
export const SCHEDULE_IMAGE_PAGE_COST = 1;

export function useScheduleQuota() {
  const { user } = useAuth();
  const [quota, setQuota] = useState<ScheduleQuota | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_schedule_upload_quota', { p_actor_id: user.id });
      if (error) throw error;
      const q: any = data;
      if (q && q.success) {
        setQuota({
          remaining: Number(q.credits_remaining) || 0,
          max: Number(q.monthly_allowance) || 0,
          freeAvailable: !!q.free_available,
          pdfCost: Number(q.costs?.pdf) || SCHEDULE_PDF_COST,
          imagePageCost: Number(q.costs?.image_per_page) || SCHEDULE_IMAGE_PAGE_COST,
        });
      } else {
        setQuota(null);
      }
    } catch (e) {
      console.error('[useScheduleQuota] load error:', e);
      setQuota(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { quota, loading, refresh };
}

/** What a pick will cost, for the guards and the "Scan · 3 credits" label. */
export function scanCost(sourceType: 'pdf' | 'image', pageCount: number, quota: ScheduleQuota | null): number {
  if (quota?.freeAvailable) return 0;
  return sourceType === 'pdf'
    ? (quota?.pdfCost ?? SCHEDULE_PDF_COST)
    : Math.max(1, pageCount) * (quota?.imagePageCost ?? SCHEDULE_IMAGE_PAGE_COST);
}
