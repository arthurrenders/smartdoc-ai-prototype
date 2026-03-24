-- Paste into Supabase SQL editor. Idempotent: safe to re-run.
-- Ensures every column read/written by the app (property detail + geocode + create-property).

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
