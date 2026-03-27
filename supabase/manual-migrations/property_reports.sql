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

CREATE POLICY "Users can read reports for their own properties"
  ON property_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_reports.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert reports for their own properties"
  ON property_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_reports.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update reports for their own properties"
  ON property_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_reports.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete reports for their own properties"
  ON property_reports FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_reports.property_id
      AND properties.user_id = auth.uid()
    )
  );

