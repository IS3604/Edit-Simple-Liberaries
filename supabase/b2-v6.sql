-- ============================================================
-- v6: videos in Backblaze B2. Run once (after remove-both-v5.sql). Safe to re-run.
-- Whenever a video is deleted or its file replaced, the old file is queued in storage_cleanup
-- (Supabase path, or "b2:videos/…" for B2). A superadmin session then deletes it for real.
-- ============================================================
create or replace function public.queue_old_files() returns trigger
language plpgsql security definer set search_path = public
as $$
declare p text; u text;
begin
  foreach u in array array[old.video_url, old.thumbnail_url] loop
    continue when u is null;
    if tg_op = 'UPDATE' and (u = new.video_url or u = new.thumbnail_url) then continue; end if;
    p := case when u like 'b2:videos/%' then u
              else substring(u from '/storage/v1/object/(?:public|sign)/videos/([^?]+)') end;
    continue when p is null;
    -- keep files another row still uses
    continue when exists (select 1 from public.videos v where v.id <> old.id and (v.video_url = u or v.thumbnail_url = u or v.video_url like '%/videos/' || p || '%' or v.thumbnail_url like '%/videos/' || p || '%'));
    insert into public.storage_cleanup (path) values (p) on conflict do nothing;
  end loop;
  return null;
end $$;
drop trigger if exists videos_queue_files on public.videos;
create trigger videos_queue_files after delete or update of video_url, thumbnail_url on public.videos
for each row execute function public.queue_old_files();

-- a B2 path must look like one (no tricks with other buckets/keys)
alter table public.videos drop constraint if exists videos_b2_path;
alter table public.videos add constraint videos_b2_path check (video_url is null or video_url not like 'b2:%' or video_url ~ '^b2:videos/[A-Za-z0-9_\-/.]+$' and video_url not like '%..%') not valid;
