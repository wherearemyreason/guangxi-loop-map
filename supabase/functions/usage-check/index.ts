import { corsHeaders, json, requireMember } from "../_shared/auth.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try { const { role } = await requireMember(req); if (role !== "owner") return json({ error: "Forbidden" }, 403);
    // TODO: aggregate database metadata/R2 metrics and notify at 80%/100%; scheduled runs need a separate secret.
    return json({ message: "usage-check stub" }, 501);
  } catch (error) { return json({ error: String(error) }, 401); }
});
