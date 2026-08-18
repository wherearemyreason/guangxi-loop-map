import { supabase } from '../../../utils/supabase';
import { getPrivateMediaUrl } from '../../media/mediaService';
import type { TravelMedia, TravelRepository, TravelStop, TravelTrip } from '../types';

type Relation = { id: string; kind: 'image' | 'video'; original_filename: string; thumbnail_object_key?: string | null };
type RawStop = { id: string; title: string; introduction?: string | null; latitude?: number | null; longitude?: number | null; sort_order: number; stop_media?: Array<{ display_order: number; media: Relation | null }> };
type RawTrip = { id: string; title: string; description?: string | null; stops?: RawStop[] };

function mediaUrl(media: Relation) { return `media://${media.id}`; }
function toMedia(media: Relation): TravelMedia { return { id: media.id, kind: media.kind === 'video' ? 'video' : 'image', url: mediaUrl(media), alt: media.original_filename }; }
function toTrip(raw: RawTrip): TravelTrip {
  const stops = [...(raw.stops ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((stop, index): TravelStop => ({
    id: stop.id, order: index + 1, name: stop.title, description: stop.introduction ?? '',
    coordinates: [stop.longitude ?? 108.387056, stop.latitude ?? 22.767789],
    media: (stop.stop_media ?? []).sort((a, b) => a.display_order - b.display_order).flatMap((item) => item.media ? [toMedia(item.media)] : []),
  }));
  return { id: raw.id, title: raw.title, description: raw.description ?? '', coverUrl: stops[0]?.media[0]?.url, stops };
}

export class CloudTravelRepository implements TravelRepository {
  async listTrips() {
    const { data, error } = await supabase.from('trips').select('id,title,description,stops(id,title,introduction,latitude,longitude,sort_order,stop_media(display_order,media(id,kind,original_filename,thumbnail_object_key)))').is('deleted_at', null).order('sort_order');
    if (error) throw error;
    return (data as unknown as RawTrip[]).map(toTrip);
  }
  async getTrip(id: string) { return (await this.listTrips()).find((trip) => trip.id === id) ?? null; }
}

export async function resolveTravelMedia(media: TravelMedia) {
  return media.url.startsWith('media://') ? getPrivateMediaUrl(media.id) : media.url;
}

export const cloudTravelRepository = new CloudTravelRepository();
