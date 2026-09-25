-- Maintenance switch. Run once in Supabase → SQL Editor.
-- Toggle: Table Editor → site_settings → set "maintenance" to true/false (takes effect within ~20s, no redeploy).
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),         -- single row
  maintenance boolean not null default false,
  message text default 'We''re making some improvements. Please check back shortly.',
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;
alter table public.site_settings enable row level security;
drop policy if exists "settings readable" on public.site_settings;
create policy "settings readable" on public.site_settings for select to anon, authenticated using (true);
-- No insert/update/delete policies: only the Supabase dashboard (owner) can flip the switch.
revoke insert, update, delete on public.site_settings from anon, authenticated;
