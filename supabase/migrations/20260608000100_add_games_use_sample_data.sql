-- Owner-controlled toggle (in Game Hub Editor) for whether the games
-- (Picture This, Memory Tiles, Word Search) draw their menu/recipe content
-- from the Boathouse "sample" org or from the org's own data.
-- Default true so a brand-new (empty) org has playable demo games out of the
-- box; the owner flips it off once they've built their own menu.
-- See utils/game/gameSource.ts (resolveGameSourceOrgId).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS games_use_sample_data boolean NOT NULL DEFAULT true;
