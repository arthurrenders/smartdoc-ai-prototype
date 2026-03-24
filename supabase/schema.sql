-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Properties table
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Human-friendly label shown in the UI (editable by the user).
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document types table
CREATE TABLE document_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed document types
INSERT INTO document_types (name) VALUES
  ('EPC'),
  ('ASBESTOS'),
  ('ELECTRICAL')
ON CONFLICT (name) DO NOTHING;

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis runs table
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error')),
  result_json JSONB,
  model_name TEXT,
  prompt_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Red flags table
CREATE TABLE red_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('red', 'orange', 'green')),
  title TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_properties_user_id ON properties(user_id);
-- Property display names must be unique (case-insensitive).
-- Multiple NULL values are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_display_name_lower_unique
  ON properties (lower(display_name))
  WHERE display_name IS NOT NULL;
CREATE INDEX idx_documents_property_id ON documents(property_id);
CREATE INDEX idx_documents_document_type_id ON documents(document_type_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_analysis_runs_document_id ON analysis_runs(document_id);
CREATE INDEX idx_analysis_runs_status ON analysis_runs(status);
CREATE INDEX idx_red_flags_document_id ON red_flags(document_id);
CREATE INDEX idx_red_flags_severity ON red_flags(severity);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for properties
CREATE POLICY "Users can read their own properties"
  ON properties FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own properties"
  ON properties FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own properties"
  ON properties FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own properties"
  ON properties FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for document_types (read-only for authenticated users)
CREATE POLICY "Authenticated users can read document types"
  ON document_types FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for documents
CREATE POLICY "Users can read documents for their own properties"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert documents for their own properties"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update documents for their own properties"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents for their own properties"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- RLS Policies for analysis_runs
CREATE POLICY "Users can read analysis runs for their own documents"
  ON analysis_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert analysis runs for their own documents"
  ON analysis_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update analysis runs for their own documents"
  ON analysis_runs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete analysis runs for their own documents"
  ON analysis_runs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

-- RLS Policies for red_flags
CREATE POLICY "Users can read red flags for their own documents"
  ON red_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert red flags for their own documents"
  ON red_flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update red flags for their own documents"
  ON red_flags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete red flags for their own documents"
  ON red_flags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

-- Extracted dates for calendar / reminders (replaced per document on each successful analysis)
CREATE TABLE document_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  date_type TEXT NOT NULL,
  date_on DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('structured', 'summary_parse')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_document_dates_property_id ON document_dates(property_id);
CREATE INDEX idx_document_dates_document_id ON document_dates(document_id);
CREATE INDEX idx_document_dates_date_on ON document_dates(date_on);
CREATE INDEX idx_document_dates_property_date ON document_dates(property_id, date_on);

ALTER TABLE document_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read document dates for their own properties"
  ON document_dates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = document_dates.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert document dates for their own properties"
  ON document_dates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = document_dates.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update document dates for their own properties"
  ON document_dates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = document_dates.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete document dates for their own properties"
  ON document_dates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = document_dates.property_id
      AND properties.user_id = auth.uid()
    )
  );

ALTER TABLE document_dates ADD COLUMN IF NOT EXISTS label TEXT;

-- Global reminder presets (days before document_dates.date_on)
CREATE TABLE notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offset_days_before INT NOT NULL CHECK (offset_days_before > 0 AND offset_days_before <= 365),
  label TEXT NOT NULL,
  date_types TEXT[],
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (offset_days_before)
);

INSERT INTO notification_rules (offset_days_before, label, date_types, sort_order, enabled) VALUES
  (7, '7 days before', NULL, 1, TRUE),
  (14, '14 days before', NULL, 2, TRUE),
  (30, '30 days before', NULL, 3, TRUE)
ON CONFLICT (offset_days_before) DO NOTHING;

CREATE INDEX idx_notification_rules_enabled ON notification_rules(enabled);

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notification rules"
  ON notification_rules FOR SELECT
  TO authenticated
  USING (TRUE);

-- In-app notifications (generated from document_dates + rules; prototype sync on dashboard load)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_date_id UUID NOT NULL REFERENCES document_dates(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (document_date_id, rule_id)
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_property_id ON notifications(property_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Structured address (Belgium-first; one row per property for this prototype)
CREATE TABLE property_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  raw_line1 TEXT NOT NULL,
  normalized_full_address TEXT,
  street_name TEXT,
  house_number TEXT,
  box TEXT,
  postal_code TEXT,
  municipality TEXT,
  region TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'BE',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geocoded_at TIMESTAMPTZ,
  geocode_status TEXT NOT NULL DEFAULT 'pending',
  geocode_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_addresses_property_id ON property_addresses(property_id);

ALTER TABLE property_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read addresses for their own properties"
  ON property_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_addresses.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert addresses for their own properties"
  ON property_addresses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_addresses.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update addresses for their own properties"
  ON property_addresses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_addresses.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete addresses for their own properties"
  ON property_addresses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_addresses.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- Backfill: one address row per property that has display_name (raw only; structured fields for later geocoding)
INSERT INTO property_addresses (property_id, source, raw_line1, country_code)
SELECT
  id,
  'display_name_backfill',
  trim(display_name),
  'BE'
FROM properties
WHERE display_name IS NOT NULL
  AND trim(display_name) <> ''
ON CONFLICT (property_id) DO NOTHING;

-- Idempotent column adds: use after any older property_addresses definition so app + geocoder match.
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS raw_line1 TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS normalized_full_address TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS street_name TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS house_number TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS box TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS municipality TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS country_code CHAR(2);
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS geocode_status TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS geocode_error TEXT;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE property_addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE property_addresses SET country_code = 'BE' WHERE country_code IS NULL;

UPDATE property_addresses
SET geocode_status = 'pending'
WHERE geocode_status IS NULL;

UPDATE property_addresses
SET geocode_status = 'ok'
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND (geocode_status IS NULL OR geocode_status = 'pending');

CREATE INDEX IF NOT EXISTS idx_property_addresses_geocode_status ON property_addresses(geocode_status);

-- Belgium-first stored location enrichment (layer location_v1); app reads from DB only.
CREATE TABLE IF NOT EXISTS property_location_enrichment (
  property_id UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  layer TEXT NOT NULL DEFAULT 'location_v1',
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_location_enrichment_layer
  ON property_location_enrichment(layer);

ALTER TABLE property_location_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read enrichment for their own properties"
  ON property_location_enrichment FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_location_enrichment.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert enrichment for their own properties"
  ON property_location_enrichment FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_location_enrichment.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update enrichment for their own properties"
  ON property_location_enrichment FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_location_enrichment.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete enrichment for their own properties"
  ON property_location_enrichment FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_location_enrichment.property_id
      AND properties.user_id = auth.uid()
    )
  );

