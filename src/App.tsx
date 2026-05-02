import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import tripData from './tripData.json';
import PhotoModal from './components/PhotoModal';
import type { Station } from './types';

const stations: Station[] = tripData as Station[];

/* ── Mapbox Token ─────────────────────────────── */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/* ── Geo helpers ──────────────────────────────── */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function bearing(a: [number, number], b: [number, number]): number {
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ── Pre-calculate route segments ─────────────── */
const segmentDistances: number[] = [];
const cumulativeDistances: number[] = [0];
for (let i = 1; i < stations.length; i++) {
  const d = haversine(stations[i - 1].coordinates, stations[i].coordinates);
  segmentDistances.push(d);
  cumulativeDistances.push(cumulativeDistances[i - 1] + d);
}


/* ── Car SVG ──────────────────────────────────── */
const CAR_SVG = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v7.5c0 .55.45 1 1 1h1c.55 0 1-.45 1-1V19h12v.5c0 .55.45 1 1 1h1c.55 0 1-.45 1-1V12l-2.08-5.99zM6.85 7h10.29l1.08 3.11H5.78L6.85 7zM19 17H5v-4.5h14V17z"/>
  <circle cx="7.5" cy="15.5" r="1.5"/>
  <circle cx="16.5" cy="15.5" r="1.5"/>
</svg>`;

/* ── Main App ─────────────────────────────────── */
export default function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markerEls = useRef<HTMLDivElement[]>([]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [autoPlayModal, setAutoPlayModal] = useState(false);
  const [visitedIds, setVisitedIds] = useState<Set<number>>(new Set());
  const [currentStationId, setCurrentStationId] = useState<number | null>(null);
  const [journeyComplete, setJourneyComplete] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  // Animation state (refs to avoid stale closures)
  const animRef = useRef({
    isMoving: false,
    targetIndex: 1, // index in stations array of next target
    progress: 0, // distance traveled along route (km)
    frameId: 0,
    speed: 0, // km per frame (will be set dynamically)
  });

  /* ── Token check ─────────────────────────────── */
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN_HERE') {
    return (
      <div className="token-error">
        <h2>🗺️ 需要 Mapbox Token</h2>
        <p>
          请打开 <code>.env</code> 文件，将 <code>VITE_MAPBOX_TOKEN</code>{' '}
          替换为你的 Mapbox Access Token。
          <br /><br />
          获取地址：
          <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer"
            style={{ color: '#38bdf8', textDecoration: 'underline' }}>
            account.mapbox.com
          </a>
        </p>
      </div>
    );
  }

  /* ── Initialize Map ──────────────────────────── */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [107.3, 23.2],
      zoom: 6.8,
      pitch: 0,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      /* Route source */
      const routeCoords = stations.map(s => s.coordinates);

      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routeCoords },
        },
      });

      /* Visited route source (starts empty) */
      map.addSource('route-visited', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });

      /* Glow layers (outermost to innermost) */
      const glowColors = [
        { width: 14, opacity: 0.06, color: '#0ea5e9' },
        { width: 8, opacity: 0.12, color: '#0ea5e9' },
        { width: 4, opacity: 0.25, color: '#0ea5e9' },
      ];
      glowColors.forEach((g, i) => {
        map.addLayer({
          id: `route-glow-${i}`,
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': g.color,
            'line-width': g.width,
            'line-opacity': g.opacity,
          },
        });
      });

      /* Main route line */
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0ea5e9',
          'line-width': 2.5,
          'line-opacity': 0.55,
          'line-dasharray': [2, 3],
        },
      });

      /* Visited route overlay */
      map.addLayer({
        id: 'route-visited-line',
        type: 'line',
        source: 'route-visited',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0ea5e9',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });

      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ── Add markers after map loads ─────────────── */
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    markerEls.current = [];

    stations.forEach((station) => {
      const el = document.createElement('div');
      el.className = 'marker-wrapper';
      el.innerHTML = `
        <div class="marker-ping"></div>
        <div class="marker-core"></div>
        <div class="marker-label">${station.name}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // Stop auto-play if running
        if (animRef.current.isMoving) {
          cancelAnimationFrame(animRef.current.frameId);
          animRef.current.isMoving = false;
          setIsPlaying(false);
        }
        setActiveStation(station);
        setAutoPlayModal(false);
        setShowModal(true);
        mapRef.current?.flyTo({
          center: station.coordinates,
          zoom: 11,
          duration: 1200,
        });
      });

      new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(station.coordinates)
        .addTo(mapRef.current!);

      markerEls.current.push(el);
    });
  }, [mapLoaded]);

  /* ── Update marker styles based on state ─────── */
  useEffect(() => {
    markerEls.current.forEach((el, idx) => {
      const id = stations[idx].id;
      el.classList.toggle('marker-visited', visitedIds.has(id));
      el.classList.toggle('marker-active', currentStationId === id);
    });
  }, [visitedIds, currentStationId]);

  /* ── Create / manage car marker ──────────────── */
  const showCar = useCallback((coords: [number, number], rotation = 0) => {
    if (!mapRef.current) return;

    if (!carMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'car-marker';
      el.innerHTML = CAR_SVG;
      carMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
      })
        .setLngLat(coords)
        .addTo(mapRef.current);
    } else {
      carMarkerRef.current.setLngLat(coords);
    }

    const el = carMarkerRef.current.getElement();
    el.style.transform = el.style.transform.replace(/rotate\([^)]*\)/, '') + ` rotate(${rotation}deg)`;
  }, []);

  const hideCar = useCallback(() => {
    carMarkerRef.current?.remove();
    carMarkerRef.current = null;
  }, []);

  /* ── Update visited route line ───────────────── */
  const updateVisitedRoute = useCallback((upToIndex: number, currentPos?: [number, number]) => {
    if (!mapRef.current) return;
    const coords: [number, number][] = [];
    for (let i = 0; i <= Math.min(upToIndex, stations.length - 1); i++) {
      coords.push(stations[i].coordinates);
    }
    if (currentPos) coords.push(currentPos);

    const source = mapRef.current.getSource('route-visited') as mapboxgl.GeoJSONSource;
    source?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    });
  }, []);

  /* ── Pause at station (show modal) ───────────── */
  const pauseAtStation = useCallback((stationIndex: number) => {
    const station = stations[stationIndex];
    animRef.current.isMoving = false;
    setCurrentStationId(station.id);
    setVisitedIds(prev => new Set([...prev, station.id]));
    updateVisitedRoute(stationIndex);

    // Fly to station
    mapRef.current?.flyTo({
      center: station.coordinates,
      zoom: 10.5,
      duration: 1200,
    });

    // Show modal after fly animation
    setTimeout(() => {
      setActiveStation(station);
      setAutoPlayModal(true);
      setShowModal(true);
    }, 800);
  }, [updateVisitedRoute]);

  /* ── Resume after modal closes (auto-play) ──── */
  const onModalClose = useCallback(() => {
    setShowModal(false);
    setActiveStation(null);

    if (!isPlaying) return;

    const anim = animRef.current;
    anim.targetIndex++;

    if (anim.targetIndex >= stations.length) {
      // Journey complete!
      setIsPlaying(false);
      setJourneyComplete(true);
      hideCar();
      return;
    }

    // Small delay then continue
    setTimeout(() => {
      if (!mapRef.current) return;
      // Zoom out a bit for travel
      mapRef.current.flyTo({
        center: stations[anim.targetIndex - 1].coordinates,
        zoom: 8.5,
        duration: 800,
      });
      setTimeout(() => startMoving(), 900);
    }, 400);
  }, [isPlaying, hideCar]);

  /* ── Animation loop ──────────────────────────── */
  const startMoving = useCallback(() => {
    const anim = animRef.current;
    if (anim.targetIndex >= stations.length) return;

    anim.isMoving = true;

    // Calculate speed: cover each segment in ~3 seconds at 60fps
    const segDist = segmentDistances[anim.targetIndex - 1];
    anim.speed = segDist / (3 * 60); // km per frame (~3 sec at 60fps)

    const animate = () => {
      if (!anim.isMoving) return;

      anim.progress += anim.speed;

      const targetCumDist = cumulativeDistances[anim.targetIndex];

      if (anim.progress >= targetCumDist) {
        // Arrived at station
        anim.progress = targetCumDist;
        showCar(stations[anim.targetIndex].coordinates);
        pauseAtStation(anim.targetIndex);
        return;
      }

      // Interpolate position
      const segStart = cumulativeDistances[anim.targetIndex - 1];
      const segEnd = cumulativeDistances[anim.targetIndex];
      const t = (anim.progress - segStart) / (segEnd - segStart);

      const from = stations[anim.targetIndex - 1].coordinates;
      const to = stations[anim.targetIndex].coordinates;
      const currentPos: [number, number] = [lerp(from[0], to[0], t), lerp(from[1], to[1], t)];
      const rot = bearing(from, to);

      showCar(currentPos, rot);
      updateVisitedRoute(anim.targetIndex - 1, currentPos);

      anim.frameId = requestAnimationFrame(animate);
    };

    anim.frameId = requestAnimationFrame(animate);
  }, [showCar, pauseAtStation, updateVisitedRoute]);

  /* ── Play / Pause toggle ─────────────────────── */
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      // Pause
      cancelAnimationFrame(animRef.current.frameId);
      animRef.current.isMoving = false;
      setIsPlaying(false);
      return;
    }

    // Start playing
    setIsPlaying(true);
    setJourneyComplete(false);
    const anim = animRef.current;

    if (anim.targetIndex >= stations.length || anim.progress === 0) {
      // Fresh start
      anim.progress = 0;
      anim.targetIndex = 0;
      setVisitedIds(new Set());
      setCurrentStationId(null);
      updateVisitedRoute(-1);
      hideCar();

      // Fly to start
      mapRef.current?.flyTo({
        center: stations[0].coordinates,
        zoom: 10.5,
        duration: 1500,
      });

      setTimeout(() => {
        showCar(stations[0].coordinates);
        pauseAtStation(0);
      }, 1600);
    } else {
      // Resume from where we stopped
      startMoving();
    }
  }, [isPlaying, showCar, hideCar, pauseAtStation, startMoving, updateVisitedRoute]);

  /* ── Reset journey ───────────────────────────── */
  const resetJourney = useCallback(() => {
    cancelAnimationFrame(animRef.current.frameId);
    animRef.current = { isMoving: false, targetIndex: 1, progress: 0, frameId: 0, speed: 0 };
    setIsPlaying(false);
    setShowModal(false);
    setActiveStation(null);
    setVisitedIds(new Set());
    setCurrentStationId(null);
    setJourneyComplete(false);
    hideCar();
    updateVisitedRoute(-1);

    mapRef.current?.flyTo({ center: [107.3, 23.2], zoom: 6.8, duration: 1200 });
  }, [hideCar, updateVisitedRoute]);

  /* ── Toggle Music ──────────────────────────── */
  const toggleMusic = useCallback(() => {
    if (!audioRef.current) return;
    if (isMusicPlaying) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsMusicPlaying(true);
      }).catch(err => {
        console.error("Audio playback failed:", err);
      });
    }
  }, [isMusicPlaying]);

  /* ── Render ──────────────────────────────────── */
  return (
    <>
      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Title card */}
      <div className="title-card glass">
        <h1>桂西北大环线</h1>
        <p>15 站 · 自驾旅途回忆</p>
      </div>

      {/* Music Toggle */}
      <button 
        className="music-toggle glass" 
        onClick={toggleMusic}
        title={isMusicPlaying ? "暂停背景音乐" : "播放背景音乐"}
      >
        {isMusicPlaying ? <Volume2 size={20} /> : <VolumeX size={20} />}
      </button>

      {/* Background Audio */}
      <audio ref={audioRef} src="/张震岳 - 小宇.mp3" loop />

      {/* Play controls */}
      {mapLoaded && (
        <div className="play-bar glass">
          <button className="play-btn" onClick={handlePlayPause} title={isPlaying ? '暂停' : '开启旅程'}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
          </button>

          <div className="progress-dots">
            {stations.map(s => (
              <div
                key={s.id}
                className={`progress-dot ${visitedIds.has(s.id) ? 'visited' : ''} ${currentStationId === s.id ? 'active' : ''}`}
                title={s.name}
              />
            ))}
          </div>

          {currentStationId && (
            <span className="station-name-pill">
              {stations.find(s => s.id === currentStationId)?.name}
            </span>
          )}

          {(visitedIds.size > 0 || journeyComplete) && (
            <button
              onClick={resetJourney}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                cursor: 'pointer', display: 'flex', padding: 4,
              }}
              title="重新开始"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      )}

      {/* Photo Modal */}
      {showModal && activeStation && (
        <PhotoModal
          station={activeStation}
          autoPlay={autoPlayModal}
          autoPlayDuration={4000}
          onClose={onModalClose}
        />
      )}

      {/* Journey Complete Overlay */}
      {journeyComplete && !showModal && (
        <div className="journey-complete">
          <h2>🎉 旅途圆满</h2>
          <p>桂西北大环线 · 15 站全部到达<br />每一程山水，都是和你的美好回忆</p>
          <button onClick={resetJourney}>重新出发</button>
        </div>
      )}
    </>
  );
}
