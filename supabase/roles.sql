-- ============================================================
-- ROLES + APPROVAL WORKFLOW + SEARCH   (run AFTER schema.sql and admin.sql)
-- Safe to run more than once.
-- ============================================================

-- 1) Roles ----------------------------------------------------
alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('admin','superadmin'));
alter table public.admins add column if not exists email text;
alter table public.admins add column if not exists created_at timestamptz default now();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.admins where user_id = auth.uid() $$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'superadmin' from public.admins where user_id = auth.uid()), false) $$;

drop policy if exists "Admins see admins" on public.admins;
create policy "Admins see admins" on public.admins for select using (public.is_admin());
drop policy if exists "Superadmin manages admins" on public.admins;
create policy "Superadmin manages admins" on public.admins for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Superadmin: add an admin by email (user must exist in Authentication → Users)
create or replace function public.add_admin(p_email text, p_role text default 'admin') returns void
language plpgsql security definer set search_path = public, auth
as $$
declare uid uuid;
begin
  if not public.is_superadmin() then raise exception 'Only superadmin can add admins'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'No user with email %. Create it first in Authentication → Users.', p_email; end if;
  insert into public.admins (user_id, role, email) values (uid, p_role, lower(p_email))
  on conflict (user_id) do update set role = excluded.role, email = excluded.email;
end $$;

-- 2) Video status + search columns ----------------------------
alter table public.videos add column if not exists content text;                 -- "what's in the video"
alter table public.videos add column if not exists status text not null default 'approved';
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check check (status in ('pending','approved','rejected'));
alter table public.videos add column if not exists submitted_by uuid references auth.users(id);
alter table public.videos add column if not exists reviewed_by uuid references auth.users(id);
alter table public.videos add column if not exists review_note text;
alter table public.videos add column if not exists search_text text;
create extension if not exists pg_trgm;
create index if not exists videos_search_trgm on public.videos using gin (search_text gin_trgm_ops);
create index if not exists videos_live_idx on public.videos (published, status, created_at desc);

-- Trigger: keep search_text fresh + force approval rules
create or replace function public.videos_before_write() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.search_text := lower(concat_ws(' ', new.title, new.description, new.content, array_to_string(new.tags, ' '), new.category, new.subcategory));
  if tg_op = 'INSERT' then
    new.submitted_by := coalesce(new.submitted_by, auth.uid());
  end if;
  if auth.uid() is not null and not public.is_superadmin() then
    new.status := 'pending';          -- normal admins can never publish directly
    new.reviewed_by := null;
    if tg_op = 'INSERT' then new.review_note := null; end if;
  elsif tg_op = 'INSERT' and public.is_superadmin() and new.status = 'pending' then
    new.status := 'approved';         -- superadmin uploads go live immediately
    new.reviewed_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists videos_before_write on public.videos;
create trigger videos_before_write before insert or update on public.videos
for each row execute function public.videos_before_write();
update public.videos set title = title;   -- backfill search_text

-- Public sees only approved + published
drop policy if exists "Public read published videos" on public.videos;
create policy "Public read published videos" on public.videos for select using (published = true and status = 'approved');

-- Replace old "admin can do everything" policy with role-based ones
drop policy if exists "Admin all videos" on public.videos;
drop policy if exists "Admins read all videos" on public.videos;
create policy "Admins read all videos" on public.videos for select using (public.is_admin());
drop policy if exists "Superadmin full videos" on public.videos;
create policy "Superadmin full videos" on public.videos for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists "Admin insert videos" on public.videos;
create policy "Admin insert videos" on public.videos for insert with check (public.is_admin());
-- Normal admin may edit/delete only their OWN videos that are not live yet
drop policy if exists "Admin edit own unapproved" on public.videos;
create policy "Admin edit own unapproved" on public.videos for update
  using (public.is_admin() and submitted_by = auth.uid() and status <> 'approved')
  with check (public.is_admin() and submitted_by = auth.uid());
drop policy if exists "Admin delete own unapproved" on public.videos;
create policy "Admin delete own unapproved" on public.videos for delete
  using (public.is_admin() and submitted_by = auth.uid() and status <> 'approved');

