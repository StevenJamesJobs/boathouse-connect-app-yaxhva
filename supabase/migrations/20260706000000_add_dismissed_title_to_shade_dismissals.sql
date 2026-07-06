-- Recently Dismissed (Notification Center) needs a human-readable label for each
-- hidden item without re-fetching the source row. Snapshot the title at dismiss time.
-- Nullable + additive: existing rows keep NULL (they simply won't show a title in the
-- Recently Dismissed list, which only surfaces newly dismissed items going forward).
ALTER TABLE public.shade_dismissals
  ADD COLUMN IF NOT EXISTS dismissed_title text;
