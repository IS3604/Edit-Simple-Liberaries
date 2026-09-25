// Supabase Edge Function: ai-describe
// Suggests a description + tags for a stock video from its TITLE ONLY, using Groq.
// Secrets: GROQ_API_KEY (required), GROQ_TEXT_MODEL (optional: force a specific model)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
// Groq retires models from time to time, so try a list and, if all fail, pick any available chat model.
const PREFERRED = [Deno.env.get("GROQ_TEXT_MODEL"), "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"].filter(Boolean) as string[];
let workingModel: string | null = null;   // remembered while the function instance stays warm
const gone = (m: string) => /does not exist|decommissioned|deprecated|not found|do not have access|model_not_found/i.test(m);

const SYSTEM = `You write metadata for a stock-video library used by lawyers and doctors for their websites, ads and social media.
Return ONLY JSON: {"description": string, "tags": string[]}.
- description: 1–2 plain sentences (max 220 characters) describing what is visible in the clip. No hype, no emojis, no quotes.
- tags: 6–10 lowercase search keywords (1–2 words each), most useful first, no duplicates, no '#'.
Base everything on the title only. Do not invent brand names or people's names.`;

async function groq(model: string, content: string) {
  const body: Record<string, unknown> = { model, temperature: 0.3, max_tokens: 900, response_format: { type: "json_object" },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content }] };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Groq error ${r.status}`);
  const text = String(j.choices?.[0]?.message?.content || "");
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("AI returned no JSON");
  return JSON.parse(m[0]);
}
async function availableModels(): Promise<string[]> {
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}` } });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error?.message || `Groq error ${r.status}`);
  return (j.data || []).filter((x: any) => x.active !== false).map((x: any) => String(x.id))
    .filter((id: string) => !/whisper|tts|guard|embed|vision|playai|orpheus|compound|allam/i.test(id));
}
async function describe(content: string) {
  const tried: string[] = []; let lastErr = "";
  const attempt = async (m: string) => { tried.push(m); const out = await groq(m, content); workingModel = m; return { out, used: m }; };
  for (const m of [workingModel, ...PREFERRED].filter((x, i, a) => x && a.indexOf(x) === i) as string[]) {
    try { return await attempt(m); } catch (e) { lastErr = (e as Error).message; if (!gone(lastErr) && !/json/i.test(lastErr)) throw e; }
  }
  for (const m of (await availableModels()).filter(m => !tried.includes(m)).slice(0, 5)) {     // auto-discover
    try { return await attempt(m); } catch (e) { lastErr = (e as Error).message; }
  }
  throw new Error(`No usable Groq model (${lastErr})`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!Deno.env.get("GROQ_API_KEY")) return json({ error: "GROQ_API_KEY secret is not set" }, 500);
    // Only signed-in team members may use it
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ok } = await caller.rpc("is_admin");
    if (!ok) return json({ error: "Not allowed" }, 403);

    const { title = "" } = await req.json();
    const t = String(title).replace(/\s+/g, " ").trim().slice(0, 200);
    if (!t) return json({ error: "Title is empty" }, 400);
    const { out, used } = await describe(`Title: ${t}`);

    const description = String(out.description || "").replace(/\s+/g, " ").trim().slice(0, 300);
    const tags = [...new Set((Array.isArray(out.tags) ? out.tags : String(out.tags || "").split(","))
      .map((x: unknown) => String(x).toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim()).filter((x: string) => x && x.length <= 30))].slice(0, 10);
    return json({ description, tags, model: used });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
