-- Migration: canonical Better Auth identity types
--
-- Better Auth user.id is TEXT, not a native Postgres UUID. Any column that
-- stores a Better Auth user id must therefore be TEXT or inserts will fail
-- with "invalid input syntax for type uuid" for users whose id was generated
-- before the UUID override was added (Better Auth's default generator produces
-- a 32-char alphanumeric string, not a UUID).
--
-- Columns converted:
--   restaurants.owner_id          uuid → text
--   restaurant_members.user_id    uuid → text
--   restaurant_members.owner_id   uuid → text
--   audit_logs.user_id            uuid → text
--
-- NOT changed (these are application-owned UUIDs, not Better Auth ids):
--   restaurants.id                uuid  (gen_random_uuid() — unchanged)
--   restaurant_members.id         uuid  (gen_random_uuid() — unchanged)
--   restaurant_members.restaurant_id uuid (FK to restaurants.id — unchanged)
--   audit_logs.id                 uuid  (gen_random_uuid() — unchanged)
--   audit_logs.restaurant_id      uuid  (FK to restaurants.id — unchanged)
--
-- The USING ...::text expression is safe for both uuid and text source data;
-- it is a no-op when the live column is already text (e.g. after db:push).

ALTER TABLE "restaurants"
  ALTER COLUMN "owner_id" TYPE text USING "owner_id"::text;
--> statement-breakpoint
ALTER TABLE "restaurant_members"
  ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
--> statement-breakpoint
ALTER TABLE "restaurant_members"
  ALTER COLUMN "owner_id" TYPE text USING "owner_id"::text;
--> statement-breakpoint
ALTER TABLE "audit_logs"
  ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
