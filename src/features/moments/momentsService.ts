import { supabase } from '../../utils/supabase';
import { uploadPrivateMedia } from '../media/mediaService';
import type { Moment, MomentComment, MomentDraft, MomentMedia } from './types';

export const MOMENTS_BACKGROUND_EVENT = 'ooolj-moments-background-change';
export const DEFAULT_MOMENTS_BACKGROUND = '';
type RawMedia = { id: string; kind: 'image' | 'video' | 'screenshot'; original_filename: string };
type RawMoment = { id: string; body: string; published_at: string; created_by?: string; location_name?: string | null; author?: { display_name: string } | null; moment_media?: Array<{ display_order: number; media: RawMedia | null }>; moment_likes?: Array<{ display_name: string }>; moment_comments?: Array<{ id: string; author_name: string; reply_to_name?: string | null; body: string }> };

const toMedia = (media: RawMedia): MomentMedia => ({ id: media.id, kind: media.kind === 'video' ? 'video' : 'image', url: `media://${media.id}`, alt: media.original_filename });
function mapMoment(raw: RawMoment): Moment {
  const media = (raw.moment_media ?? []).sort((a, b) => a.display_order - b.display_order).flatMap((item) => item.media ? [toMedia(item.media)] : []);
  const comments: MomentComment[] = (raw.moment_comments ?? []).map((comment) => ({ id: comment.id, author: comment.author_name, replyTo: comment.reply_to_name ?? undefined, body: comment.body }));
  const author = raw.author?.display_name ?? '我们';
  return { id: raw.id, author, avatar: author.slice(0, 1), body: raw.body, publishedAt: raw.published_at, location: raw.location_name ?? undefined, media, likes: (raw.moment_likes ?? []).map((like) => like.display_name), comments, createdBy: 'owner' };
}

export async function listMoments(): Promise<Moment[]> {
  const { data, error } = await supabase.from('moments').select('id,body,published_at,created_by,location_name,author:profiles!moments_author_id_fkey(display_name),moment_media(display_order,media(id,kind,original_filename)),moment_likes(display_name),moment_comments(id,author_name,reply_to_name,body)').is('deleted_at', null).order('published_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as RawMoment[]).map(mapMoment);
}
export async function getMoment(id: string) { return (await listMoments()).find((moment) => moment.id === id) ?? null; }

export async function saveCloudMoment(draft: MomentDraft): Promise<Moment> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('请先登录');
  const { data: row, error } = await supabase.from('moments').insert({ author_id: auth.user.id, created_by: auth.user.id, body: draft.body, published_at: draft.publishedAt, location_name: draft.location || null }).select('id').single();
  if (error || !row) throw error ?? new Error('朋友圈保存失败');
  if (draft.media.length) {
    const { error: mediaError } = await supabase.from('moment_media').insert(draft.media.map((media, index) => ({ moment_id: row.id, media_id: media.id, display_order: index })));
    if (mediaError) throw mediaError;
  }
  if (draft.likes.length) await supabase.from('moment_likes').insert(draft.likes.map((display_name, display_order) => ({ moment_id: row.id, display_name, display_order })));
  if (draft.comments.length) await supabase.from('moment_comments').insert(draft.comments.map((comment, display_order) => ({ moment_id: row.id, author_name: comment.author, reply_to_name: comment.replyTo ?? null, body: comment.body, display_order })));
  const saved = await getMoment(row.id);
  if (!saved) throw new Error('朋友圈已保存但读取失败');
  return saved;
}

export async function uploadMomentFiles(files: File[]) {
  return Promise.all(files.map(async (file) => {
    const uploaded = await uploadPrivateMedia(file, file.type.startsWith('video/') ? 'video' : 'image');
    return { id: uploaded.id, kind: file.type.startsWith('video/') ? 'video' as const : 'image' as const, url: `media://${uploaded.id}`, alt: uploaded.filename };
  }));
}
export async function deleteMoment(id: string) { const { error } = await supabase.functions.invoke('content-delete', { body: { entityType: 'moment', entityId: id } }); if (error) throw error; }
export function formatMomentTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
export function getMomentsBackground() { return DEFAULT_MOMENTS_BACKGROUND; }
export function setMomentsBackground(path: string) { window.dispatchEvent(new CustomEvent(MOMENTS_BACKGROUND_EVENT, { detail: path })); }
export function resetMomentsBackground() { window.dispatchEvent(new CustomEvent(MOMENTS_BACKGROUND_EVENT, { detail: DEFAULT_MOMENTS_BACKGROUND })); }
