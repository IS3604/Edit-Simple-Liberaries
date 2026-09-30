-- ============================================================
-- v7: storage usage for the owner (master admin). Run once. Safe to re-run.
-- ============================================================
create or replace function public.storage_usage() returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_master() then raise exception 'Not allowed'; end if;
  return json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'videos'),
    'storage_files', (select count(*) from storage.objects where bucket_id = 'videos'),
    'videos', (select count(*) from public.videos),
    'videos_b2', (select count(*) from public.videos where video_url like 'b2:%')
  );
end $$;
revoke all on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
