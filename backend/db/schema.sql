CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_code TEXT UNIQUE,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  city TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  languages TEXT[] NOT NULL DEFAULT '{}'::text[],
  trust_score INTEGER NOT NULL DEFAULT 60 CHECK (trust_score BETWEEN 0 AND 100),
  jobs_completed INTEGER NOT NULL DEFAULT 0 CHECK (jobs_completed >= 0),
  years_experience INTEGER NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_badges (
  id BIGSERIAL PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worker_id, badge)
);

CREATE TABLE IF NOT EXISTS recruiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  city TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'recruiter')),
  identifier TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  recruiter_id UUID REFERENCES recruiters(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID REFERENCES recruiters(id) ON DELETE SET NULL,
  assigned_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  required_trade TEXT NOT NULL,
  budget NUMERIC(12, 2) NOT NULL CHECK (budget >= 0),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  target_role TEXT NULL CHECK (target_role IN ('admin', 'worker', 'recruiter', 'all')),
  target_user_id UUID NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  reset_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workers_set_updated_at ON workers;
CREATE TRIGGER workers_set_updated_at
BEFORE UPDATE ON workers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS recruiters_set_updated_at ON recruiters;
CREATE TRIGGER recruiters_set_updated_at
BEFORE UPDATE ON recruiters
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS jobs_set_updated_at ON jobs;
CREATE TRIGGER jobs_set_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS app_users_set_updated_at ON app_users;
CREATE TRIGGER app_users_set_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_workers_trade ON workers(trade);
CREATE INDEX IF NOT EXISTS idx_workers_city ON workers(city);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_users_identifier ON app_users(identifier);
CREATE INDEX IF NOT EXISTS idx_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON notifications(target_role);
CREATE INDEX IF NOT EXISTS idx_notifications_target_user ON notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_requests(expires_at DESC);

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS assigned_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS worker_code TEXT;

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '';

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'idx_workers_worker_code'
  ) THEN
    CREATE UNIQUE INDEX idx_workers_worker_code ON workers(worker_code) WHERE worker_code IS NOT NULL;
  END IF;
END $$;
