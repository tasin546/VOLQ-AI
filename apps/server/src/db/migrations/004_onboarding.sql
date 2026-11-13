-- Migration 004: Onboarding completion tracking for users
-- Dual SQLite / Postgres compatible statement references

-- SQLite:
-- ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT NULL;
-- Postgres:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;

-- Backfill existing users so existing accounts never see the first-run modal:
-- UPDATE users SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE onboarding_completed_at IS NULL;
