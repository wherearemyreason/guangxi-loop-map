import { useEffect, useState } from 'react';
import { getAssetUrl } from '../utils/db';
import { getPrivateMediaUrl, isPrivateMediaUrl } from '../features/media/mediaService';

interface Props { src: string; alt: string; kind: 'image' | 'video'; className?: string; controls?: boolean; onOpen?: (resolvedUrl: string) => void; }

export function ResolvedMedia({ src, alt, kind, className, controls = false, onOpen }: Props) {
  const [url, setUrl] = useState(src.startsWith('blob://db/') ? '' : src);
  useEffect(() => { let alive = true; const resolver = isPrivateMediaUrl(src) ? getPrivateMediaUrl(src.slice('media://'.length)) : getAssetUrl(src); void resolver.then((resolved) => { if (alive) setUrl(resolved); }).catch(() => { if (alive) setUrl(''); }); return () => { alive = false; }; }, [src]);
  if (!url) return <span className={className} aria-label={`${alt}加载中`}/>;
  if (kind === 'video') return <video className={className} src={url} aria-label={alt} controls={controls} muted={!controls} playsInline preload="metadata" onClick={() => onOpen?.(url)}/>;
  return <img className={className} src={url} alt={alt} loading="lazy" onClick={() => onOpen?.(url)}/>;
}
