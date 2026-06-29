ALTER TABLE "restaurants" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "table_numbers" jsonb DEFAULT '[]'::jsonb;