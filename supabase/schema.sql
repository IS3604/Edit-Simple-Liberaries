-- Run in Supabase → SQL Editor
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (category in ('lawyers','doctors','both')),
  subcategory text not null,            -- must match a slug in js/data.js CATS
  video_url text,                       -- public URL from Storage bucket "videos"
  thumbnail_url text,
  duration_seconds int default 0,
  resolution text default '1080p',      -- '4K' | '1080p'
  fps int default 30,
  orientation text default 'horizontal',
  tags text[] default '{}',
  published boolean default true,
  created_at timestamptz default now()
);
create index if not exists videos_cat_idx on public.videos (category, subcategory);

alter table public.videos enable row level security;
drop policy if exists "Public read published videos" on public.videos;
create policy "Public read published videos" on public.videos for select using (published = true);

-- Public storage bucket for video + thumbnail files
insert into storage.buckets (id, name, public) values ('videos','videos',true) on conflict (id) do nothing;
drop policy if exists "Public read videos bucket" on storage.objects;
create policy "Public read videos bucket" on storage.objects for select using (bucket_id = 'videos');

-- Example row
-- insert into public.videos (title, description, category, subcategory, video_url, thumbnail_url, duration_seconds, resolution, fps, tags)
-- values ('Judge Gavel Close-Up','Slow-motion gavel strike.','lawyers','courtroom',
--   'https://YOUR-PROJECT.supabase.co/storage/v1/object/public/videos/gavel.mp4',
--   'https://YOUR-PROJECT.supabase.co/storage/v1/object/public/videos/gavel.jpg', 12, '4K', 24, '{gavel,court,judge}');
