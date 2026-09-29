-- ============================================================
-- v4: download stats. Run once in SQL Editor. Safe to re-run.
-- ============================================================

-- 2) Download log. No direct table access: write via log_download(), read via download_stats().
create table if not exists public.downloads (
  id bigint generated always as identity primary key,
  video_id uuid references public.videos(id) on delete set null,
  title text, category text,                      -- snapshot, so stats survive deletes/renames
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists downloads_created_idx on public.downloads (created_at);
create index if not exists downloads_video_idx on public.downloads (video_id);
alter table public.downloads enable row level security;
revoke all on public.downloads from anon, authenticated;

create or replace function public.log_download(p_video uuid) returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare v record;
begin
  if auth.uid() is null or public.my_role() is null then return false; end if;           -- team members only
  select id, title, category into v from public.videos where id = p_video and status = 'approved' and published;
  if not found then return false; end if;
  -- ignore repeats of the same video by the same person within 2 minutes (double clicks / spam)
  if exists (select 1 from public.downloads where user_id = auth.uid() and video_id = p_video and created_at > now() - interval '2 minutes') then return false; end if;
  -- hard cap: 300 logged downloads per person per hour
  if (select count(*) from public.downloads where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 300 then return false; end if;
  insert into public.downloads (video_id, title, category) values (v.id, v.title, v.category);
  return true;
end $$;
revoke all on function public.log_download(uuid) from public, anon;
grant execute on function public.log_download(uuid) to authenticated;

-- Stats for superadmins / owner. Owner's own downloads are hidden from everyone but the owner.
create or replace function public.download_stats(p_days int default 30) returns json
language plpgsql stable security definer set search_path = public
as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); me_top boolean := public.is_master(); r json;
begin
  if not public.is_superadmin() then raise exception 'Not allowed'; end if;
  with base as (
    select dl.* from public.downloads dl
    where me_top or not exists (select 1 from public.admins a where a.user_id = dl.user_id and a.role::text = 'masteradmin')
  ), win as (select * from base where created_at >= date_trunc('day', now()) - make_interval(days => d - 1))
  select json_build_object(
    'days', d,
    'total', (select count(*) from base),
    'in_range', (select count(*) from win),
    'today', (select count(*) from base where created_at >= date_trunc('day', now())),
    'last7', (select count(*) from base where created_at >= now() - interval '7 days'),
    'videos', (select count(distinct video_id) from win),
    'people', (select count(distinct user_id) from win),
    'daily', (select coalesce(json_agg(json_build_object('day', g::date, 'n', coalesce(c.n, 0)) order by g), '[]')
              from generate_series(date_trunc('day', now()) - make_interval(days => d - 1), date_trunc('day', now()), interval '1 day') g
              left join (select date_trunc('day', created_at) dd, count(*) n from win group by 1) c on c.dd = g),
    'top', (select coalesce(json_agg(t), '[]') from (select video_id as id, coalesce(v.title, max(w.title)) as title, coalesce(v.category, max(w.category)) as category, count(*) n
              from win w left join public.videos v on v.id = w.video_id group by video_id, v.title, v.category order by n desc, title limit 10) t),
    'by_category', (select coalesce(json_agg(t), '[]') from (select category, count(*) n from win group by category order by n desc) t),
    'by_member', case when me_top then (select coalesce(json_agg(t), '[]') from (select coalesce(a.email, 'removed member') email, count(*) n from win w left join public.admins a on a.user_id = w.user_id group by a.email order by n desc limit 20) t) end
  ) into r;
  return r;
end $$;
revoke all on function public.download_stats(int) from public, anon;
grant execute on function public.download_stats(int) to authenticated;
