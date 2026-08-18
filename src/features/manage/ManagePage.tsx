import { useState } from 'react';
import type { FormEvent } from 'react';
import { ImagePlus, MapPinned, MessageSquarePlus, ShieldCheck } from 'lucide-react';
import { createCloudTrip } from '../travel/data/cloudTravelService';
import { saveCloudMoment, uploadMomentFiles } from '../moments/momentsService';
import type { MomentComment, MomentMedia } from '../moments/types';
import './manage.css';
import './records.css';
import '../moments/moment-composition.css';

export function ManagePage() {
  const [mode, setMode] = useState<'moment' | 'travel'>('moment');
  const [notice, setNotice] = useState('');
  return <main className="manage-page">
    <header className="manage-header"><div><p>MEMORY STUDIO</p><h1>把新的故事收进来</h1><span>新增内容会保存到 Supabase 和 Cloudflare R2，可在两台设备之间同步。</span></div><div className="privacy-card"><ShieldCheck/><b>云端私密模式</b><small>原始媒体存储在 R2 私有桶</small></div></header>
    {notice && <div className="save-success">{notice}</div>}
    <section className="manage-grid"><aside className="manage-sidebar">
      <button className={mode === 'moment' ? 'active' : ''} onClick={() => setMode('moment')}><MessageSquarePlus/>新增朋友圈<span>保存文字、图片、视频、点赞和评论</span></button>
      <button className={mode === 'travel' ? 'active' : ''} onClick={() => setMode('travel')}><MapPinned/>新增旅行地图<span>保存站点、坐标、照片和视频</span></button>
      <div className="cloud-note"><ShieldCheck/><b>媒体访问受保护</b><p>页面只使用短时签名链接，R2 原始文件不会公开。</p></div>
    </aside><section className="manage-workspace">
      {mode === 'moment' ? <MomentComposer onSaved={setNotice}/> : <TripComposer onSaved={setNotice}/>} 
    </section></section>
  </main>;
}

function MomentComposer({ onSaved }: { onSaved: (message: string) => void }) {
  const [author, setAuthor] = useState('我们'); const [body, setBody] = useState(''); const [location, setLocation] = useState('');
  const [publishedAt, setPublishedAt] = useState(() => new Date().toISOString().slice(0, 16)); const [files, setFiles] = useState<File[]>([]); const [likes, setLikes] = useState(''); const [comments, setComments] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!body.trim()) return; setSaving(true);
    try { const media: MomentMedia[] = await uploadMomentFiles(files); const parsedComments: MomentComment[] = comments.split('\n').map((line, index) => line.trim() ? { id: `new-${index}`, author: line.split('：')[0] || '我们', body: line.includes('：') ? line.slice(line.indexOf('：') + 1) : line } : null).filter((value): value is MomentComment => Boolean(value)); await saveCloudMoment({ author, body: body.trim(), publishedAt: new Date(publishedAt).toISOString(), location, media, likes: likes.split(/[、,，]/).map((value) => value.trim()).filter(Boolean), comments: parsedComments }); setBody(''); setFiles([]); setLikes(''); setComments(''); onSaved('朋友圈已保存，另一台设备刷新后即可看到。'); } catch (error) { onSaved(error instanceof Error ? error.message : '朋友圈保存失败'); } finally { setSaving(false); }
  };
  return <form className="moment-composer" onSubmit={submit}><p className="form-kicker">WECHAT MOMENT ARCHIVE</p><h2>新增朋友圈回忆</h2><p className="composer-hint">媒体会先上传到 R2，再将文字与文件关系写入 Supabase。</p><div className="form-row"><label>发布人<input value={author} onChange={(event) => setAuthor(event.target.value)} required/></label><label>原发布时间<input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} required/></label></div><label>朋友圈文字<textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} required/></label><label>所在位置<input value={location} onChange={(event) => setLocation(event.target.value)}/></label><label className="upload-box"><ImagePlus/><div><b>正文图片或视频</b><small>选择后上传到 R2 私有桶</small></div><input type="file" accept="image/*,video/*,.heic,.heif" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))}/><span>{files.length ? `已选 ${files.length} 个文件` : '选择文件'}</span></label><label>点赞名单<input value={likes} onChange={(event) => setLikes(event.target.value)} placeholder="用逗号分隔"/></label><label>评论（每行一条，可用“昵称：内容”）<textarea rows={3} value={comments} onChange={(event) => setComments(event.target.value)}/></label><button className="primary-action" disabled={saving}>{saving ? '正在上传并保存…' : '保存完整朋友圈'}</button></form>;
}

function TripComposer({ onSaved }: { onSaved: (message: string) => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [stationName, setStationName] = useState(''); const [stationDescription, setStationDescription] = useState(''); const [longitude, setLongitude] = useState('108.387056'); const [latitude, setLatitude] = useState('22.767789'); const [files, setFiles] = useState<File[]>([]); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !stationName.trim()) return; setSaving(true); try { await createCloudTrip({ title: title.trim(), description: description.trim(), stations: [{ name: stationName.trim(), description: stationDescription.trim(), coordinates: [Number(longitude), Number(latitude)], files }] }); setTitle(''); setDescription(''); setStationName(''); setFiles([]); onSaved('旅行已保存，另一台设备刷新后即可看到。'); } catch (error) { onSaved(error instanceof Error ? error.message : '旅行保存失败'); } finally { setSaving(false); } };
  return <form className="moment-composer" onSubmit={submit}><p className="form-kicker">TRAVEL MEMORY</p><h2>新增旅行记录</h2><p className="composer-hint">当前版本先保存一条旅行与一个站点；后续可继续添加站点和编辑能力。</p><label>旅行标题<input value={title} onChange={(event) => setTitle(event.target.value)} required/></label><label>旅行简介<input value={description} onChange={(event) => setDescription(event.target.value)}/></label><label>首个站点名称<input value={stationName} onChange={(event) => setStationName(event.target.value)} required/></label><label>站点介绍<textarea rows={3} value={stationDescription} onChange={(event) => setStationDescription(event.target.value)}/></label><div className="form-row"><label>经度<input type="number" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} required/></label><label>纬度<input type="number" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} required/></label></div><label className="upload-box"><ImagePlus/><div><b>站点照片或视频</b><small>选择后上传到 R2 私有桶</small></div><input type="file" accept="image/*,video/*,.heic,.heif" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))}/><span>{files.length ? `已选 ${files.length} 个文件` : '选择文件'}</span></label><button className="primary-action" disabled={saving}><MapPinned size={17}/>{saving ? '正在上传并保存…' : '保存旅行记录'}</button></form>;
}
