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
- description: 1–2 plain sentences, EXACTLY 20 to 25 words in total, describing what is visible in the clip. No hype, no emojis, no quotes.
- tags: 6–10 lowercase search keywords (1–2 words each), most useful first, no duplicates, no '#'.
Base everything on the title only. Do not invent brand names or people's names.`;

// Description must be 20–25 words
export const MIN_W = 20, MAX_W = 25;
export const countWords = (s: unknown) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const FILLERS = ["Ideal for legal and medical practice websites, online ads, presentations and social media videos.", "Royalty-free professional stock footage, ready to download and edit.", "Clean, well-lit shot suited to trustworthy brand storytelling."];
export function fitWords(s: unknown): string {
  let w = String(s || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (w.length < MIN_W) {                                 // too short: add a neutral use-case sentence
    if (w.length && !/[.!?]$/.test(w[w.length - 1])) w[w.length - 1] += ".";
    for (let i = 0; w.length < MIN_W; i++) w = w.concat(FILLERS[i % FILLERS.length].split(" "));
  }
  if (w.length > MAX_W) {                                 // too long: cut at the last sentence end that keeps ≥ MIN_W, else hard cut
    const cut = w.slice(0, MAX_W); let end = -1;
    cut.forEach((x, i) => { if (i + 1 >= MIN_W && /[.!?]$/.test(x)) end = i; });
    w = end >= 0 ? cut.slice(0, end + 1) : cut;
  }
  let out = w.join(" ").replace(/[,;:\-–—]+$/, "");
  if (out && !/[.!?]$/.test(out)) out += ".";
  return out;
}

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
    let { out, used } = await describe(`Title: ${t}`);
    let words = countWords(out.description);
    if (words < MIN_W || words > MAX_W) {                  // one retry with explicit feedback
      try { const r = await describe(`Title: ${t}\nYour last description had ${words} words. Rewrite it with between ${MIN_W} and ${MAX_W} words.`); if (Math.abs(countWords(r.out.description) - 22) < Math.abs(words - 22)) ({ out, used } = r); } catch { /* keep first */ }
    }
    const description = fitWords(out.description);
    const tags = [...new Set((Array.isArray(out.tags) ? out.tags : String(out.tags || "").split(","))
      .map((x: unknown) => String(x).toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim()).filter((x: string) => x && x.length <= 30))].slice(0, 10);
    return json({ description, tags, model: used });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
