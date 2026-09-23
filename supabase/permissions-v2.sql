-- ============================================================
-- v2: admins can ONLY upload for review; live auto-refresh
-- Run after roles.sql + invites.sql. Safe to re-run.
-- ============================================================
-- Admins can no longer edit / delete videos (even their own pending ones)
drop policy if exists "Admin edit own unapproved" on public.videos;
drop policy if exists "Admin delete own unapproved" on public.videos;
-- Admins can no longer create change requests (edit/delete/category requests)
drop policy if exists "Admins create requests" on public.change_requests;
drop policy if exists "Admin cancel own pending" on public.change_requests;
-- Admin uploads are always forced to 'pending' by the existing videos_before_write trigger.

-- Realtime: broadcast changes so the website + admin refresh automatically
do $$
declare t text;
begin
  foreach t in array array['videos','categories','change_requests','admins','admin_invites'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
