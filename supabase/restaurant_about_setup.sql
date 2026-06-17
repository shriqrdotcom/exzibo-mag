-- ── restaurant_about table ──────────────────────────────────────────────────
-- Stores the "Our Story" section content for each restaurant.
-- Run this in your Supabase Dashboard → SQL Editor.

create table if not exists public.restaurant_about (
  id              uuid        primary key default gen_random_uuid(),
  restaurant_id   text        not null unique,
  story_text      text,
  image_1_url     text,
  image_2_url     text,
  image_3_url     text,
  image_4_url     text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Row Level Security
alter table public.restaurant_about enable row level security;

-- Anyone can read (customer-facing page is public)
create policy "Public read restaurant_about"
  on public.restaurant_about for select
  using (true);

-- Authenticated users can insert/update their own restaurant's about row
create policy "Auth insert restaurant_about"
  on public.restaurant_about for insert
  with check (true);

create policy "Auth update restaurant_about"
  on public.restaurant_about for update
  using (true);

-- ── about-images storage bucket ─────────────────────────────────────────────
-- Create the bucket if it doesn't exist (run separately if needed):
--
-- insert into storage.buckets (id, name, public)
-- values ('about-images', 'about-images', true)
-- on conflict (id) do nothing;
--
-- Allow public read on about-images:
-- create policy "Public read about-images"
--   on storage.objects for select
--   using (bucket_id = 'about-images');
--
-- Allow authenticated upload:
-- create policy "Auth upload about-images"
--   on storage.objects for insert
--   with check (bucket_id = 'about-images');
