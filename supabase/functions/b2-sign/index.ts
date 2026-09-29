// Supabase Edge Function: b2-sign
// Videos live in a PRIVATE Backblaze B2 bucket (S3 API). This function is the only thing that holds the B2 key.
// It checks who is calling (Supabase login + role) and hands out short-lived links.
//   upload   → any team member: presigned PUT (15 min) for a new file
//   view     → any team member: presigned GET (1 h) for videos they are allowed to see
//   download → any team member: presigned GET (10 min) with "save as" filename
//   delete   → superadmin: removes files queued in storage_cleanup that no video uses any more
//   migrate  → owner only: copies one video from Supabase Storage to B2 and switches the row over
//   sweep    → owner only: deletes files (Supabase + B2) that no video uses any more, older than 24 h
// Secrets: B2_KEY_ID, B2_APP_KEY, B2_BUCKET, B2_ENDPOINT (e.g. s3.us-west-004.backblazeb2.com), optional B2_REGION, B2_MAX_MB
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => (Deno.env.get(k) || "").trim();   // trim: pasted secrets often carry a stray newline
const EXT: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v", mkv: "video/x-matroska" };
export const PREFIX = "b2:";
export const isB2 = (p: unknown) => typeof p === "string" && p.startsWith(PREFIX) && /^b2:videos\/[\w\-/.]+$/.test(p) && !p.includes("..");
const keyOf = (p: string) => p.slice(PREFIX.length);
const supaPath = (u: unknown) => { const m = String(u || "").match(/\/storage\/v1\/object\/(?:public|sign)\/videos\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; };
export const safeName = (s: unknown) => (String(s || "video").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 90) || "video");

