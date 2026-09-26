-- ============================================================
-- Unique titles. Run once in SQL Editor (after variants.sql). Safe to re-run.
-- The FILE decides duplicates (→ "Title - Variant N", see variants.sql).
-- The TITLE just has to be unique: a different video with a used title is saved as "Title (2)", "Title (3)", …
-- ============================================================
create or replace function public.unique_video_title(t text, except_id uuid default null) returns text
language plpgsql stable security definer set search_path = public
as $$
declare base text; cand text; n int := 2;
begin
  cand := btrim(coalesce(t, ''));
  if cand = '' then return cand; end if;
  if not exists (select 1 from public.videos where lower(btrim(title)) = lower(cand) and id is distinct from except_id) then return cand; end if;
  base := regexp_replace(cand, '\s*\(\d+\)$', '');
  loop
    cand := base || ' (' || n || ')';
    exit when not exists (select 1 from public.videos where lower(btrim(title)) = lower(cand) and id is distinct from except_id);
    n := n + 1;
  end loop;
  return cand;
end $$;
revoke all on function public.unique_video_title(text, uuid) from public, anon;
grant execute on function public.unique_video_title(text, uuid) to authenticated;

create or replace function public.videos_unique_title() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.title is not distinct from old.title then return new; end if;
  perform pg_advisory_xact_lock(hashtext('videos_title'));          -- two uploads at once can't grab the same title
  new.title := public.unique_video_title(new.title, new.id);
  return new;
end $$;
-- "a_videos_xtitle" sorts after "a_videos_variant" (so "- Variant N" is applied first) and before b_videos_both / videos_before_write
drop trigger if exists a_videos_xtitle on public.videos;
create trigger a_videos_xtitle before insert or update of title, file_hash on public.videos
for each row execute function public.videos_unique_title();

-- One-time cleanup: rename existing clashing titles (oldest keeps its title)
do $$ declare r record; begin
  for r in select id, title from (select id, title, row_number() over (partition by lower(btrim(title)) order by created_at, id) rn from public.videos) x where rn > 1 order by title loop
    update public.videos set title = public.unique_video_title(r.title, r.id) where id = r.id;
  end loop;
end $$;
