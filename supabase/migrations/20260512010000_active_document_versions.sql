-- Tracks which uploaded document is the active/current version for each
-- property + document type. Older duplicates remain available for review but
-- are ignored by status and export calculations.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, document_type_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM documents
  WHERE document_type_id IS NOT NULL
)
UPDATE documents d
SET is_active = ranked.rn = 1
FROM ranked
WHERE d.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_documents_property_type_active
  ON documents(property_id, document_type_id, is_active, created_at DESC);
