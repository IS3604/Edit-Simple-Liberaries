-- ============================================================
-- v8: admins can WITHDRAW (delete) their own uploads that are still
-- waiting for review or were rejected. Approved videos stay superadmin-only.
-- Files are queued for cleanup by the existing queue_old_files trigger.
-- Safe to re-run.
-- ============================================================
drop policy if exists "Admin withdraw own unreviewed" on public.videos;
create policy "Admin withdraw own unreviewed" on public.videos for delete
  using (public.is_admin() and submitted_by = auth.uid() and status in ('pending', 'rejected'));
