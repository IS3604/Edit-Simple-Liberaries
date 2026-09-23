-- ============================================================
-- Duplicate uploads → "Title - Variant 1", "Variant 2", …
-- Run once in SQL Editor. Safe to re-run.
-- ============================================================
alter table public.videos add column if not exists file_hash text;
create index if not exists videos_file_hash_idx on public.videos (file_hash);

create or replace function public.videos_variant_title() returns trigger
language plpgsql security definer set search_path = public
as $$
declare n int; base text;
begin
  if new.file_hash is null then return new; end if;
  if tg_op = 'UPDATE' and new.file_hash is not distinct from old.file_hash then return new; end if;
  select count(*) into n from public.videos where file_hash = new.file_hash and id <> new.id;
  if n > 0 then
    base := regexp_replace(new.title, '\s*-\s*Variant\s+\d+$', '', 'i');
    new.title := base || ' - Variant ' || n;
  end if;
  return new;
end $$;
-- name starts with "a_" so it runs before videos_before_write (which builds search text)
drop trigger if exists a_videos_variant on public.videos;
create trigger a_videos_variant before insert or update of file_hash on public.videos
for each row execute function public.videos_variant_title();
