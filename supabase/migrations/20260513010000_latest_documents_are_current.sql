-- Reconcile legacy manual active-version choices with the current product rule:
-- the newest upload for each property + document type is always the current document.
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
SET
  is_active = ranked.rn = 1,
  updated_at = NOW()
FROM ranked
WHERE d.id = ranked.id;
