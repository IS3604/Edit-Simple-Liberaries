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

    // add_admin enforces all role rules: existing user → role granted now; new email → saved as pending invite
    const { data: res, error: ae } = await caller.rpc("add_admin", { p_email: e, p_role: role });
    if (ae) return json({ error: ae.message }, 400);
    if (res === "added") return json({ status: "added", note: "User already has an account — role granted" });

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.auth.admin.inviteUserByEmail(e, { redirectTo });
    if (error) {
      await admin.from("admin_invites").delete().eq("email", e);
      return json({ error: error.message }, 400);
    }
    return json({ status: "sent" });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
