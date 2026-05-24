-- ── Global Settings table ────────────────────────────────────────────────────
-- Stores cross-dashboard configuration as key/value rows.
-- Currently used by: NIE IQE1 Image Compressor (image_compression_limits)
--
-- !! Run this ONCE in Supabase Dashboard → SQL Editor !!
-- After running, the Image Compressor's Save Limits button will persist to
-- Supabase and all upload components will fetch the live value on mount AND
-- receive real-time pushes whenever limits change.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.global_settings (
  key        text        primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.global_settings enable row level security;

-- Anyone (anon + authenticated) can read — needed by all dashboards
create policy "global_settings_select"
  on public.global_settings for select
  to anon, authenticated
  using (true);

-- Anyone can insert (first-time seed from the app)
create policy "global_settings_insert"
  on public.global_settings for insert
  to anon, authenticated
  with check (true);

-- Anyone can update (super-admin saves new limits)
create policy "global_settings_update"
  on public.global_settings for update
  to anon, authenticated
  using (true)
  with check (true);

-- ── Enable Postgres logical replication (Supabase Realtime) ───────────────────
-- This lets all open dashboards receive live pushes when limits change.
alter publication supabase_realtime add table public.global_settings;

-- ── Seed defaults (no-op if row already exists) ───────────────────────────────
insert into public.global_settings (key, value)
values ('image_compression_limits', '{"minKB": 60, "maxKB": 200}'::jsonb)
on conflict (key) do nothing;
