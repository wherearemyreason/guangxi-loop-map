import { ArrowLeft, Heart, MapPin } from 'lucide-react';
import { formatMomentTime, getMoment } from './momentsService';
import { useEffect, useState } from 'react';
import './moments.css';
import './moment-composition.css';
import { ResolvedMedia } from '../../components/ResolvedMedia';

export interface MomentDetailProps { momentId: string; onBack?: () => void; }
export function MomentDetail({ momentId, onBack }: MomentDetailProps) {
  const [moment, setMoment] = useState<Awaited<ReturnType<typeof getMoment>>>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; void getMoment(momentId).then((item) => { if (alive) setMoment(item); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [momentId]);
  if (loading) return <main className="moments-page"><p className="moments-empty">正在读取回忆…</p></main>;
  if (!moment) return <main className="moments-page"><p className="moments-empty">这条回忆不存在或已被移入回收站。</p></main>;
  return <main className="moments-page"><section className="moment-detail"><button className="detail-back" onClick={onBack}><ArrowLeft size={18}/>返回时间线</button><div className="detail-heading"><div className="moment-avatar">{moment.avatar}</div><div><h1>{moment.author}</h1><time>{formatMomentTime(moment.publishedAt)}</time></div></div><p className="detail-body">{moment.body}</p><div className="detail-media">{moment.media.map((media) => <ResolvedMedia key={media.id} src={media.url} alt={media.alt} kind={media.kind} controls={media.kind === 'video'}/>)}</div>{moment.feedbackScreenshot && <div className="detail-feedback-screenshot"><ResolvedMedia src={moment.feedbackScreenshot.url} alt="点赞和评论截图" kind="image"/></div>}{moment.location && <p className="moment-location"><MapPin size={14}/>{moment.location}</p>}<section className="moment-feedback detail-feedback"><p><Heart size={14} fill="currentColor"/> {moment.likes.length ? moment.likes.join('、') : '还没有点赞'}</p>{moment.comments.map((comment) => <p key={comment.id}><b>{comment.author}</b>{comment.replyTo && <> 回复 <b>{comment.replyTo}</b></>}：{comment.body}</p>)}</section>{moment.sourceScreenshotName && <p className="detail-source">迁移凭证：{moment.sourceScreenshotName}</p>}</section></main>;
}
