-- Optional folder context for bulk intake (apply in Supabase SQL editor or CLI).
ALTER TABLE intake_uploads
  ADD COLUMN IF NOT EXISTS source_relative_path TEXT;

COMMENT ON COLUMN intake_uploads.source_relative_path IS
  'Original path within an uploaded folder (webkitRelativePath), for display and debugging.';
