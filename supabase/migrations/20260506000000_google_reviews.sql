-- Google Reviews table for automated import from Outscraper API
CREATE TABLE IF NOT EXISTS google_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id TEXT NOT NULL UNIQUE,
  author_title TEXT NOT NULL,
  author_image TEXT,
  review_rating INTEGER NOT NULL CHECK (review_rating BETWEEN 1 AND 5),
  review_text TEXT,
  review_text_es TEXT,
  review_datetime_utc TIMESTAMPTZ NOT NULL,
  owner_answer TEXT,
  owner_answer_es TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_reviews_datetime
  ON google_reviews(is_published, review_datetime_utc DESC);

-- RLS
ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read google reviews"
  ON google_reviews FOR SELECT TO public
  USING (true);

CREATE POLICY "Anyone can update google reviews is_published"
  ON google_reviews FOR UPDATE TO public
  USING (true) WITH CHECK (true);
