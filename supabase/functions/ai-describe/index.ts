// Supabase Edge Function: ai-describe
// Suggests a description + tags for a stock video from its title (and one frame) using Groq.
// Secrets: GROQ_API_KEY (required), GROQ_VISION_MODEL / GROQ_TEXT_MODEL (optional overrides)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const VISION = Deno.env.get("GROQ_VISION_MODEL") || "meta-llama/llama-4-scout-17b-16e-instruct";
const TEXT = Deno.env.get("GROQ_TEXT_MODEL") || "llama-3.1-8b-instant";

const SYSTEM = `You write metadata for a stock-video library used by lawyers and doctors for their websites, ads and social media.
Return ONLY JSON: {"description": string, "tags": string[]}.
- description: 1–2 plain sentences (max 220 characters) describing what is visible in the clip. No hype, no emojis, no quotes.
- tags: 6–10 lowercase search keywords (1–2 words each), most useful first, no duplicates, no '#'.
Base everything on the title and the image. Do not invent brand names or people's names.`;

async function groq(model: string, content: unknown) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.3, max_tokens: 300, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Groq error ${r.status}`);
  return JSON.parse(j.choices?.[0]?.message?.content || "{}");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!Deno.env.get("GROQ_API_KEY")) return json({ error: "GROQ_API_KEY secret is not set" }, 500);
    // Only signed-in team members may use it
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ok } = await caller.rpc("is_admin");
    if (!ok) return json({ error: "Not allowed" }, 403);

    const { title = "", category = "", subcategory = "", image = "" } = await req.json();
    const t = String(title).slice(0, 200).trim();
    if (!t && !image) return json({ error: "Nothing to describe" }, 400);
    const text = `Title: ${t || "(none)"}${category ? `\nCategory: ${String(category).slice(0, 60)}` : ""}${subcategory ? `\nSubcategory: ${String(subcategory).slice(0, 60)}` : ""}`;
    const validImg = typeof image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length < 1_500_000;

    let out; let used = VISION;
    try {
      out = validImg ? await groq(VISION, [{ type: "text", text }, { type: "image_url", image_url: { url: image } }]) : (used = TEXT, await groq(TEXT, text));
    } catch (_) { used = TEXT; out = await groq(TEXT, text); }   // fall back to text-only

    const description = String(out.description || "").replace(/\s+/g, " ").trim().slice(0, 300);
    const tags = [...new Set((Array.isArray(out.tags) ? out.tags : String(out.tags || "").split(","))
      .map((x: unknown) => String(x).toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim()).filter((x: string) => x && x.length <= 30))].slice(0, 10);
    return json({ description, tags, model: used });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
