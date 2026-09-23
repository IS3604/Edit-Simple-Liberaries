-- ============================================================
-- ADMIN INVITES  (run after roles.sql). Safe to re-run.
-- Superadmin adds an email + role in Admin → Team. When that person
-- accepts the Supabase invite (or signs up), they automatically become admin.
-- ============================================================
create table if not exists public.admin_invites (
  email text primary key,
  role text not null default 'admin',
  invited_by uuid default auth.uid(),
  created_at timestamptz default now()
);
alter table public.admin_invites enable row level security;
drop policy if exists "Superadmin manages invites" on public.admin_invites;
create policy "Superadmin manages invites" on public.admin_invites for all using (public.is_superadmin()) with check (public.is_superadmin());

-- add_admin: existing user -> admin now; unknown email -> saved as invite
drop function if exists public.add_admin(text, text);
create or replace function public.add_admin(p_email text, p_role text default 'admin') returns text
language plpgsql security definer set search_path = public, auth
as $$
declare uid uuid; e text := lower(trim(p_email));
begin
  if not public.is_superadmin() then raise exception 'Only superadmin can add admins'; end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then
    insert into public.admin_invites (email, role) values (e, p_role)
    on conflict (email) do update set role = excluded.role;
    return 'invited';
  end if;
  -- literal SQL so it works whether admins.role is text or an enum
  execute format('insert into public.admins (user_id, role, email) values (%L, %L, %L)
    on conflict (user_id) do update set role = excluded.role, email = excluded.email', uid, p_role, e);
  return 'added';
end $$;

-- When a new auth user is created (invite accepted / signup), grant pending role
create or replace function public.handle_new_user_invite() returns trigger
language plpgsql security definer set search_path = public
as $$
declare r text;
begin
  select role into r from public.admin_invites where email = lower(new.email);
  if r is not null then
    execute format('insert into public.admins (user_id, role, email) values (%L, %L, %L) on conflict (user_id) do nothing', new.id, r, lower(new.email));
    delete from public.admin_invites where email = lower(new.email);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created_invite on auth.users;
create trigger on_auth_user_created_invite after insert on auth.users
for each row execute function public.handle_new_user_invite();
