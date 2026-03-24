-- Belgium-first stored location enrichment (layer location_v1).
-- Run manually in Supabase SQL editor when deploying this feature.

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
