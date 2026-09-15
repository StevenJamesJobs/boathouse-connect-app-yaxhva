import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOrgDirectory, type OrgDirectoryRow } from '@/utils/orgDirectory';
import type { AvatarPerson } from './AvatarStack';

/** First word of a display name — "Nick Zebra" → "Nick". */
export function firstNameOf(name: string | null | undefined): string {
  const n = (name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

/** "Bar Manager · Bartender" from the job_titles array (legacy job_title as the fallback). */
export function titlesOf(row: OrgDirectoryRow | null | undefined): string {
  if (!row) return '';
  if (row.job_titles && Array.isArray(row.job_titles) && row.job_titles.length > 0) {
    return row.job_titles.join(' · ');
  }
  return row.job_title || '';
}

/**
 * Directory hydration for the messaging screens (s84). One `get_org_directory`
 * call per mount; the thread / compose screens keep only ids in their own
 * state and read names, titles and avatars off the map at render time, so a
 * late-landing directory simply re-renders the rows.
 */
export function useThreadPeople(actorId: string | null | undefined) {
  const [rows, setRows] = useState<OrgDirectoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!actorId) return;
    const dir = await getOrgDirectory(actorId);
    setRows(dir);
    setLoaded(true);
  }, [actorId]);

  useEffect(() => {
    let alive = true;
    if (!actorId) return;
    getOrgDirectory(actorId).then((dir) => {
      if (!alive) return;
      setRows(dir);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [actorId]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r] as const)), [rows]);

  const personOf = useCallback(
    (id: string, fallbackName?: string | null): AvatarPerson => {
      const r = byId.get(id);
      return { id, name: r?.name || fallbackName || '', profile_picture_url: r?.profile_picture_url ?? null };
    },
    [byId],
  );

  const nameOf = useCallback(
    (id: string, fallback?: string | null): string => byId.get(id)?.name || fallback || '',
    [byId],
  );

  return { rows, byId, loaded, personOf, nameOf, reload };
}
