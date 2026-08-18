import { Heart, MapPin, MessageCircle, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatMomentTime, listMoments } from './momentsService';
import type { Moment } from './types';
import { ResolvedMedia } from '../../components/ResolvedMedia';
import './moments.css';
import './moments-media.css';
import './moment-composition.css';

export interface MomentsPageProps { onOpenMoment?: (id: string) => void; }

export function MomentsPage({ onOpenMoment }: MomentsPageProps) {
  const [query, setQuery] = useState('');
  const [activeMedia, setActiveMedia] = useState<{ url: string; alt: string; kind: 'image' | 'video' } | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void listMoments().then((items) => { if (alive) setMoments(items); }).catch(console.error).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const visibleMoments = useMemo(() => moments.filter((moment) => `${moment.body} ${moment.location ?? ''} ${moment.author}`.toLowerCase().includes(query.toLowerCase())), [moments, query]);
  return <main className="moments-page">
    <section className="moments-hero"><div className="moments-hero-shade"/><div className="moments-hero-copy"><span>OOOLJ.FUN · 私密存档</span><h1>那些被好好记住的瞬间</h1><p>只属于两个人的时间线</p></div></section>
    <div className="moments-toolbar"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文字、地点或作者" /></div>
    <section className="moments-stream" aria-label="朋友圈时间线">
      {loading && <p className="moments-empty">正在读取云端回忆…</p>}
      {!loading && visibleMoments.map((moment) => <MomentCard key={moment.id} moment={moment} onOpen={() => onOpenMoment?.(moment.id)} onImage={(url, alt, kind) => setActiveMedia({ url, alt, kind })}/>) }
      {!loading && !visibleMoments.length && <p className="moments-empty">还没有匹配的回忆。</p>}
    </section>
    {activeMedia && <div className="moments-lightbox" role="dialog" aria-modal="true" onClick={() => setActiveMedia(null)}><button type="button" aria-label="关闭预览" onClick={() => setActiveMedia(null)}><X /></button>{activeMedia.kind === 'video' ? <video src={activeMedia.url} controls autoPlay playsInline onClick={(event) => event.stopPropagation()}/> : <img src={activeMedia.url} alt={activeMedia.alt} onClick={(event) => event.stopPropagation()}/>}</div>}
  </main>;
}

interface CardProps { moment: Moment; onOpen: () => void; onImage: (url: string, alt: string, kind: 'image' | 'video') => void; }
function MomentCard({ moment, onOpen, onImage }: CardProps) {
  return <article className="moment-card">
    <div className="moment-avatar" aria-hidden="true">{moment.avatar}</div><div className="moment-content">
      <button className="moment-author" onClick={onOpen}>{moment.author}</button><p className="moment-body">{moment.body}</p>
      {!!moment.media.length && <div className={`moment-grid count-${Math.min(moment.media.length, 9)}`}>{moment.media.slice(0, 9).map((media) => <button key={media.id} className="moment-media"><ResolvedMedia src={media.url} alt={media.alt} kind={media.kind} onOpen={(url) => onImage(url, media.alt, media.kind)}/>{media.kind === 'video' && <span>视频</span>}</button>)}</div>}
      {moment.feedbackScreenshot && <div className="moment-feedback-screenshot"><ResolvedMedia src={moment.feedbackScreenshot.url} alt="点赞和评论截图" kind="image" onOpen={(url) => onImage(url, '点赞和评论截图', 'image')}/></div>}
      {moment.location && <p className="moment-location"><MapPin size={14}/>{moment.location}</p>}
      <div className="moment-meta"><time>{formatMomentTime(moment.publishedAt)}</time><button onClick={onOpen}>详情</button></div>
      {(moment.likes.length > 0 || moment.comments.length > 0) && <div className="moment-feedback">
        {moment.likes.length > 0 && <p><Heart size={14} fill="currentColor"/> {moment.likes.join('、')}</p>}
        {moment.comments.map((comment) => <p key={comment.id} className="moment-comment"><b>{comment.author}</b>{comment.replyTo && <> 回复 <b>{comment.replyTo}</b></>}：{comment.body}</p>)}
      </div>}
      <button className="moment-comment-button" onClick={onOpen}><MessageCircle size={15}/>查看互动</button>
    </div>
  </article>;
}
