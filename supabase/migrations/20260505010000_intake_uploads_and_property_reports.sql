CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bulk document intake queue used by /intake.
CREATE TABLE IF NOT EXISTS intake_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  source_relative_path TEXT,
  storage_path TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'uploaded',
  detected_document_type TEXT,
  extracted_address_raw TEXT,
  matched_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  created_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  confidence_score DOUBLE PRECISION,
  needs_manual_review BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  mime_type TEXT,
  original_file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS source_relative_path TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'uploaded';
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS detected_document_type TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS extracted_address_raw TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS matched_property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS created_property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT TRUE;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS original_file_size BIGINT;
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE intake_uploads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_intake_uploads_user_created
  ON intake_uploads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_uploads_processing_status
  ON intake_uploads(processing_status);
CREATE INDEX IF NOT EXISTS idx_intake_uploads_manual_review
  ON intake_uploads(user_id, needs_manual_review);

ALTER TABLE intake_uploads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intake_uploads'
      AND policyname = 'Users manage own intake uploads'
  ) THEN
    CREATE POLICY "Users manage own intake uploads"
      ON intake_uploads FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Internal property-linked reports/notes.
CREATE TABLE IF NOT EXISTS property_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note_text TEXT NOT NULL,
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_reports_property_id
  ON property_reports(property_id);
CREATE INDEX IF NOT EXISTS idx_property_reports_created_at
  ON property_reports(created_at DESC);

ALTER TABLE property_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_reports'
      AND policyname = 'Users can read reports for their own properties'
  ) THEN
    CREATE POLICY "Users can read reports for their own properties"
      ON property_reports FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM properties
          WHERE properties.id = property_reports.property_id
          AND properties.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_reports'
      AND policyname = 'Users can insert reports for their own properties'
  ) THEN
    CREATE POLICY "Users can insert reports for their own properties"
      ON property_reports FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM properties
          WHERE properties.id = property_reports.property_id
          AND properties.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_reports'
      AND policyname = 'Users can update reports for their own properties'
  ) THEN
    CREATE POLICY "Users can update reports for their own properties"
      ON property_reports FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM properties
          WHERE properties.id = property_reports.property_id
          AND properties.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_reports'
      AND policyname = 'Users can delete reports for their own properties'
  ) THEN
    CREATE POLICY "Users can delete reports for their own properties"
      ON property_reports FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM properties
          WHERE properties.id = property_reports.property_id
          AND properties.user_id = auth.uid()
        )
      );
  END IF;
END $$;
