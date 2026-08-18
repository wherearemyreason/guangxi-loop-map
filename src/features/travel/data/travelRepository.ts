import legacyTrips from '../../../tripsData.json';
import { getAssetUrl, getCustomTrips } from '../../../utils/db';
import type { TravelMedia, TravelRepository, TravelStop, TravelTrip } from '../types';
import { cloudTravelRepository } from './cloudTravelRepository';

type LegacyStation = {
  id: number;
  name: string;
  coordinates: [number, number];
  photos: string[];
};

type LegacyTrip = {
  id: string;
  title: string;
  description: string;
  stations: LegacyStation[];
};

const isVideo = (url: string) => /\.(mov|mp4|m4v|webm)$/i.test(url);

function toMedia(stop: LegacyStation): TravelMedia[] {
  return stop.photos.map((url, index) => ({
    id: `${stop.id}-${index}`,
    kind: isVideo(url) ? 'video' : 'image',
    url,
    alt: `${stop.name} · 影像 ${index + 1}`,
  }));
}

function toStop(stop: LegacyStation, index: number): TravelStop {
  const longitude = Number(stop.coordinates?.[0]);
  const latitude = Number(stop.coordinates?.[1]);
  const coordinates: [number, number] = Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : [108.387056, 22.767789];
  return {
    id: String(stop.id),
    order: index + 1,
    name: stop.name,
    description: `第 ${index + 1} 站 · ${stop.name}`,
    coordinates,
    media: toMedia(stop),
  };
}

function toTrip(trip: LegacyTrip): TravelTrip {
  const stops = [...trip.stations]
    .sort((a, b) => a.id - b.id)
    .map((stop, index) => ({ ...toStop(stop, index), id: `${trip.id}-stop-${stop.id}` }));
  return {
    id: trip.id,
    title: trip.title,
    description: trip.description,
    coverUrl: stops[0]?.media.find((media) => media.kind === 'image')?.url,
    stops,
  };
}

/**
 * Transitional data source. Its interface mirrors the future Supabase source,
 * so the page can move to private API data without a UI rewrite.
 */
export class LocalTravelRepository implements TravelRepository {
  private readonly trips = (legacyTrips as unknown as LegacyTrip[]).map(toTrip);

  async listTrips(): Promise<TravelTrip[]> {
    const custom = await getCustomTrips();
    const converted = await Promise.all((custom as LegacyTrip[]).map(async (trip) => {
      const mapped = toTrip(trip);
      mapped.stops = await Promise.all(mapped.stops.map(async (stop) => ({
        ...stop,
        media: await Promise.all(stop.media.map(async (media) => ({ ...media, url: await getAssetUrl(media.url) }))),
      })));
      return mapped;
    }));
    const records = new Map<string, TravelTrip>();
    for (const trip of [...this.trips, ...converted]) records.set(trip.id, trip);
    return [...records.values()];
  }

  async getTrip(id: string): Promise<TravelTrip | null> {
    return (await this.listTrips()).find((trip) => trip.id === id) ?? null;
  }
}

export const travelRepository: TravelRepository = import.meta.env.VITE_SUPABASE_URL ? cloudTravelRepository : new LocalTravelRepository();
