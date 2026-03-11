-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Properties table
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document types table
CREATE TABLE document_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed document types
INSERT INTO document_types (name) VALUES
  ('EPC'),
  ('ASBESTOS'),
  ('ELECTRICAL')
ON CONFLICT (name) DO NOTHING;

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis runs table
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error')),
  result_json JSONB,
  model_name TEXT,
  prompt_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Red flags table
CREATE TABLE red_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('red', 'orange', 'green')),
  title TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_properties_user_id ON properties(user_id);
CREATE INDEX idx_documents_property_id ON documents(property_id);
CREATE INDEX idx_documents_document_type_id ON documents(document_type_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_analysis_runs_document_id ON analysis_runs(document_id);
CREATE INDEX idx_analysis_runs_status ON analysis_runs(status);
CREATE INDEX idx_red_flags_document_id ON red_flags(document_id);
CREATE INDEX idx_red_flags_severity ON red_flags(severity);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for properties
CREATE POLICY "Users can read their own properties"
  ON properties FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own properties"
  ON properties FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own properties"
  ON properties FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own properties"
  ON properties FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for document_types (read-only for authenticated users)
CREATE POLICY "Authenticated users can read document types"
  ON document_types FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for documents
CREATE POLICY "Users can read documents for their own properties"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert documents for their own properties"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update documents for their own properties"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents for their own properties"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = documents.property_id
      AND properties.user_id = auth.uid()
    )
  );

-- RLS Policies for analysis_runs
CREATE POLICY "Users can read analysis runs for their own documents"
  ON analysis_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert analysis runs for their own documents"
  ON analysis_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update analysis runs for their own documents"
  ON analysis_runs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete analysis runs for their own documents"
  ON analysis_runs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = analysis_runs.document_id
      AND properties.user_id = auth.uid()
    )
  );

-- RLS Policies for red_flags
CREATE POLICY "Users can read red flags for their own documents"
  ON red_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert red flags for their own documents"
  ON red_flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update red flags for their own documents"
  ON red_flags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete red flags for their own documents"
  ON red_flags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      INNER JOIN properties ON documents.property_id = properties.id
      WHERE documents.id = red_flags.document_id
      AND properties.user_id = auth.uid()
    )
  );

