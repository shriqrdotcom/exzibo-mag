-- Additive mobile menu contract and menu realtime support.
-- This migration is intentionally forward-only and guarded so it is safe when
-- a branch already contains part of the contract.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preparation_time_minutes integer,
  ADD COLUMN IF NOT EXISTS food_type text NOT NULL DEFAULT 'veg',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS menu_items_restaurant_position_idx
  ON public.menu_items (restaurant_id, position);

CREATE INDEX IF NOT EXISTS menu_items_archived_idx
  ON public.menu_items (restaurant_id, is_archived);

CREATE TABLE IF NOT EXISTS public.menu_item_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  public_url text NOT NULL,
  alt_text text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_gallery_object_key_unique
  ON public.menu_item_gallery (object_key);

CREATE INDEX IF NOT EXISTS menu_item_gallery_item_position_idx
  ON public.menu_item_gallery (menu_item_id, position);

CREATE INDEX IF NOT EXISTS menu_item_gallery_restaurant_id_idx
  ON public.menu_item_gallery (restaurant_id);

ALTER TABLE public.realtime_outbox
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.realtime_outbox
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS entity_id text;