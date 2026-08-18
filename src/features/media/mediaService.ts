import { supabase } from '../../utils/supabase';

export type CloudMediaKind = 'image' | 'video' | 'screenshot' | 'audio' | 'document';

interface MediaInitResponse { mediaId: string; objectKey: string; uploadUrl: string; uploadHeaders?: Record<string, string>; }
const accessCache = new Map<string, { url: string; expiresAt: number }>();

export async function uploadPrivateMedia(file: File, kind: CloudMediaKind): Promise<{ id: string; objectKey: string; filename: string; mimeType: string }> {
  const { data, error } = await supabase.functions.invoke<MediaInitResponse>('media-init', {
    body: { filename: file.name, mimeType: file.type || 'application/octet-stream', bytes: file.size, kind },
  });
  if (error || !data?.uploadUrl) throw error ?? new Error('媒体上传地址获取失败');
  const uploadResponse = await fetch(data.uploadUrl, {
    method: 'PUT', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', ...(data.uploadHeaders ?? {}) },
  });
  if (!uploadResponse.ok) throw new Error(`媒体上传失败（${uploadResponse.status}）`);
  const { error: completeError } = await supabase.functions.invoke('media-complete', {
    body: { mediaId: data.mediaId, objectKey: data.objectKey, bytes: file.size, mimeType: file.type || 'application/octet-stream' },
  });
  if (completeError) throw completeError;
  return { id: data.mediaId, objectKey: data.objectKey, filename: file.name, mimeType: file.type || 'application/octet-stream' };
}

export async function getPrivateMediaUrl(mediaId: string): Promise<string> {
  const cached = accessCache.get(mediaId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const { data, error } = await supabase.functions.invoke<{ url?: string; expiresIn?: number }>('media-access', { body: { mediaId } });
  if (error || !data?.url) throw error ?? new Error('媒体访问地址获取失败');
  accessCache.set(mediaId, { url: data.url, expiresAt: Date.now() + (data.expiresIn ?? 300) * 1000 });
  return data.url;
}

export function isPrivateMediaUrl(value: string) { return value.startsWith('media://'); }
