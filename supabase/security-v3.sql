-- ============================================================
-- v3: private website + protected roles + top-level owner role + "For Both" rule
-- Run after all earlier files. Safe to re-run.
-- ============================================================

-- 1) Owner role value (works whether admins.role is text or the admin_role enum)
do $$ begin
  if exists (select 1 from pg_type where typname = 'admin_role') then
    execute 'alter type public.admin_role add value if not exists ''masteradmin''';
  end if;
end $$;
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role::text in ('admin','superadmin','masteradmin'));

-- 2) Role helpers (the owner role is reported to the app as 'superadmin')
create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role::text = 'masteradmin' from public.admins where user_id = auth.uid()), false) $$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role::text in ('superadmin','masteradmin') from public.admins where user_id = auth.uid()), false) $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$ select case when role::text = 'masteradmin' then 'superadmin' else role::text end from public.admins where user_id = auth.uid() $$;

-- neutral name used by the app: may this user change other superadmins?
create or replace function public.can_manage_all() returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_master() $$;

-- 3) Team table permissions
drop policy if exists "Admins see admins" on public.admins;
create policy "Admins see admins" on public.admins for select
  using (public.is_admin() and (role::text <> 'masteradmin' or user_id = auth.uid() or public.is_master()));
drop policy if exists "Superadmin manages admins" on public.admins;
drop policy if exists "Team insert" on public.admins;
drop policy if exists "Team update" on public.admins;
drop policy if exists "Team delete" on public.admins;
create policy "Team insert" on public.admins for insert
  with check (public.is_superadmin() and role::text in ('admin','superadmin'));
-- superadmin: may only change ADMIN members (incl. promoting them); owner: anyone except self/owners
create policy "Team update" on public.admins for update
  using (user_id <> auth.uid() and role::text <> 'masteradmin' and (public.is_master() or (public.is_superadmin() and role::text = 'admin')))
  with check (role::text in ('admin','superadmin') and public.is_superadmin());
create policy "Team delete" on public.admins for delete
  using (user_id <> auth.uid() and role::text <> 'masteradmin' and (public.is_master() or (public.is_superadmin() and role::text = 'admin')));

-- add_admin: same rules as above
drop function if exists public.add_admin(text, text);
create or replace function public.add_admin(p_email text, p_role text default 'admin') returns text
language plpgsql security definer set search_path = public, auth
as $$
declare uid uuid; e text := lower(trim(p_email)); cur text;
begin
  if not public.is_superadmin() then raise exception 'Only superadmin can add members'; end if;
  if p_role not in ('admin','superadmin') then raise exception 'Invalid role'; end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then
    insert into public.admin_invites (email, role) values (e, p_role)
    on conflict (email) do update set role = excluded.role;
    return 'invited';
  end if;
  if uid = auth.uid() then raise exception 'You cannot change your own role'; end if;
  select role::text into cur from public.admins where user_id = uid;
  if cur = 'masteradmin' or (cur = 'superadmin' and not public.is_master()) then
    raise exception 'This member is protected. You cannot change their role.';
  end if;
  execute format('insert into public.admins (user_id, role, email) values (%L, %L, %L)
    on conflict (user_id) do update set role = excluded.role, email = excluded.email', uid, p_role, e);
  delete from public.admin_invites where email = e;
  return 'added';
end $$;

-- 4) Private website: only logged-in team members can read anything
drop policy if exists "Public read published videos" on public.videos;
drop policy if exists "Public read categories" on public.categories;
drop policy if exists "Admins read categories" on public.categories;
create policy "Admins read categories" on public.categories for select using (public.is_admin());
update storage.buckets set public = false where id = 'videos';
drop policy if exists "Public read videos bucket" on storage.objects;
drop policy if exists "Admins read videos bucket" on storage.objects;
create policy "Admins read videos bucket" on storage.objects for select using (bucket_id = 'videos' and public.is_admin());

-- 5) "For Both" only when the same video already exists in For Lawyers AND For Doctors
create or replace function public.videos_both_rule() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.category <> 'both' then return new; end if;
  if tg_op = 'UPDATE' and new.category is not distinct from old.category and new.file_hash is not distinct from old.file_hash then return new; end if;
  if new.file_hash is null
     or not exists (select 1 from public.videos where file_hash = new.file_hash and category = 'lawyers' and status <> 'rejected' and id <> new.id)
     or not exists (select 1 from public.videos where file_hash = new.file_hash and category = 'doctors' and status <> 'rejected' and id <> new.id) then
    raise exception 'A video can go in "For Both" only if the same video is already in "For Lawyers" and "For Doctors".';
  end if;
  return new;
end $$;
drop trigger if exists b_videos_both on public.videos;
create trigger b_videos_both before insert or update of category, file_hash on public.videos
for each row execute function public.videos_both_rule();

-- ============================================================
-- Make yourself the owner (run once, change the email):
-- update public.admins set role = 'masteradmin' where user_id = (select id from auth.users where email = 'YOUR_EMAIL');
-- ============================================================
