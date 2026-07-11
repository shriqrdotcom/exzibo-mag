-- ── Migration 0004: Add global tables ──────────────────────────────────────────
-- Creates tables previously held in Supabase that are now migrated to Neon.

CREATE TABLE IF NOT EXISTS global_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB    NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id       TEXT PRIMARY KEY,
  global_config JSONB    NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic      TEXT,
  message    TEXT        NOT NULL,
  send_to    TEXT[]      NOT NULL DEFAULT '{}',
  sent_by    TEXT        NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS active_notification (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  target_roles TEXT[]      NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  target_roles TEXT[]      NOT NULL DEFAULT '{}',
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  expires_at TIMESTAMPTZ,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS help_notifications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name  TEXT        NOT NULL DEFAULT 'Unknown',
  restaurant_uid   TEXT,
  user_role        TEXT        NOT NULL DEFAULT 'admin',
  feedback         TEXT,
  message          TEXT        NOT NULL DEFAULT 'Help Requested',
  status           TEXT        NOT NULL DEFAULT 'unread',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
