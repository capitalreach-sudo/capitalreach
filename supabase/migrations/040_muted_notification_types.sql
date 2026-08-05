-- Per-user notification muting. Empty array = everything on (the default
-- keeps existing users unchanged). Enforced in lib/notify-user.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS muted_notification_types text[] NOT NULL DEFAULT '{}';
