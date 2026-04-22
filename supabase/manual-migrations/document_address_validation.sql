-- Per-document address validation vs property_addresses (upload / future import flows)

ALTER TABLE documents ADD COLUMN IF NOT EXISTS expected_property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expected_address TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_document_address TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS address_match_status TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS address_match_confidence DOUBLE PRECISION;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS address_match_reason TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS address_match_user_overridden BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_address_match_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_address_match_status_check CHECK (
  address_match_status IS NULL
  OR address_match_status IN ('match', 'possible_match', 'mismatch', 'unknown')
);

CREATE INDEX IF NOT EXISTS idx_documents_address_match_status ON documents(address_match_status);
