-- ── Global Settings table ────────────────────────────────────────────────────
-- Stores cross-dashboard configuration as key/value rows.
-- Currently used by: NIE IQE1 Image Compressor (image_compression_limits)
-- Run this once in Supabase Dashboard → SQL Editor.

create table if not exists public.global_settings (
  key        text        primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.global_settings enable row level security;

-- Allow everyone (anon + authenticated) to read settings
create policy "global_settings_select"
  on public.global_settings for select
  to anon, authenticated
  using (true);

-- Allow everyone (anon + authenticated) to insert/update settings
-- This app is admin-only (allowlist), so anon key access is acceptable here.
create policy "global_settings_upsert"
  on public.global_settings for insert
  to anon, authenticated
  with check (true);

create policy "global_settings_update"
  on public.global_settings for update
  to anon, authenticated
  using (true)
  with check (true);

-- Seed the default image compression limits (no-op if already present)
insert into public.global_settings (key, value)
values ('image_compression_limits', '{"minKB": 60, "maxKB": 200}'::jsonb)
on conflict (key) do nothing;
