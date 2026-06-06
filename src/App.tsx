import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Pause, RotateCcw, Volume2, VolumeX, SkipBack, SkipForward, Music, Database } from 'lucide-react';
import defaultTrips from './tripsData.json';
import PhotoModal from './components/PhotoModal';
import TripSidebar from './components/TripSidebar';
import AddTripModal from './components/AddTripModal';
import VisitorEntry from './components/VisitorEntry';
import VisitorLogsModal from './components/VisitorLogsModal';
import AdminPanel from './components/AdminPanel';
import { supabase } from './utils/supabase';
import type { Station, Trip } from './types';
import { getCustomTrips, saveCustomTrip, deleteCustomTrip, getAssetUrl } from './utils/db';

interface Song {
  title: string;
  artist: string;
  src: string;
}

const MUSIC_LIBRARY: Song[] = [
  { title: '小宇', artist: '张震岳', src: '/music/张震岳 - 小宇.mp3' },
  { title: '公路之歌', artist: '痛仰乐队', src: '/music/痛仰乐队 - 公路之歌.mp3' },
  { title: '蓝莲花', artist: '许巍', src: '/music/许巍 - 蓝莲花.mp3' },
  { title: '旅行的意义', artist: '陈绮贞', src: '/music/陈绮贞 - 旅行的意义.mp3' },
  { title: '云烟成雨', artist: '房东的猫', src: '/music/房东的猫 - 云烟成雨.mp3' },
];

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
  const stationMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [trips, setTrips] = useState<Trip[]>(defaultTrips as Trip[]);
  const [activeTripId, setActiveTripId] = useState<string>(defaultTrips[0]?.id || '');

  const [mapLoaded, setMapLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [autoPlayModal, setAutoPlayModal] = useState(false);
  const [visitedIds, setVisitedIds] = useState<Set<number>>(new Set());
  const [currentStationId, setCurrentStationId] = useState<number | null>(null);
  const [journeyComplete, setJourneyComplete] = useState(false);
  
  // Custom travel creation states
  const [showAddModal, setShowAddModal] = useState(false);

  // Visitor entry & logs modal states
  const [showEntry, setShowEntry] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  
  // Admin panel states
  const [showAdmin, setShowAdmin] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const clickTimeoutRef = useRef<number | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [resolvedMusicUrl, setResolvedMusicUrl] = useState('/music/张震岳 - 小宇.mp3');
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [audioErrorIndex, setAudioErrorIndex] = useState<number | null>(null);
  const [availableSongs, setAvailableSongs] = useState<Song[]>([]);

  // Animation state (refs to avoid stale closures)
  const animRef = useRef({
    isMoving: false,
    targetIndex: 1, // index in stations array of next target
    progress: 0, // distance traveled along route (km)
    frameId: 0,
    speed: 0, // km per frame
  });

  // Active Trip & Stations
  const activeTrip = useMemo(() => {
    return trips.find(t => t.id === activeTripId) || trips[0] || null;
  }, [trips, activeTripId]);

  const stations = useMemo(() => {
    return activeTrip?.stations || [];
  }, [activeTrip]);

  // Pre-calculate dynamic song list of actually available songs
  const songsList = useMemo<Song[]>(() => {
    const list = [...availableSongs];
    if (activeTrip?.musicUrl && resolvedMusicUrl) {
      // Only prepend if it is a custom uploaded music file (starts with blob:)
      // and not already present in the list
      if (resolvedMusicUrl.startsWith('blob:') && !list.some(s => s.src === resolvedMusicUrl)) {
        let title = '已上传的自定义背景音乐';
        if (activeTrip.musicUrl && !activeTrip.musicUrl.startsWith('blob://db/')) {
          const fileName = activeTrip.musicUrl.split('/').pop()?.replace(/\.[^/.]+$/, "");
          if (fileName) {
            try {
              title = decodeURIComponent(fileName);
            } catch (e) {
              title = fileName;
            }
          }
        }
        list.unshift({
          title: title,
          artist: activeTrip.title || '自定义',
          src: resolvedMusicUrl
        });
      }
    }
    // Fallback: If no songs are downloaded yet, keep at least '小宇'
    if (list.length === 0) {
      list.push(MUSIC_LIBRARY[0]);
    }
    return list;
  }, [availableSongs, activeTrip, resolvedMusicUrl]);

  const currentSong = useMemo(() => {
    return songsList[currentSongIndex] || songsList[0] || MUSIC_LIBRARY[0];
  }, [songsList, currentSongIndex]);

  const loadData = useCallback(async () => {
    let cloudStations: Station[] = [];
    try {
      const { data, error } = await supabase.from('trips').select('*').order('id', { ascending: true });
      if (!error && data) {
        cloudStations = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          folderName: item.folder_name,
          coordinates: [item.lng, item.lat],
          photos: item.photos || []
        }));
      }
    } catch (e) {
      console.error('Failed to load from Supabase:', e);
    }
    
    getCustomTrips().then((custom) => {
      const defaultTripsCopy = JSON.parse(JSON.stringify(defaultTrips));
      if (cloudStations.length > 0) {
        defaultTripsCopy[0].stations = cloudStations;
      }
      setTrips([...defaultTripsCopy, ...custom]);
    });
  }, []);

  // Load Custom Travels from DB and Cloud
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pre-calculate route segments dynamically for active trip
  const routeDistsRef = useRef<{ segmentDistances: number[]; cumulativeDistances: number[] }>({
    segmentDistances: [],
    cumulativeDistances: [0]
  });

  useEffect(() => {
    const segDists: number[] = [];
    const cumDists: number[] = [0];
    for (let i = 1; i < stations.length; i++) {
      const d = haversine(stations[i - 1].coordinates, stations[i].coordinates);
      segDists.push(d);
      cumDists.push(cumDists[i - 1] + d);
    }
    routeDistsRef.current = {
      segmentDistances: segDists,
      cumulativeDistances: cumDists
    };
  }, [stations]);

  // Resolve music path (IndexedDB blob URL or relative URL)
  useEffect(() => {
    if (activeTrip?.musicUrl) {
      getAssetUrl(activeTrip.musicUrl).then((url) => {
        setResolvedMusicUrl(url);
      }).catch(err => {
        console.error("Failed to get custom music URL:", err);
        setResolvedMusicUrl('/music/张震岳 - 小宇.mp3');
      });
    } else {
      setResolvedMusicUrl('/music/张震岳 - 小宇.mp3');
    }
  }, [activeTrip?.musicUrl]);

  // Check which preset songs are actually present in public/music/ folder
  const checkPresetSongs = useCallback(async () => {
    const verifiedSongs: Song[] = [];
    for (const song of MUSIC_LIBRARY) {
      try {
        const response = await fetch(song.src, { method: 'HEAD' });
        if (response.ok) {
          verifiedSongs.push(song);
        }
      } catch (error) {
        console.warn(`Background music file not found: ${song.src}`, error);
      }
    }
    setAvailableSongs(verifiedSongs);
  }, []);

  // Check on mount
  useEffect(() => {
    checkPresetSongs();
  }, [checkPresetSongs]);

  // Re-check when music panel is opened
  useEffect(() => {
    if (showMusicPanel) {
      checkPresetSongs();
    }
  }, [showMusicPanel, checkPresetSongs]);

  // When active trip changes or resolved music URL changes,
  // automatically select the matching song from the available playlist.
  useEffect(() => {
    const idx = songsList.findIndex(s => s.src === resolvedMusicUrl);
    if (idx !== -1) {
      setCurrentSongIndex(idx);
    } else {
      setCurrentSongIndex(0);
    }
  }, [resolvedMusicUrl, songsList]);

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Load and play when the selected song changes
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.load();
    audioRef.current.volume = volume;
    setAudioErrorIndex(null);
    
    if (isMusicPlaying) {
      audioRef.current.play().catch(err => {
        console.error("Audio play failed on song change:", err);
        setAudioErrorIndex(currentSongIndex);
        setIsMusicPlaying(false);
      });
    }
  }, [currentSong]);

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
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
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

  /* ── Sync markers and routes when active trip changes ── */
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // Clear old markers
    stationMarkersRef.current.forEach(m => m.remove());
    stationMarkersRef.current = [];

    // Draw markers
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

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(station.coordinates)
        .addTo(mapRef.current!);

      stationMarkersRef.current.push(marker);
    });

    // Update main route line
    const routeCoords = stations.map(s => s.coordinates);
    const source = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource;
    source?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeCoords },
    });

    // Reset visited route line
    const visitedSource = mapRef.current.getSource('route-visited') as mapboxgl.GeoJSONSource;
    visitedSource?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] },
    });

    // Fit camera zoom bounds to the new trip
    if (stations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      stations.forEach(s => bounds.extend(s.coordinates));
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 10.5, duration: 1200 });
    }
  }, [mapLoaded, stations]);

  /* ── Update marker styles based on state ─────── */
  useEffect(() => {
    stationMarkersRef.current.forEach((marker, idx) => {
      const station = stations[idx];
      if (station) {
        const el = marker.getElement();
        el.classList.toggle('marker-visited', visitedIds.has(station.id));
        el.classList.toggle('marker-active', currentStationId === station.id);
      }
    });
  }, [visitedIds, currentStationId, stations]);

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
  }, [stations]);

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
  }, [updateVisitedRoute, stations]);

  /* ── Animation loop ──────────────────────────── */
  const startMoving = useCallback(() => {
    const anim = animRef.current;
    if (anim.targetIndex >= stations.length) return;

    anim.isMoving = true;

    // Calculate speed: cover each segment in ~3 seconds at 60fps
    const segDist = routeDistsRef.current.segmentDistances[anim.targetIndex - 1];
    anim.speed = segDist / (3 * 60); // km per frame (~3 sec at 60fps)

    const animate = () => {
      if (!anim.isMoving) return;

      anim.progress += anim.speed;

      const targetCumDist = routeDistsRef.current.cumulativeDistances[anim.targetIndex];

      if (anim.progress >= targetCumDist) {
        // Arrived at station
        anim.progress = targetCumDist;
        showCar(stations[anim.targetIndex].coordinates);
        pauseAtStation(anim.targetIndex);
        return;
      }

      // Interpolate position
      const segStart = routeDistsRef.current.cumulativeDistances[anim.targetIndex - 1];
      const segEnd = routeDistsRef.current.cumulativeDistances[anim.targetIndex];
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
  }, [showCar, pauseAtStation, updateVisitedRoute, stations]);

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
  }, [isPlaying, hideCar, stations, startMoving]);

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
  }, [isPlaying, showCar, hideCar, pauseAtStation, startMoving, updateVisitedRoute, stations]);

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

    if (mapRef.current && stations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      stations.forEach(s => bounds.extend(s.coordinates));
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 1200 });
    }
  }, [hideCar, updateVisitedRoute, stations]);

  // When active trip changes, reset the playback states
  useEffect(() => {
    cancelAnimationFrame(animRef.current.frameId);
    animRef.current = { isMoving: false, targetIndex: 1, progress: 0, frameId: 0, speed: 0 };
    setIsPlaying(false);
    setShowModal(false);
    setActiveStation(null);
    setVisitedIds(new Set());
    setCurrentStationId(null);
    setJourneyComplete(false);
    hideCar();
    
    // Clear visited route line immediately
    if (mapLoaded && mapRef.current) {
      const visitedSource = mapRef.current.getSource('route-visited') as mapboxgl.GeoJSONSource;
      visitedSource?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      });
    }
  }, [activeTripId, mapLoaded, hideCar]);

  /* ── Toggle Music & Playlist Controls ───────── */
  const toggleMusic = useCallback(() => {
    if (!audioRef.current) return;
    if (isMusicPlaying) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsMusicPlaying(true);
        setAudioErrorIndex(null);
      }).catch(err => {
        console.error("Audio playback failed:", err);
        setAudioErrorIndex(currentSongIndex);
        setIsMusicPlaying(false);
      });
    }
  }, [isMusicPlaying, currentSongIndex]);

  const handleEntryComplete = useCallback((_visitorName: string) => {
    setShowEntry(false);
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setIsMusicPlaying(true);
        setAudioErrorIndex(null);
      }).catch(err => {
        console.warn("Background music autoplay failed:", err);
      });
    }
  }, []);

  const playNext = useCallback(() => {
    setCurrentSongIndex((prev) => (prev + 1) % songsList.length);
    setIsMusicPlaying(true);
  }, [songsList.length]);

  const playPrev = useCallback(() => {
    setCurrentSongIndex((prev) => (prev - 1 + songsList.length) % songsList.length);
    setIsMusicPlaying(true);
  }, [songsList.length]);

  const selectSong = useCallback((index: number) => {
    setCurrentSongIndex(index);
    setIsMusicPlaying(true);
  }, []);

  // Handle saving new trip
  const handleSaveTrip = async (newTrip: Trip) => {
    await saveCustomTrip(newTrip);
    setTrips(prev => {
      const filtered = prev.filter(t => t.id !== newTrip.id);
      return [...filtered, newTrip];
    });
    setActiveTripId(newTrip.id);
    setShowAddModal(false);
  };

  // Handle deleting custom trip
  const handleDeleteTrip = async (tripId: string) => {
    await deleteCustomTrip(tripId);
    setTrips(prev => prev.filter(t => t.id !== tripId));
    if (activeTripId === tripId) {
      const remainingTrips = trips.filter(t => t.id !== tripId);
      if (remainingTrips.length > 0) {
        setActiveTripId(remainingTrips[0].id);
      }
    }
  };

  // -- Admin title click logic --
  const handleTitleClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setShowAdmin(true);
        return 0;
      }
      return newCount;
    });
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = window.setTimeout(() => setClickCount(0), 1000);
  };

  /* ── Render ──────────────────────────────────── */
  return (
    <div className="w-full h-full relative">
      {showEntry && (
        <VisitorEntry onComplete={handleEntryComplete} />
      )}

      {showAdmin && (
        <AdminPanel 
          onClose={() => setShowAdmin(false)} 
          onDataUpdated={() => loadData()} 
        />
      )}

      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Title card */}
      <div 
        className="title-card glass cursor-pointer select-none"
        onClick={handleTitleClick}
        title="点击5次进入管理员面板"
      >
        <h1>{activeTrip?.title || '专属旅行回忆'}</h1>
        <p>{activeTrip?.description || `${stations.length} 站 · 自驾旅途回忆`}</p>
      </div>

      {/* Background Music Player */}
      <div className="music-player-container">
        <div className="music-pill glass">
          <button 
            className={`music-btn play-pause-btn ${isMusicPlaying ? 'playing' : ''}`}
            onClick={toggleMusic}
            title={isMusicPlaying ? "暂停背景音乐" : "播放背景音乐"}
          >
            {isMusicPlaying ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          
          <div className="music-divider" />
          
          <button
            className={`music-btn list-toggle-btn ${showMusicPanel ? 'active' : ''}`}
            onClick={() => setShowMusicPanel(!showMusicPanel)}
            title="背景音乐库"
          >
            <Music size={18} />
          </button>
        </div>

        {showMusicPanel && (
          <div className="music-panel glass">
            <div className="current-track-info">
              <span className="track-title-label">正在播放:</span>
              <div className="track-text">
                <span className="track-title">{currentSong.title}</span>
                <span className="track-artist"> - {currentSong.artist}</span>
              </div>
            </div>

            <div className="panel-controls">
              <button className="ctrl-btn" onClick={playPrev} title="上一首">
                <SkipBack size={16} />
              </button>
              <button className="ctrl-btn main-play-btn" onClick={toggleMusic} title={isMusicPlaying ? "暂停" : "播放"}>
                {isMusicPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 1 }} />}
              </button>
              <button className="ctrl-btn" onClick={playNext} title="下一首">
                <SkipForward size={16} />
              </button>
            </div>

            <div className="volume-control">
              {volume === 0 ? <VolumeX size={14} style={{ color: '#94a3b8' }} /> : <Volume2 size={14} style={{ color: '#64748b' }} />}
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={volume} 
                onChange={(e) => setVolume(parseFloat(e.target.value))} 
                className="volume-slider"
                title="音量调节"
              />
            </div>

            <div className="song-list-title">音乐库列表</div>
            <div className="song-list">
              {songsList.map((song, index) => {
                const isActive = index === currentSongIndex;
                const hasError = audioErrorIndex === index;
                return (
                  <div 
                    key={index} 
                    className={`song-item ${isActive ? 'active' : ''} ${hasError ? 'error' : ''}`}
                    onClick={() => selectSong(index)}
                  >
                    <div className="song-details">
                      <span className="song-name">{song.title}</span>
                      <span className="song-artist-name">{song.artist}</span>
                    </div>
                    {isActive && isMusicPlaying && (
                      <div className="music-waves">
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                      </div>
                    )}
                    {hasError && (
                      <span className="error-tag" title="提示：文件未找到。请下载该歌曲并保存至 public/music/ 文件夹中">
                        未下载
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="music-tip">
              💡 提示：请将下载的 mp3 音频命名后放入主目录下的 <code>public/music/</code> 目录即可播放。
            </div>
          </div>
        )}
      </div>

      {/* Visitor Logs Toggle Button */}
      {!showEntry && (
        <button
          className="visitor-logs-toggle glass"
          onClick={() => setShowLogs(true)}
          title="查看访客记录"
        >
          <Database size={20} />
        </button>
      )}

      {/* Visitor Logs Modal */}
      {showLogs && (
        <VisitorLogsModal onClose={() => setShowLogs(false)} />
      )}

      {/* Background Audio Element */}
      <audio 
        ref={audioRef} 
        src={currentSong.src} 
        loop 
        onError={() => {
          console.warn("Failed to load audio:", currentSong.src);
          setAudioErrorIndex(currentSongIndex);
          setIsMusicPlaying(false);
        }}
      />

      {/* Play controls */}
      {mapLoaded && stations.length > 0 && (
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

      {/* Trip Sidebar Drawer */}
      <TripSidebar
        trips={trips}
        activeTripId={activeTripId}
        onSelectTrip={setActiveTripId}
        onAddTripClick={() => setShowAddModal(true)}
        onDeleteTrip={handleDeleteTrip}
      />

      {/* Add Trip Modal (always rendered when open) */}
      {showAddModal && (
        <AddTripModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveTrip}
          allTrips={trips}
        />
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
          <p>{activeTrip?.title} · {stations.length} 站全部到达<br />每一程山水，都是和你的美好回忆</p>
          <button onClick={resetJourney}>重新出发</button>
        </div>
      )}
    </div>
  );
}
