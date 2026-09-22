-- Run AFTER schema.sql. Adds admin roles, categories table and write permissions.
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

drop policy if exists "Admins see admins" on public.admins;
create policy "Admins see admins" on public.admins for select using (public.is_admin());

-- Videos: admins can do everything (incl. see unpublished)
drop policy if exists "Admin all videos" on public.videos;
create policy "Admin all videos" on public.videos for all using (public.is_admin()) with check (public.is_admin());

-- Categories (main = parent_slug null, sub = parent_slug set)
create table if not exists public.categories (
  slug text primary key,
  name text not null,
  parent_slug text references public.categories(slug) on update cascade on delete cascade,
  icon text default 'movie',
  blurb text,
  sort int default 0
);
alter table public.categories enable row level security;
drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories" on public.categories for select using (true);
drop policy if exists "Admin write categories" on public.categories;
create policy "Admin write categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- Allow any subcategory slug (managed from admin now)
alter table public.videos drop constraint if exists videos_category_check;

-- Storage: admins upload / replace / delete files
drop policy if exists "Admin insert videos bucket" on storage.objects;
create policy "Admin insert videos bucket" on storage.objects for insert with check (bucket_id='videos' and public.is_admin());
drop policy if exists "Admin update videos bucket" on storage.objects;
create policy "Admin update videos bucket" on storage.objects for update using (bucket_id='videos' and public.is_admin());
drop policy if exists "Admin delete videos bucket" on storage.objects;
create policy "Admin delete videos bucket" on storage.objects for delete using (bucket_id='videos' and public.is_admin());

-- Seed categories
insert into public.categories (slug,name,parent_slug,icon,blurb,sort) values
('lawyers','For Lawyers',null,'gavel','Courtroom, consultation and legal-practice footage for law firms and advocates.',1),
('doctors','For Doctors',null,'stethoscope','Clinic, hospital and patient-care footage for doctors and healthcare brands.',2),
('both','For Both',null,'handshake','Professional b-roll that works for legal and medical practices alike.',3),
('courtroom','Courtroom','lawyers',null,null,1),('consultation','Client Consultation','lawyers',null,null,2),('documents','Contracts & Documents','lawyers',null,null,3),('law-office','Law Office','lawyers',null,null,4),('justice','Justice & Symbols','lawyers',null,null,5),
('hospital','Hospital & Clinic','doctors',null,null,1),('surgery','Surgery & Procedures','doctors',null,null,2),('patient-care','Patient Care','doctors',null,null,3),('med-tech','Medical Technology','doctors',null,null,4),('lab','Pharmacy & Lab','doctors',null,null,5),
('meetings','Office & Meetings','both',null,null,1),('testimonials','Testimonials & Interviews','both',null,null,2),('backgrounds','Explainer Backgrounds','both',null,null,3),('trust','Trust & Professionalism','both',null,null,4),('social','Social Media Reels','both',null,null,5)
on conflict (slug) do nothing;

-- MAKE YOURSELF ADMIN: first create a user in Authentication → Users (Add user, auto-confirm),
-- then run this with your email:
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
