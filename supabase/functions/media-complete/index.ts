import { corsHeaders, json, requireMember, serviceClient } from "../_shared/auth.ts";
import { headObject } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { client, user } = await requireMember(req);
    const body = await req.json() as { mediaId?: string; objectKey?: string };
    if (!body.mediaId || !body.objectKey) return json({ error: "媒体参数缺失" }, 400);
    const { data: media, error: readError } = await client.from("media").select("id,original_object_key,created_by").eq("id", body.mediaId).eq("created_by", user.id).single();
    if (readError || !media || media.original_object_key !== body.objectKey) return json({ error: "媒体不存在或无权限" }, 403);
    const remote = await headObject(body.objectKey);
    const { error } = await serviceClient().from("media").update({ status: "uploaded", original_bytes: remote.ContentLength ?? undefined, original_mime_type: remote.ContentType ?? undefined }).eq("id", body.mediaId).eq("created_by", user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ mediaId: body.mediaId, status: "uploaded", bytes: remote.ContentLength ?? null });
  } catch (error) { return json({ error: String(error) }, 400); }
});
