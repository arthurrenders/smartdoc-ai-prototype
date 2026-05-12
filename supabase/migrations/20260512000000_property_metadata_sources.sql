-- =============================================================
-- Per-field provenance for property metadata
-- Records whether a value originated from analyzed documents
-- ("document") or was entered/edited by the realtor ("manual").
-- Shape: { "<field_name>": "document" | "manual" }
-- =============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS metadata_sources JSONB NOT NULL DEFAULT '{}'::jsonb;
