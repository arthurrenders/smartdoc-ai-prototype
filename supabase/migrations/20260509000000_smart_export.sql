CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- Property metadata required by Smart Export readiness rules
-- =============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS construction_year INT;
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS transaction_type TEXT;
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS heating_type TEXT;
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_type TEXT;
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS asking_price NUMERIC(12, 2);
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bedrooms INT;
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS living_area_m2 NUMERIC(8, 2);
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS description TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_transaction_type_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_transaction_type_check
      CHECK (transaction_type IS NULL OR transaction_type IN ('sale', 'rent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_heating_type_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_heating_type_check
      CHECK (heating_type IS NULL OR heating_type IN ('gas', 'oil', 'electric', 'heat_pump', 'district', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_property_type_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_property_type_check
      CHECK (property_type IS NULL OR property_type IN ('house', 'apartment', 'land', 'commercial', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_construction_year_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_construction_year_check
      CHECK (construction_year IS NULL OR (construction_year BETWEEN 1700 AND 2100));
  END IF;
END $$;

-- =============================================================
-- Extended document type seed
-- =============================================================
INSERT INTO document_types (name) VALUES
  ('SOIL_CERTIFICATE'),
  ('CADASTRAL_EXTRACT'),
  ('URBAN_PLANNING_INFO'),
  ('OIL_TANK_CERTIFICATE'),
  ('PHOTO'),
  ('FLOOR_PLAN')
ON CONFLICT (name) DO NOTHING;

-- =============================================================
-- Export destination registry
-- =============================================================
CREATE TABLE IF NOT EXISTS export_destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('portal', 'crm', 'legal')),
  output_format TEXT NOT NULL CHECK (output_format IN ('json', 'csv', 'xml', 'full_bundle')),
  validation_rules JSONB NOT NULL,
  field_mapping JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_destinations_slug ON export_destinations(slug);

-- =============================================================
-- Export run history
-- =============================================================
CREATE TABLE IF NOT EXISTS export_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES export_destinations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'done', 'error')),
  readiness_score INT,
  missing_items JSONB,
  storage_path TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_runs_property
  ON export_runs(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_runs_destination
  ON export_runs(destination_id, created_at DESC);

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE export_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Destinations are read-only catalog data for any authenticated user.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'export_destinations'
      AND policyname = 'Authenticated users can read destinations'
  ) THEN
    CREATE POLICY "Authenticated users can read destinations"
      ON export_destinations FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'export_runs'
      AND policyname = 'Users read export runs for own properties'
  ) THEN
    CREATE POLICY "Users read export runs for own properties"
      ON export_runs FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM properties
          WHERE properties.id = export_runs.property_id
          AND properties.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'export_runs'
      AND policyname = 'Users insert export runs for own properties'
  ) THEN
    CREATE POLICY "Users insert export runs for own properties"
      ON export_runs FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM properties
          WHERE properties.id = export_runs.property_id
          AND properties.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- =============================================================
-- Storage bucket for generated ZIP exports (private)
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', FALSE)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- Seed v1 destinations: Zimmo, Immoweb, Realo
-- The validation_rules + field_mapping are pure JSONB so future
-- destinations are added by inserting another row, no schema change.
-- =============================================================

-- Zimmo (Belgian portal, CSV)
INSERT INTO export_destinations (slug, name, type, output_format, validation_rules, field_mapping)
VALUES (
  'zimmo',
  'Zimmo',
  'portal',
  'csv',
  jsonb_build_object(
    'required_fields', jsonb_build_array('address', 'asking_price', 'property_type'),
    'required_documents', jsonb_build_array('EPC'),
    'global_required_documents', jsonb_build_array('PHOTO'),
    'conditional', jsonb_build_array(
      jsonb_build_object(
        'if', jsonb_build_object('property.construction_year', jsonb_build_object('lt', 2001)),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ASBESTOS')),
        'reason', 'Bouwjaar < 2001 — asbestattest verplicht'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.transaction_type', jsonb_build_object('eq', 'sale')),
        'then', jsonb_build_object('required_documents', jsonb_build_array('SOIL_CERTIFICATE', 'URBAN_PLANNING_INFO')),
        'reason', 'Verkoop — bodemattest en stedenbouwkundige inlichtingen vereist'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.heating_type', jsonb_build_object('eq', 'oil')),
        'then', jsonb_build_object('required_documents', jsonb_build_array('OIL_TANK_CERTIFICATE')),
        'reason', 'Stookolie — keuringsattest stookolietank vereist'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('always', TRUE),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ELECTRICAL')),
        'reason', 'Elektrische keuring vereist voor portaal'
      )
    )
  ),
  jsonb_build_object(
    'category', jsonb_build_object('house', 'woning', 'apartment', 'appartement', 'land', 'grond', 'commercial', 'commercieel'),
    'transaction', jsonb_build_object('sale', 'koop', 'rent', 'huur'),
    'csv_columns', jsonb_build_array(
      'category', 'transaction', 'price', 'street', 'house_number', 'box', 'postal_code',
      'city', 'bedrooms', 'living_area_m2', 'construction_year', 'epc_label', 'epc_kwh_m2_year',
      'description'
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  output_format = EXCLUDED.output_format,
  validation_rules = EXCLUDED.validation_rules,
  field_mapping = EXCLUDED.field_mapping,
  updated_at = NOW();

-- Immoweb (Belgian portal, CSV)
INSERT INTO export_destinations (slug, name, type, output_format, validation_rules, field_mapping)
VALUES (
  'immoweb',
  'Immoweb',
  'portal',
  'csv',
  jsonb_build_object(
    'required_fields', jsonb_build_array('address', 'asking_price', 'property_type', 'living_area_m2'),
    'required_documents', jsonb_build_array('EPC'),
    'global_required_documents', jsonb_build_array('PHOTO'),
    'conditional', jsonb_build_array(
      jsonb_build_object(
        'if', jsonb_build_object('property.construction_year', jsonb_build_object('lt', 2001)),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ASBESTOS')),
        'reason', 'Bouwjaar < 2001 — asbestattest verplicht'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.transaction_type', jsonb_build_object('eq', 'sale')),
        'then', jsonb_build_object('required_documents', jsonb_build_array('SOIL_CERTIFICATE', 'URBAN_PLANNING_INFO')),
        'reason', 'Verkoop — bodemattest en stedenbouwkundige inlichtingen vereist'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.heating_type', jsonb_build_object('eq', 'oil')),
        'then', jsonb_build_object('required_documents', jsonb_build_array('OIL_TANK_CERTIFICATE')),
        'reason', 'Stookolie — keuringsattest stookolietank vereist'
      )
    )
  ),
  jsonb_build_object(
    'category', jsonb_build_object('house', 'HOUSE', 'apartment', 'APARTMENT', 'land', 'LAND', 'commercial', 'COMMERCIAL'),
    'transaction', jsonb_build_object('sale', 'FOR_SALE', 'rent', 'FOR_RENT'),
    'csv_columns', jsonb_build_array(
      'reference', 'category', 'transaction', 'price', 'street', 'house_number', 'box',
      'postal_code', 'city', 'country', 'bedrooms', 'living_area_m2', 'construction_year',
      'epc_label', 'epc_kwh_m2_year', 'description'
    )
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  output_format = EXCLUDED.output_format,
  validation_rules = EXCLUDED.validation_rules,
  field_mapping = EXCLUDED.field_mapping,
  updated_at = NOW();

-- Realo (XML feed)
INSERT INTO export_destinations (slug, name, type, output_format, validation_rules, field_mapping)
VALUES (
  'realo',
  'Realo',
  'portal',
  'xml',
  jsonb_build_object(
    'required_fields', jsonb_build_array('address', 'asking_price', 'property_type'),
    'required_documents', jsonb_build_array('EPC'),
    'global_required_documents', jsonb_build_array('PHOTO'),
    'conditional', jsonb_build_array(
      jsonb_build_object(
        'if', jsonb_build_object('property.construction_year', jsonb_build_object('lt', 2001)),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ASBESTOS')),
        'reason', 'Bouwjaar < 2001 — asbestattest verplicht'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.transaction_type', jsonb_build_object('eq', 'sale')),
        'then', jsonb_build_object('required_documents', jsonb_build_array('SOIL_CERTIFICATE')),
        'reason', 'Verkoop — bodemattest vereist'
      )
    )
  ),
  jsonb_build_object(
    'category', jsonb_build_object('house', 'house', 'apartment', 'apartment', 'land', 'land', 'commercial', 'commercial'),
    'transaction', jsonb_build_object('sale', 'sale', 'rent', 'rent')
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  output_format = EXCLUDED.output_format,
  validation_rules = EXCLUDED.validation_rules,
  field_mapping = EXCLUDED.field_mapping,
  updated_at = NOW();
