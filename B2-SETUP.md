# Moving videos to Backblaze B2 — setup

Thumbnails stay in Supabase. Only videos go to B2. Nothing changes until step 6.

## 1. Create the bucket (backblaze.com → B2 Cloud Storage)
1. Buckets → **Create a Bucket**
   - Name: e.g. `edit-simple-videos` (must be unique worldwide)
   - Files in Bucket are: **Private**
   - Default Encryption: Enable · Object Lock: Disable
2. Open the bucket → **Lifecycle Settings** → choose **Keep only the last version of the file** → Save.
   (Deleted files are then really removed, so you don't pay for them.)
3. Note the **Endpoint** shown on the bucket, e.g. `s3.us-west-004.backblazeb2.com`.

## 2. Create an application key
Application Keys → **Add a New Application Key**
- Name: `edit-simple-site` · Allow access to Bucket: **only** `edit-simple-videos`
- Type of Access: **Read and Write** · leave the rest empty → Create.
- Copy **keyID** and **applicationKey** (shown only once). Do not paste them in chat or in any site file.

## 3. CORS rules (lets the browser upload/play directly)
Bucket → **CORS Rules** → choose **Use custom CORS rules** and paste:
```json
[
  {
    "corsRuleName": "edit-simple-site",
    "allowedOrigins": ["https://is3604.github.io"],
    "allowedOperations": ["s3_get", "s3_head", "s3_put"],
    "allowedHeaders": ["content-type", "range", "authorization"],
    "exposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "maxAgeSeconds": 3600
  }
]
```
(If the web UI has no custom option, set it with the B2 command-line tool:
`b2 bucket update --cors-rules '<the JSON above>' edit-simple-videos allPrivate`.)

## 4. Supabase
1. SQL Editor → run `supabase/b2-v6.sql`.
2. Edge Functions → **Deploy a new function** → name `b2-sign` → paste `supabase/functions/b2-sign/index.ts` → Deploy.
   (Keep "Verify JWT" ON.)
3. Edge Functions → **Secrets** → add:
   - `B2_KEY_ID` = keyID
   - `B2_APP_KEY` = applicationKey
   - `B2_BUCKET` = edit-simple-videos
   - `B2_ENDPOINT` = s3.us-west-004.backblazeb2.com (yours)
   - optional `B2_MAX_MB` = 500 (max upload size)

## 5. Test before switching
Nothing uses B2 yet. Continue.

## 6. Switch uploads to B2
GitHub → `js/config.js` → `VIDEO_STORAGE: "b2"` → Commit. New uploads now go to B2.
Upload one test video, open it on the website, press Download. If it plays and downloads, it works.

## 7. Move old videos (owner / master admin)
Admin → Dashboard → **Video storage** box → **Move N to B2**. Keep the tab open; you can Stop and resume any time.
The old Supabase copies are deleted automatically after each move.

## Undo
Set `VIDEO_STORAGE: "supabase"` again: new uploads go back to Supabase; videos already in B2 keep playing.