-- 3) Categories: only superadmin writes directly ---------------
drop policy if exists "Admin write categories" on public.categories;
drop policy if exists "Superadmin write categories" on public.categories;
create policy "Superadmin write categories" on public.categories for all using (public.is_superadmin()) with check (public.is_superadmin());

-- 4) Change requests (admin proposes, superadmin approves) -----
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('video','category')),
  action text not null check (action in ('insert','update','delete')),
  target text,                 -- video id or category slug
  payload jsonb default '{}',
  summary text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid default auth.uid() references auth.users(id),
  requested_email text,
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);
alter table public.change_requests enable row level security;
drop policy if exists "Admins read requests" on public.change_requests;
create policy "Admins read requests" on public.change_requests for select using (public.is_admin());
drop policy if exists "Admins create requests" on public.change_requests;
create policy "Admins create requests" on public.change_requests for insert with check (public.is_admin() and status = 'pending' and requested_by = auth.uid());
drop policy if exists "Admin cancel own pending" on public.change_requests;
create policy "Admin cancel own pending" on public.change_requests for delete using (requested_by = auth.uid() and status = 'pending');
drop policy if exists "Superadmin manage requests" on public.change_requests;
create policy "Superadmin manage requests" on public.change_requests for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Superadmin approves / rejects a change request
create or replace function public.review_change_request(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare r public.change_requests; p jsonb;
begin
  if not public.is_superadmin() then raise exception 'Only superadmin can review'; end if;
  select * into r from public.change_requests where id = p_id for update;
  if r is null or r.status <> 'pending' then raise exception 'Request not found or already reviewed'; end if;
  p := r.payload;
  if p_approve then
    if r.entity = 'category' then
      if r.action = 'insert' then
        insert into public.categories (slug,name,parent_slug,icon,blurb,sort)
        values (p->>'slug', p->>'name', nullif(p->>'parent_slug',''), p->>'icon', p->>'blurb', coalesce((p->>'sort')::int,0));
      elsif r.action = 'update' then
        update public.categories set slug=p->>'slug', name=p->>'name', parent_slug=nullif(p->>'parent_slug',''),
          icon=p->>'icon', blurb=p->>'blurb', sort=coalesce((p->>'sort')::int,0) where slug = r.target;
        if r.target <> p->>'slug' then
          update public.videos set category = p->>'slug' where category = r.target;
          update public.videos set subcategory = p->>'slug' where subcategory = r.target;
        end if;
      elsif r.action = 'delete' then
        if exists (select 1 from public.videos where category = r.target or subcategory = r.target) then
          raise exception 'Category still has videos'; end if;
        delete from public.categories where slug = r.target;
      end if;
    elsif r.entity = 'video' then
      if r.action = 'update' then
        update public.videos set title=p->>'title', description=p->>'description', content=p->>'content',
          category=p->>'category', subcategory=p->>'subcategory',
          video_url=coalesce(p->>'video_url', video_url), thumbnail_url=coalesce(p->>'thumbnail_url', thumbnail_url),
          duration_seconds=coalesce((p->>'duration_seconds')::int, duration_seconds), resolution=p->>'resolution',
          fps=coalesce((p->>'fps')::int,fps), orientation=p->>'orientation',
          tags=coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'),
          published=coalesce((p->>'published')::boolean, published)
        where id = r.target::uuid;
      elsif r.action = 'delete' then
        delete from public.videos where id = r.target::uuid;
      end if;
    end if;
  end if;
  update public.change_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), review_note = p_note, reviewed_at = now() where id = p_id;
end $$;

-- 5) Storage: admins upload, only superadmin deletes -----------
drop policy if exists "Admin delete videos bucket" on storage.objects;
drop policy if exists "Superadmin delete videos bucket" on storage.objects;
create policy "Superadmin delete videos bucket" on storage.objects for delete using (bucket_id='videos' and public.is_superadmin());
drop policy if exists "Admin delete own objects" on storage.objects;
create policy "Admin delete own objects" on storage.objects for delete using (bucket_id='videos' and public.is_admin() and owner = auth.uid());

-- 6) MAKE YOURSELF SUPERADMIN (change the email) ---------------
-- update public.admins set role = 'superadmin' where user_id = (select id from auth.users where email = 'YOUR_EMAIL');

-- backfill admin emails
update public.admins a set email = u.email from auth.users u where u.id = a.user_id and a.email is null;
