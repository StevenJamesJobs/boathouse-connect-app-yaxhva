-- Async Google-review import infrastructure (Session 37).
--
-- The import-google-reviews edge fn used to call Outscraper synchronously
-- (async=false) and block until the scrape finished. Outscraper is often
-- slower than Supabase's ~150s edge limit -> 504 -> failed import. We now submit
-- async=true (return immediately) and ingest results when they arrive, either
-- via an Outscraper webhook (google-reviews-webhook fn) or a reconcile sweep
-- that polls results_location (runs inline on the existing Mon/Thu cron).
--
-- This table tracks every in-flight async request so a dropped webhook can be
-- recovered by the sweep, and so duplicate callbacks can't double-process.

-- Status of one async Outscraper request.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pending_review_status') THEN
    CREATE TYPE public.pending_review_status AS ENUM ('pending', 'done', 'failed', 'empty');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.pending_review_imports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- nullable: the legacy McLoone's default-query path submits with no org and
  -- relies on trg_default_org_id_google_reviews to fill the org on insert.
  organization_id       uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  outscraper_request_id text,                                   -- Outscraper {id}
  results_location      text,                                   -- GET this to poll
  status                public.pending_review_status NOT NULL DEFAULT 'pending',
  is_backfill           boolean NOT NULL DEFAULT false,
  source                text,                                   -- 'manual' | 'cron' | 'cron_all'
  attempts              integer NOT NULL DEFAULT 0,             -- sweep poll attempts
  reviews_upserted      integer,                                -- filled on success (telemetry)
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Sweep query: pending rows older than a threshold, oldest first.
CREATE INDEX IF NOT EXISTS idx_pending_reviews_status_created
  ON public.pending_review_imports (status, created_at);
-- Webhook lookup fallback (by Outscraper request id, when the pending id is absent).
CREATE INDEX IF NOT EXISTS idx_pending_reviews_request_id
  ON public.pending_review_imports (outscraper_request_id);

-- Service-role only: the edge functions use the service-role key (bypasses RLS).
-- No policies + revoked grants => anon/authenticated cannot touch this table.
ALTER TABLE public.pending_review_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_review_imports FROM anon, authenticated;

-- Internal key/value config readable only by the service role. Holds the shared
-- secret that authenticates Outscraper's webhook callback (passed in the webhook
-- URL query string). Kept in the DB (not an env var) so it's self-contained and
-- rotatable via a single UPDATE, and so the submit fn and receiver fn read the
-- same value without dashboard access.
CREATE TABLE IF NOT EXISTS public.service_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_config FROM anon, authenticated;

-- Seed a strong random webhook secret (64 hex chars) once; never overwrite.
INSERT INTO public.service_config (key, value)
VALUES ('google_reviews_webhook_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;
