import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Play, Volume2, VolumeX, X } from 'lucide-react';
import type { TravelMedia, TravelStop } from '../types';
import { resolveTravelMedia } from '../data/cloudTravelRepository';
import styles from '../TravelPage.module.css';

interface StationModalProps { stop: TravelStop; onClose: () => void; }

export function StationModal({ stop, onClose }: StationModalProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [muted, setMuted] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const [resolvedVideo, setResolvedVideo] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const images = useMemo(() => stop.media.filter((item) => item.kind === 'image'), [stop]);
  const video = useMemo(() => stop.media.find((item) => item.kind === 'video'), [stop]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void Promise.all(images.map(async (media) => [media.id, await resolveTravelMedia(media)] as const)).then((entries) => {
      if (alive) setResolvedImages(Object.fromEntries(entries));
    });
    return () => { alive = false; };
  }, [images]);

  useEffect(() => {
    let alive = true;
    void (video ? resolveTravelMedia(video) : Promise.resolve('')).then((url) => { if (alive) setResolvedVideo(url); });
    return () => { alive = false; };
  }, [video]);

  const startVideo = async () => {
    if (!videoRef.current) return;
    try { await videoRef.current.play(); } catch { /* Playback remains user-controlled if unsupported. */ }
  };
  const showMedia = (media: TravelMedia, index: number) => { if (media.kind === 'image') { setSelected(index); setGalleryOpen(true); } };

  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
    <section className={styles.stationModal} role="dialog" aria-modal="true" aria-label={`${stop.name} 回忆`} onMouseDown={(event) => event.stopPropagation()}>
      <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
      <p className={styles.eyebrow}>第 {stop.order} 站</p><h2>{stop.name}</h2><p className={styles.stopDescription}>{stop.description}</p>
      {video && <div className={styles.videoStage}>
        <video ref={videoRef} src={resolvedVideo} poster={video.posterUrl} muted={muted} controls playsInline />
        <div className={styles.videoActions}><button type="button" onClick={startVideo}><Play size={17} fill="currentColor" /> 开始播放</button><button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? '开启声音' : '静音'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button></div>
      </div>}
      <div className={styles.galleryHeader}><span><ImageIcon size={17} /> {images.length} 张照片</span><button type="button" onClick={() => images.length && setGalleryOpen(true)}>打开相册</button></div>
      <div className={styles.photoStrip}>{images.slice(0, 5).map((media, index) => <button type="button" key={media.id} onClick={() => showMedia(media, index)}>{resolvedImages[media.id] ? <img src={resolvedImages[media.id]} alt={media.alt} loading="lazy" /> : <span aria-label={`${media.alt}加载中`} />}</button>)}</div>
      {galleryOpen && images.length > 0 && <div className={styles.galleryOverlay} role="dialog" aria-modal="true" aria-label="照片相册"><button type="button" className={styles.closeButton} onClick={() => setGalleryOpen(false)} aria-label="关闭相册"><X /></button>{resolvedImages[images[selected].id] ? <img src={resolvedImages[images[selected].id]} alt={images[selected].alt} /> : <span aria-label="图片加载中" /> }<button type="button" className={styles.galleryPrev} onClick={() => setSelected((selected - 1 + images.length) % images.length)} aria-label="上一张"><ChevronLeft /></button><button type="button" className={styles.galleryNext} onClick={() => setSelected((selected + 1) % images.length)} aria-label="下一张"><ChevronRight /></button><p>{selected + 1} / {images.length}</p></div>}
    </section>
  </div>;
}
