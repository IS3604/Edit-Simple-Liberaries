# Edit Simple Libraries — video stock site

Pages: index.html (home), videos.html (browse by ?cat=&sub=&q=), video.html (?id=).
Categories/subcategories: edit `CATS` in js/data.js.

## Connect Supabase
1. Run supabase/schema.sql in the SQL Editor.
2. Upload .mp4 + .jpg files to Storage bucket `videos`, add rows to `videos` table (Table Editor).
3. Put Project URL + anon key in js/config.js.
Empty config = built-in sample data.

Serve over http (e.g. `npx serve .`) — not file:// — for Supabase to load.
Uploads/insert are done from the Supabase dashboard (anon key is read-only by RLS).

## Admin panel (admin.html)
1. Run supabase/admin.sql in SQL Editor.
2. Authentication → Users → Add user (email+password, auto-confirm).
3. SQL: insert into public.admins (user_id) select id from auth.users where email='YOUR_EMAIL';
4. Open /admin.html and log in.
Features: dashboard stats, add/edit/delete videos with upload (auto duration, resolution, thumbnail), publish/draft toggle, manage categories & subcategories.
Tip: Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
Free plan max upload = 50 MB per file.

## Maintenance mode
1. Run `supabase/maintenance.sql` once (SQL Editor).
2. Table Editor → `site_settings` → set `maintenance` = true (optional `message`). Website + admin show the maintenance page within ~20s; set false to bring back.
`404.html` is served by GitHub Pages for unknown URLs.
