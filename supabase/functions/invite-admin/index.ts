// Supabase Edge Function: invite-admin
// Superadmin-only. Saves the role and sends the Supabase "Invite user" email.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: isSuper } = await caller.rpc("is_superadmin");
    if (!isSuper) return json({ error: "Only superadmin can invite" }, 403);

    const { email, role = "admin", redirectTo } = await req.json();
    const e = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return json({ error: "Invalid email" }, 400);
    if (!["admin", "superadmin"].includes(role)) return json({ error: "Invalid role" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Save role first (trigger grants it when the invited user is created)
    const { error: ie } = await admin.from("admin_invites").upsert({ email: e, role });
    if (ie) return json({ error: ie.message }, 400);
    const { error } = await admin.auth.admin.inviteUserByEmail(e, { redirectTo });
    if (error) {
      // Already registered → just grant the role directly
      if (/already|registered|exists/i.test(error.message)) {
        const { data, error: ae } = await caller.rpc("add_admin", { p_email: e, p_role: role });
        if (ae) return json({ error: ae.message }, 400);
        return json({ status: data === "added" ? "added" : "invited", note: "User already exists — role granted" });
      }
      return json({ error: error.message }, 400);
    }
    return json({ status: "sent" });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
