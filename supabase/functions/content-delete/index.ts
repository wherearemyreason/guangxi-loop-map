import { corsHeaders, json, requireMember, serviceClient } from "../_shared/auth.ts";

const tables: Record<string, string> = { trip: "trips", stop: "stops", media: "media", moment: "moments" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { role, user } = await requireMember(req);
    if (role !== "owner") return json({ error: "Forbidden" }, 403);
    const body = await req.json() as { entityType?: string; entityId?: string };
    if (!body.entityType || !body.entityId || !tables[body.entityType]) return json({ error: "实体参数无效" }, 400);
    const db = serviceClient(); const table = tables[body.entityType];
    const { error } = await db.from(table).update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq("id", body.entityId);
    if (error) return json({ error: error.message }, 400);
    await db.from("content_deletions").insert({ entity_type: body.entityType, entity_id: body.entityId, deleted_by: user.id });
    return json({ ok: true });
  } catch (error) { return json({ error: String(error) }, 401); }
});
