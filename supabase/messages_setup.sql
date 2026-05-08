-- ── Messages table for cross-device real-time notifications ─────────────────
-- Run this in your Supabase Dashboard → SQL Editor

create table if not exists public.messages (
  id         uuid        primary key default gen_random_uuid(),
  topic      text        not null,
  message    text        not null,
  send_to    text[]      not null default '{}',
  sent_by    text        not null default 'Master Control',
  created_at timestamptz not null default now(),
  is_read    boolean     not null default false
);

-- Enable Row Level Security
alter table public.messages enable row level security;

-- Allow anyone to read messages (client-side role filtering)
create policy "Public read access for messages"
  on public.messages for select
  using (true);

-- Allow anyone to insert messages (Master Control uses anon key)
create policy "Public insert access for messages"
  on public.messages for insert
  with check (true);

-- Enable Realtime for this table
alter publication supabase_realtime add table public.messages;
