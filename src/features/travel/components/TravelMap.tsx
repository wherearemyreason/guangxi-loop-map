import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { TravelStop } from '../types';
import styles from '../TravelPage.module.css';

interface TravelMapProps {
  stops: TravelStop[];
  routes?: TravelStop[][];
  activeStopId?: string;
  onStopSelect: (stop: TravelStop) => void;
}

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

/** Mapbox adapter with a no-token fallback for local previews and tests. */
export function TravelMap({ stops, routes, activeStopId, onStopSelect }: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [108.1, 23.1],
      zoom: 6.8,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setMapReady(true));
    map.on('error', () => setMapFailed(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const routeGroups = routes?.length ? routes : [stops];
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = stops.map((stop) => {
      const button = document.createElement('button');
      button.className = styles.mapMarker;
      button.type = 'button';
      button.textContent = String(stop.order);
      button.setAttribute('aria-label', `打开 ${stop.name}`);
      button.onclick = () => onStopSelect(stop);
      return new mapboxgl.Marker({ element: button, anchor: 'center' })
        .setLngLat([...stop.coordinates])
        .addTo(map);
    });
    const routeCoordinates = routeGroups.flatMap((routeStops) => routeStops.map((stop) => [...stop.coordinates] as [number, number]));
    const routeFeatures = routeGroups
      .map((routeStops) => routeStops.map((stop) => [...stop.coordinates] as [number, number]))
      .filter((route) => route.length > 1)
      .map((route) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route } }));
    const routeData = { type: 'FeatureCollection' as const, features: routeFeatures };
    const routeSource = map.getSource('travel-route') as mapboxgl.GeoJSONSource | undefined;
    if (routeSource) routeSource.setData(routeData);
    else if (routeFeatures.length > 0) {
      map.addSource('travel-route', { type: 'geojson', data: routeData });
      map.addLayer({ id: 'travel-route', type: 'line', source: 'travel-route', paint: { 'line-color': '#ee6c4d', 'line-width': 4, 'line-opacity': 0.86 } });
    }
    if (routeCoordinates.length > 1) {
      const bounds = routeCoordinates.reduce((current, coordinates) => current.extend(coordinates), new mapboxgl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 11, duration: 650 });
    } else if (routeCoordinates[0]) {
      map.flyTo({ center: routeCoordinates[0], zoom: 10, duration: 650 });
    }
  }, [mapReady, onStopSelect, routes, stops]);

  useEffect(() => {
    const active = stops.find((stop) => stop.id === activeStopId);
    if (active && mapRef.current) mapRef.current.flyTo({ center: [...active.coordinates], zoom: 10.2, duration: 700 });
  }, [activeStopId, stops]);

  if (!token || mapFailed) {
    return <div className={styles.mapFallback} aria-label="旅行路线概览">
      <div className={styles.mapFallbackLine} />
      {stops.map((stop, index) => <button
        className={`${styles.fallbackPin} ${activeStopId === stop.id ? styles.fallbackPinActive : ''}`}
        key={stop.id}
        onClick={() => onStopSelect(stop)}
        style={{ left: `${10 + ((index * 71) % 78)}%`, top: `${18 + ((index * 37) % 63)}%` }}
      >{stop.order}<span>{stop.name}</span></button>)}
      <p>{mapFailed ? '地图服务暂时不可用 · 已显示路线概览' : '路线预览 · 配置 VITE_MAPBOX_TOKEN 后显示真实地图'}</p>
    </div>;
  }
  return <div ref={containerRef} className={styles.mapCanvas} aria-label="旅行路线地图" />;
}