function b2() {
  const endpoint = env("B2_ENDPOINT").replace(/^https?:\/\//, "").replace(/\/+$/, ""), bucket = env("B2_BUCKET");
  if (!env("B2_KEY_ID") || !env("B2_APP_KEY") || !endpoint || !bucket) throw new Error("B2 is not set up — add B2_KEY_ID, B2_APP_KEY, B2_BUCKET and B2_ENDPOINT in Supabase secrets");
  const region = env("B2_REGION") || (endpoint.match(/^s3\.([\w-]+)\./)?.[1] ?? "us-east-1");
  const proto = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(endpoint) ? "http" : "https";       // http only for local tests
  const aws = new AwsClient({ accessKeyId: env("B2_KEY_ID"), secretAccessKey: env("B2_APP_KEY"), service: "s3", region });
  const url = (key: string) => `${proto}://${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const presign = async (method: string, key: string, seconds: number, query: Record<string, string> = {}) => {
    const u = new URL(url(key)); u.searchParams.set("X-Amz-Expires", String(seconds));
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return (await aws.sign(new Request(u, { method }), { aws: { signQuery: true } })).url;
  };
  return { aws, url, presign, bucketUrl: `${proto}://${endpoint}/${bucket}` };
}

// B2 buckets are always versioned: a plain DELETE only "hides" a file. Remove every version so it is really gone.
async function removeAll(s3: ReturnType<typeof b2>, key: string) {
  const list = await s3.aws.fetch(`${s3.bucketUrl}/?versions=&prefix=${encodeURIComponent(key)}`);
  if (!list.ok) return false;
  const xml = await list.text();
  const ids = [...xml.matchAll(/<(?:Version|DeleteMarker)>([\s\S]*?)<\/(?:Version|DeleteMarker)>/g)]
    .map(m => ({ k: m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1], v: m[1].match(/<VersionId>([\s\S]*?)<\/VersionId>/)?.[1] }))
    .filter(x => x.k === key && x.v);
  let ok = true;
  for (const { v } of ids) { const r = await s3.aws.fetch(`${s3.url(key)}?versionId=${encodeURIComponent(v!)}`, { method: "DELETE" }); if (!r.ok && r.status !== 404) ok = false; }
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SB = env("SUPABASE_URL");
    const caller = createClient(SB, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: role } = await caller.rpc("my_role");
    if (!role) return json({ error: "Not allowed" }, 403);                       // not a signed-in team member
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "upload") {
      const ext = String(body.name || "").toLowerCase().match(/\.(\w{2,4})$/)?.[1] || "";
      if (!EXT[ext]) return json({ error: "Only video files (mp4, mov, webm, m4v, mkv) can be uploaded" }, 400);
      const max = (+env("B2_MAX_MB") || 500) * 1024 * 1024, size = +body.size || 0;
      if (!size || size > max) return json({ error: `File too large (max ${Math.round(max / 1048576)} MB)` }, 400);
      const key = `videos/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      const s3 = b2();
      return json({ path: PREFIX + key, url: await s3.presign("PUT", key, 900), contentType: EXT[ext] });
    }

    if (action === "view") {
      const paths = [...new Set((Array.isArray(body.paths) ? body.paths : []).filter(isB2))].slice(0, 200) as string[];
      if (!paths.length) return json({ urls: {} });
      // only files of videos this person may see (row-level security decides)
      const { data, error } = await caller.from("videos").select("video_url").in("video_url", paths);
      if (error) return json({ error: error.message }, 400);
      const s3 = b2(), urls: Record<string, string> = {};
      for (const p of new Set((data || []).map((r: { video_url: string }) => r.video_url))) urls[p] = await s3.presign("GET", keyOf(p), 3600);
      return json({ urls });
    }

    if (action === "download") {
      const { data: v, error } = await caller.from("videos").select("id,title,video_url").eq("id", String(body.id || "")).maybeSingle();
      if (error || !v || !isB2(v.video_url)) return json({ error: "Video not found" }, 404);
      const ext = keyOf(v.video_url).split(".").pop()!;
      const name = safeName(body.filename ? String(body.filename).replace(/\.\w{2,4}$/, "") : v.title) + "." + ext;
      return json({ url: await b2().presign("GET", keyOf(v.video_url), 600, { "response-content-disposition": `attachment;filename="${name}"` }) });
    }

    const admin = createClient(SB, env("SUPABASE_SERVICE_ROLE_KEY"));

    if (action === "delete") {
      const { data: sup } = await caller.rpc("is_superadmin");
      if (!sup) return json({ error: "Not allowed" }, 403);
      const asked = [...new Set((Array.isArray(body.paths) ? body.paths : []).filter(isB2))].slice(0, 100) as string[];
      if (!asked.length) return json({ deleted: [] });
      // only files that are queued for cleanup AND no video uses any more
      const { data: queued } = await admin.from("storage_cleanup").select("path").in("path", asked);
      const { data: used } = await admin.from("videos").select("video_url").in("video_url", asked);
      const inUse = new Set((used || []).map((r: { video_url: string }) => r.video_url));
      const s3 = b2(), deleted: string[] = [], kept: string[] = [];
      for (const p of (queued || []).map((r: { path: string }) => r.path)) {
        if (inUse.has(p)) { kept.push(p); continue; }
        if (await removeAll(s3, keyOf(p))) deleted.push(p); else kept.push(p);
      }
      if (deleted.length || kept.length) await admin.from("storage_cleanup").delete().in("path", [...deleted, ...kept.filter(p => inUse.has(p))]);
      return json({ deleted, kept });
    }

    if (action === "migrate") {
      const { data: top } = await caller.rpc("can_manage_all");
      if (!top) return json({ error: "Only the owner can move videos" }, 403);
      const { data: v } = await admin.from("videos").select("id,video_url").eq("id", String(body.id || "")).maybeSingle();
      if (!v) return json({ error: "Video not found" }, 404);
      if (isB2(v.video_url)) return json({ status: "already" });
      const src = supaPath(v.video_url);
      if (!src) return json({ error: "Video has no stored file" }, 400);
      const { data: blob, error: de } = await admin.storage.from("videos").download(src);
      if (de || !blob) return json({ error: "Could not read from Supabase: " + (de?.message || "missing") }, 400);
      if (blob.size > 200 * 1024 * 1024) return json({ error: "File over 200 MB — re-upload it instead" }, 400);
      const ext = (src.toLowerCase().match(/\.(\w{2,4})$/)?.[1] || "mp4");
      const key = `videos/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[ext] ? ext : "mp4"}`;
      const s3 = b2();
      const put = await s3.aws.fetch(s3.url(key), { method: "PUT", body: await blob.arrayBuffer(), headers: { "Content-Type": EXT[ext] || "video/mp4" } });
      if (!put.ok) return json({ error: `B2 upload failed (${put.status})` }, 502);
      // switch the row over as the owner (keeps all normal rules); the old Supabase file gets queued for cleanup by the database
      const { error: ue } = await caller.from("videos").update({ video_url: PREFIX + key }).eq("id", v.id);
      if (ue) { await removeAll(s3, key); return json({ error: ue.message }, 400); }
      return json({ status: "moved", path: PREFIX + key });
    }

    if (action === "sweep") {
      // Owner only: find files in Supabase Storage and B2 that no video uses any more (e.g. thumbnails of deleted
      // videos, half-finished uploads) and delete them. dryRun:true only counts. Files younger than 24 h are skipped
      // so uploads in progress are never touched.
      const { data: top } = await caller.rpc("can_manage_all");
      if (!top) return json({ error: "Only the owner can clean up storage" }, 403);
      const dry = body.dryRun !== false, cutoff = Date.now() - (env("SWEEP_MIN_AGE_H") === "" ? 24 : +env("SWEEP_MIN_AGE_H")) * 3600e3;
      const used = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from("videos").select("video_url,thumbnail_url").range(from, from + 999);
        if (error) return json({ error: error.message }, 400);
        for (const r of data || []) for (const u of [r.video_url, r.thumbnail_url]) { if (isB2(u)) used.add(u); const sp = supaPath(u); if (sp) used.add(sp); }
        if (!data || data.length < 1000) break;
      }
      // --- Supabase Storage (thumbnails + old videos)
      const supa: { path: string; size: number }[] = [];
      const walk = async (prefix: string): Promise<void> => {
        for (let off = 0; ; off += 1000) {
          const { data, error } = await admin.storage.from("videos").list(prefix, { limit: 1000, offset: off });
          if (error) throw new Error("Storage list: " + error.message);
          for (const o of data || []) {
            const full = prefix ? `${prefix}/${o.name}` : o.name;
            if (!o.id) { await walk(full); continue; }                                   // folder
            const t = Date.parse(o.created_at || o.updated_at || "") || 0;
            if (!used.has(full) && t && t < cutoff) supa.push({ path: full, size: +(o.metadata?.size || 0) });
          }
          if (!data || data.length < 1000) break;
        }
      };
      await walk("");
      // --- B2 (all versions under videos/)
      const b2Orphans: { key: string; size: number }[] = [];
      let s3: ReturnType<typeof b2> | null = null; try { s3 = b2(); } catch { s3 = null; }
      if (s3) {
        let km = "", vm = "";
        const seen = new Map<string, { size: number; newest: number }>();
        for (let i = 0; i < 100; i++) {
          const q = `${s3.bucketUrl}/?versions=&prefix=videos%2F${km ? `&key-marker=${encodeURIComponent(km)}` : ""}${vm ? `&version-id-marker=${encodeURIComponent(vm)}` : ""}`;
          const r = await s3.aws.fetch(q); if (!r.ok) throw new Error(`B2 list failed (${r.status})`);
          const xml = await r.text();
          for (const m of xml.matchAll(/<(Version|DeleteMarker)>([\s\S]*?)<\/\1>/g)) {
            const k = m[2].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || ""; const t = Date.parse(m[2].match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] || "") || 0;
            const sz = +(m[2].match(/<Size>(\d+)<\/Size>/)?.[1] || 0); const e = seen.get(k) || { size: 0, newest: 0 };
            seen.set(k, { size: e.size + sz, newest: Math.max(e.newest, t) });
          }
          if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
          km = xml.match(/<NextKeyMarker>([\s\S]*?)<\/NextKeyMarker>/)?.[1] || ""; vm = xml.match(/<NextVersionIdMarker>([\s\S]*?)<\/NextVersionIdMarker>/)?.[1] || "";
          if (!km) break;
        }
        for (const [k, v] of seen) if (!used.has(PREFIX + k) && v.newest && v.newest < cutoff) b2Orphans.push({ key: k, size: v.size });
      }
      const bytes = supa.reduce((a, x) => a + x.size, 0) + b2Orphans.reduce((a, x) => a + x.size, 0);
      if (!dry) {
        for (let i = 0; i < supa.length; i += 100) { const { error } = await admin.storage.from("videos").remove(supa.slice(i, i + 100).map(x => x.path)); if (error) throw new Error("Storage delete: " + error.message); }
        for (const o of b2Orphans) await removeAll(s3!, o.key);
        await admin.from("storage_cleanup").delete().in("path", [...supa.map(x => x.path), ...b2Orphans.map(x => PREFIX + x.key)]);
      }
      return json({ dryRun: dry, supabase: supa.length, b2: b2Orphans.length, bytes, b2Checked: !!s3, sample: [...supa.map(x => x.path), ...b2Orphans.map(x => PREFIX + x.key)].slice(0, 50) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
