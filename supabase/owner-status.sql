-- ============================================================
-- Owner extras: own title + team status overview (owner only). Safe to re-run.
-- ============================================================
-- Title shown only to the owner themself (null for everyone else)
create or replace function public.my_title() returns text
language sql stable security definer set search_path = public
as $$ select case when public.is_master() then 'Master admin' end $$;

-- Team status (owner only): account + activity details for every member
drop function if exists public.team_status();
create or replace function public.team_status()
returns table (user_id uuid, email text, role_label text, account text, joined timestamptz, last_sign_in timestamptz,
               uploads int, live int, pending int, rejected int, last_upload timestamptz)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_master() then raise exception 'Not allowed'; end if;
  return query
  select a.user_id, coalesce(u.email, a.email)::text,
         case a.role::text when 'masteradmin' then 'Master admin' when 'superadmin' then 'Superadmin' else 'Admin' end,
         case when u.id is null then 'Missing' when u.last_sign_in_at is null then 'Invite not accepted' else 'Active' end,
         u.created_at, u.last_sign_in_at,
         count(v.id)::int,
         count(v.id) filter (where v.status = 'approved' and v.published)::int,
         count(v.id) filter (where v.status = 'pending')::int,
         count(v.id) filter (where v.status = 'rejected')::int,
         max(v.created_at)
  from public.admins a
  left join auth.users u on u.id = a.user_id
  left join public.videos v on v.submitted_by = a.user_id
  group by a.user_id, u.email, a.email, a.role, u.id, u.created_at, u.last_sign_in_at
  order by (a.role::text = 'masteradmin') desc, (a.role::text = 'superadmin') desc, coalesce(u.email, a.email);
end $$;
