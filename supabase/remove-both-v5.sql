-- ============================================================
-- v5: remove the "Both" category; names back to "For Lawyers" / "For Doctors". Run once (after downloads-v4.sql). Safe to re-run.
-- ============================================================
-- 1) Names
update public.categories set name = 'For ' || regexp_replace(name, '^\s*For\s+', '', 'i') where slug in ('lawyers', 'doctors') and name !~* '^\s*For\s+';

-- 2) Files of "Both" videos are queued for removal; the superadmin panel deletes them from Storage on next login
create table if not exists public.storage_cleanup (path text primary key, queued_at timestamptz not null default now());
alter table public.storage_cleanup enable row level security;
drop policy if exists "superadmin reads cleanup" on public.storage_cleanup;
create policy "superadmin reads cleanup" on public.storage_cleanup for select using (public.is_superadmin());
drop policy if exists "superadmin clears cleanup" on public.storage_cleanup;
create policy "superadmin clears cleanup" on public.storage_cleanup for delete using (public.is_superadmin());

insert into public.storage_cleanup (path)
select distinct substring(u from '/storage/v1/object/(?:public|sign)/videos/([^?]+)')
from public.videos v, unnest(array[v.video_url, v.thumbnail_url]) u
where v.category = 'both' and u ~ '/storage/v1/object/(public|sign)/videos/'
on conflict do nothing;

-- 3) Remove "Both" videos, pending change requests about them, and the category + its subcategories
delete from public.change_requests where status = 'pending' and entity = 'video' and target in (select id::text from public.videos where category = 'both');
delete from public.videos where category = 'both';
delete from public.categories where slug = 'both' or parent_slug = 'both';

-- 4) The "Both" rule is no longer needed; block the slug from coming back by accident
drop trigger if exists b_videos_both on public.videos;
drop function if exists public.videos_both_rule();
alter table public.videos drop constraint if exists videos_no_both;
alter table public.videos add constraint videos_no_both check (category <> 'both');
