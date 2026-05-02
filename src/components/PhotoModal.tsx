import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Station } from '../types';

interface Props {
  station: Station;
  autoPlay?: boolean;
  autoPlayDuration?: number;
  onClose: () => void;
}

export default function PhotoModal({ station, autoPlay = false, autoPlayDuration = 4000, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerProgress, setTimerProgress] = useState(0);
  const timerRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const photos = station.photos;
  const total = photos.length;
  const displayCount = Math.min(total, 6); // show up to 6 photos

  // Auto-advance carousel
  useEffect(() => {
    if (!autoPlay) return;

    startTimeRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / autoPlayDuration, 1);
      setTimerProgress(progress);

      if (progress >= 1) {
        // Move to next photo or close
        if (currentIndex < displayCount - 1) {
          setCurrentIndex(prev => prev + 1);
          startTimeRef.current = Date.now();
          setTimerProgress(0);
        } else {
          onClose();
          return;
        }
      }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(timerRef.current);
  }, [autoPlay, currentIndex, displayCount, autoPlayDuration, onClose]);

  const goNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % displayCount);
    startTimeRef.current = Date.now();
    setTimerProgress(0);
  }, [displayCount]);

  const goPrev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + displayCount) % displayCount);
    startTimeRef.current = Date.now();
    setTimerProgress(0);
  }, [displayCount]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev]);

  // Touch swipe support
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card glass" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button className="modal-close" onClick={onClose}>
          <X size={16} />
        </button>

        {/* Image */}
        <div
          className="modal-image-container"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <img
            key={photos[currentIndex]}
            src={photos[currentIndex]}
            alt={`${station.name} - ${currentIndex + 1}`}
            loading="eager"
          />

          {/* Nav arrows */}
          {displayCount > 1 && (
            <>
              <button className="modal-nav prev" onClick={goPrev}>
                <ChevronLeft size={18} />
              </button>
              <button className="modal-nav next" onClick={goNext}>
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {/* Auto-play timer bar */}
          {autoPlay && (
            <div
              className="auto-timer"
              style={{ width: `${timerProgress * 100}%` }}
            />
          )}
        </div>

        {/* Info */}
        <div className="modal-info">
          <div className="station-id">STOP {String(station.id).padStart(2, '0')}</div>
          <div className="station-name">{station.name}</div>
          <div className="photo-counter">
            {currentIndex + 1} / {displayCount} 张照片
          </div>
        </div>

        {/* Dots */}
        {displayCount > 1 && (
          <div className="modal-dots">
            {Array.from({ length: displayCount }).map((_, i) => (
              <span
                key={i}
                className={i === currentIndex ? 'active' : ''}
                onClick={() => {
                  setCurrentIndex(i);
                  startTimeRef.current = Date.now();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
