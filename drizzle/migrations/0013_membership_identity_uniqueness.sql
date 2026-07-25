-- 0013_membership_identity_uniqueness.sql
--
-- Add partial unique indexes to enforce active-membership uniqueness at the
-- database level, as required by Prompt 14.
--
-- Active predicate: active = true
-- (restaurant_members has no deleted/deleted_at column; soft-deletion is not
--  used for this table.  Inactive rows are excluded from both indexes.)
--
-- Index A: Accepted (claimed) membership
--   Prevents two active rows with the same user_id at the same restaurant.
--   WHERE user_id IS NOT NULL AND active = true
--
-- Index B: Unclaimed (email-only) membership
--   Prevents two active unclaimed rows with the same normalized email at the
--   same restaurant.
--   WHERE user_id IS NULL AND email IS NOT NULL AND active = true
--
-- Both indexes are additive — they do not modify existing rows.
-- Run checkDuplicateMemberships.js before applying this migration to verify
-- that no existing data violates these constraints.
-- ==========================================================================

-- Index A: Active accepted-membership uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_active_user_id
  ON restaurant_members (restaurant_id, user_id)
  WHERE user_id IS NOT NULL AND active = true;

-- Index B: Active unclaimed-membership uniqueness (by normalized email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_active_unclaimed_email
  ON restaurant_members (restaurant_id, lower(trim(email)))
  WHERE user_id IS NULL AND email IS NOT NULL AND active = true;
