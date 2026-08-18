import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Images, MapPin, Route } from 'lucide-react';
import { StationModal } from './components/StationModal';
import { TravelMap } from './components/TravelMap';
import { travelRepository } from './data/travelRepository';
import type { TravelRepository, TravelStop, TravelTrip } from './types';
import styles from './TravelPage.module.css';

interface TravelPageProps { repository?: TravelRepository; }

const ALL_TRIPS_ID = '__all-trips__';

export function TravelPage({ repository = travelRepository }: TravelPageProps) {
  const [trips, setTrips] = useState<TravelTrip[]>([]);
  const [activeTripId, setActiveTripId] = useState('');
  const [selectedStop, setSelectedStop] = useState<TravelStop | null>(null);
  useEffect(() => { void repository.listTrips().then((items) => { setTrips(items); setActiveTripId(items[0]?.id ?? ''); }); }, [repository]);
  const allTripsView = useMemo<TravelTrip>(() => ({
    id: ALL_TRIPS_ID,
    title: '全部旅行记录',
    description: `共 ${trips.length} 次旅行 · 汇总所有沿途站点`,
    coverUrl: trips.find((trip) => trip.coverUrl)?.coverUrl,
    stops: trips.flatMap((trip) => trip.stops.map((stop) => ({
      ...stop,
      description: `${stop.description} · 来自「${trip.title}」`,
    }))).map((stop, index) => ({ ...stop, order: index + 1 })),
  }), [trips]);
  const activeTrip = useMemo(() => {
    if (activeTripId === ALL_TRIPS_ID) return trips.length > 0 ? allTripsView : undefined;
    return trips.find((trip) => trip.id === activeTripId) ?? trips[0];
  }, [activeTripId, allTripsView, trips]);
  const mediaCount = useMemo(() => activeTrip?.stops.reduce((total, stop) => total + stop.media.length, 0) ?? 0, [activeTrip]);
  const mapRoutes = useMemo(() => activeTripId === ALL_TRIPS_ID ? trips.map((trip) => trip.stops) : undefined, [activeTripId, trips]);
  const openStop = useCallback((stop: TravelStop) => setSelectedStop(stop), []);
  if (!activeTrip) return <main className={styles.loading}>正在打开旅途档案…</main>;
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}><Compass size={15} /> 私密旅行档案 · 共 {trips.length} 次旅行</p><h1>{activeTrip.title}</h1><p>{activeTrip.description}</p><div className={styles.tripStats}><span><Route size={15}/>{activeTrip.stops.length} 个站点</span><span><Images size={15}/>{mediaCount} 段影像</span></div></div><label className={styles.tripPicker}>当前旅行<select value={activeTrip.id} onChange={(event) => { setActiveTripId(event.target.value); setSelectedStop(null); }}><option value={ALL_TRIPS_ID}>全部旅行记录</option>{trips.map((trip) => <option value={trip.id} key={trip.id}>{trip.title} · {trip.stops.length} 站</option>)}</select><small>{activeTripId === ALL_TRIPS_ID ? '汇总显示所有旅行记录' : '每个选项是一条独立旅行记录'}</small></label></header>
    <section className={styles.mapSection}><TravelMap stops={activeTrip.stops} routes={mapRoutes} activeStopId={selectedStop?.id} onStopSelect={openStop} /></section>
    <section className={styles.stopsSection} aria-label="旅行站点"><div className={styles.sectionTitle}><h2>沿途停靠</h2><span>{activeTrip.stops.length} 站</span></div><div className={styles.stopList}>{activeTrip.stops.map((stop) => <button key={stop.id} type="button" onClick={() => openStop(stop)} className={styles.stopCard}><span className={styles.stopNumber}>{stop.order}</span><span><strong>{stop.name}</strong><small><MapPin size={14} /> {stop.media.length} 段影像</small><small className={styles.coordinates}>{stop.coordinates[0].toFixed(5)}, {stop.coordinates[1].toFixed(5)}</small></span><span className={styles.openHint}>查看回忆</span></button>)}</div></section>
    {selectedStop && <StationModal stop={selectedStop} onClose={() => setSelectedStop(null)} />}
  </main>;
}
