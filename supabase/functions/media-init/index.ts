import { corsHeaders, json, requireMember } from "../_shared/auth.ts";
import { objectKey, signedUploadUrl } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { client, user } = await requireMember(req);
    const body = await req.json() as { filename?: string; mimeType?: string; bytes?: number; kind?: string };
    const filename = body.filename?.trim(); const mimeType = body.mimeType?.trim() || "application/octet-stream"; const bytes = Number(body.bytes);
    if (!filename || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 10 * 1024 * 1024 * 1024) return json({ error: "文件大小或文件名无效" }, 400);
    if (!['image', 'video', 'screenshot', 'audio', 'document'].includes(body.kind ?? '')) return json({ error: "媒体类型无效" }, 400);
    const mediaId = crypto.randomUUID(); const key = objectKey(mediaId, filename);
    const { error } = await client.from("media").insert({ id: mediaId, kind: body.kind, status: "pending_upload", original_object_key: key, original_filename: filename, original_mime_type: mimeType, original_bytes: bytes, created_by: user.id });
    if (error) return json({ error: error.message }, 400);
    return json({ mediaId, objectKey: key, uploadUrl: await signedUploadUrl(key, mimeType), uploadHeaders: { "Content-Type": mimeType }, expiresIn: 600 });
  } catch (error) { return json({ error: String(error) }, 401); }
});
