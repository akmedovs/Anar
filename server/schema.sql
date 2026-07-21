CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  il INTEGER NOT NULL,
  ay TEXT NOT NULL,
  ev TEXT NOT NULL,
  kiraye NUMERIC(12, 2) NOT NULL DEFAULT 0,
  kohne_isiq NUMERIC(12, 2) NOT NULL DEFAULT 0,
  yeni_isiq NUMERIC(12, 2) NOT NULL DEFAULT 0,
  serfiyyat NUMERIC(12, 2) NOT NULL DEFAULT 0,
  isiq_pulu NUMERIC(12, 2) NOT NULL DEFAULT 0,
  su_nefer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  su_cem NUMERIC(12, 2) NOT NULL DEFAULT 0,
  wifi NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_events (
  id SERIAL PRIMARY KEY,
  plate TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(5, 4),
  image_url TEXT NOT NULL DEFAULT '',
  recognition_job_public_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS vehicle_events
  ADD COLUMN IF NOT EXISTS recognition_job_public_id TEXT;

CREATE TABLE IF NOT EXISTS recognition_jobs (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'manual_review', 'approved', 'failed')),
  source TEXT NOT NULL DEFAULT 'camera',
  direction TEXT NOT NULL DEFAULT 'entry' CHECK (direction IN ('entry', 'exit')),
  capture_url TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  plate TEXT NOT NULL DEFAULT '',
  display_plate TEXT NOT NULL DEFAULT '',
  confidence NUMERIC(5, 4),
  reason TEXT NOT NULL DEFAULT '',
  bbox JSONB,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  vision JSONB NOT NULL DEFAULT '{}'::jsonb,
  detector_confidence NUMERIC(5, 4),
  ocr_backend TEXT NOT NULL DEFAULT '',
  manual_review_required BOOLEAN NOT NULL DEFAULT true,
  vehicle_event_id INTEGER REFERENCES vehicle_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS recognition_jobs
  ADD COLUMN IF NOT EXISTS input JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS wash_expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wash_water_readings (
  id SERIAL PRIMARY KEY,
  il INTEGER NOT NULL,
  ay TEXT NOT NULL,
  old_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  new_reading NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 1,
  usage_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
