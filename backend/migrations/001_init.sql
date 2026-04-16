CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_name TEXT NOT NULL,
  requester_email TEXT,
  cost_center TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  justification TEXT,
  notes TEXT,
  status TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_flow (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES asset_requests(id),
  snipe_asset_id BIGINT NOT NULL,
  asset_tag TEXT,
  serial TEXT,
  internal_status TEXT NOT NULL,
  snipe_status TEXT,
  assigned_user_name TEXT,
  cost_center TEXT,
  department TEXT,
  location TEXT,
  notes TEXT,
  delivered_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snipe_asset_id BIGINT NOT NULL,
  movement_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  operator_id UUID REFERENCES users(id),
  requester_name TEXT,
  cost_center TEXT,
  department TEXT,
  location TEXT,
  notes TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snipe_asset_id BIGINT NOT NULL,
  movement_id UUID REFERENCES asset_movements(id),
  checklist_type TEXT NOT NULL,
  result TEXT NOT NULL,
  items_json JSONB NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snipe_asset_id BIGINT NOT NULL,
  movement_id UUID REFERENCES asset_movements(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  photos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
