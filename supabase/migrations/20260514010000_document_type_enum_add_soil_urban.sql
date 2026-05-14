-- Extend the document_type enum with the two upload-only intake types.
--
-- intake_uploads.detected_document_type is typed as enum document_type. The enum was
-- originally created with only 'epc', 'electricity', 'asbestos', 'unknown', so every
-- intake flow that detects a bodemattest or stedenbouwkundige document fails its final
-- intake_uploads UPDATE patch with `invalid input value for enum document_type:
-- "soil_certificate" / "urban_planning_info"` — even though the property was created
-- and the document row was inserted. The row then stays at processing_status =
-- 'processing' and the UI shows yellow "Bezig / Wacht op verwerking".
--
-- ALTER TYPE ... ADD VALUE is non-destructive and cannot run inside a transaction;
-- IF NOT EXISTS makes the migration idempotent.

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'soil_certificate';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'urban_planning_info';
