import { corsHeaders, json, requireMember } from "../_shared/auth.ts";
import { signedDownloadUrl } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { client } = await requireMember(req);
    const body = await req.json() as { mediaId?: string };
    if (!body.mediaId) return json({ error: "媒体 ID 缺失" }, 400);
    const { data: media, error } = await client.from("media").select("original_object_key,status,deleted_at").eq("id", body.mediaId).single();
    if (error || !media || media.deleted_at || !['uploaded', 'ready'].includes(media.status) || !media.original_object_key) return json({ error: "媒体不可用" }, 404);
    return json({ url: await signedDownloadUrl(media.original_object_key), expiresIn: 300 });
  } catch (error) { return json({ error: String(error) }, 401); }
});
