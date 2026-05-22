-- ============================================================================
-- Migration: Create multi-tenant foundation tables
-- Phase 1A.1-4: organizations, organization_job_titles, organization_assistants,
--               job_title_assistants
-- ============================================================================

-- 1A.1: Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  weather_location TEXT,
  google_maps_query TEXT,
  reward_currency_name TEXT NOT NULL DEFAULT 'Bucks',
  join_code TEXT UNIQUE NOT NULL,
  allow_self_signup BOOLEAN NOT NULL DEFAULT true,
  menu_count INTEGER NOT NULL DEFAULT 2 CHECK (menu_count IN (1, 2)),
  menu_1_name TEXT NOT NULL DEFAULT 'Menu 1',
  menu_2_name TEXT NOT NULL DEFAULT 'Menu 2',
  default_password TEXT NOT NULL DEFAULT 'welcome123',
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_organizations"
  ON organizations FOR SELECT USING (true);

CREATE POLICY "public_insert_organizations"
  ON organizations FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update_organizations"
  ON organizations FOR UPDATE USING (true) WITH CHECK (true);

-- 1A.2: Organization job titles (replaces constants/jobTitles.ts)
CREATE TABLE organization_job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, title)
);

ALTER TABLE organization_job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_org_job_titles"
  ON organization_job_titles FOR SELECT USING (true);

CREATE POLICY "public_insert_org_job_titles"
  ON organization_job_titles FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update_org_job_titles"
  ON organization_job_titles FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "public_delete_org_job_titles"
  ON organization_job_titles FOR DELETE USING (true);

CREATE INDEX idx_org_job_titles_org_id ON organization_job_titles(organization_id);

-- 1A.3: Organization assistants (which assistants are active per org)
CREATE TABLE organization_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, assistant_key)
);

ALTER TABLE organization_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_org_assistants"
  ON organization_assistants FOR SELECT USING (true);

CREATE POLICY "public_insert_org_assistants"
  ON organization_assistants FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update_org_assistants"
  ON organization_assistants FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "public_delete_org_assistants"
  ON organization_assistants FOR DELETE USING (true);

CREATE INDEX idx_org_assistants_org_id ON organization_assistants(organization_id);

-- 1A.4: Job title -> assistant mappings per org
CREATE TABLE job_title_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  assistant_key TEXT NOT NULL,
  UNIQUE(organization_id, job_title, assistant_key)
);

ALTER TABLE job_title_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_jta"
  ON job_title_assistants FOR SELECT USING (true);

CREATE POLICY "public_insert_jta"
  ON job_title_assistants FOR INSERT WITH CHECK (true);

CREATE POLICY "public_update_jta"
  ON job_title_assistants FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "public_delete_jta"
  ON job_title_assistants FOR DELETE USING (true);

CREATE INDEX idx_jta_org_id ON job_title_assistants(organization_id);
CREATE INDEX idx_jta_org_job_title ON job_title_assistants(organization_id, job_title);
