import { supabase } from '../../../utils/supabase';
import { uploadPrivateMedia } from '../../media/mediaService';
import type { Trip } from '../../../types';

export async function createCloudTrip(input: { title: string; description: string; musicUrl?: string; stations: Array<{ name: string; description: string; coordinates: [number, number]; files: File[] }> }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('请先登录');
  const { data: trip, error } = await supabase.from('trips').insert({ title: input.title, description: input.description, created_by: auth.user.id }).select('id').single();
  if (error || !trip) throw error ?? new Error('旅行保存失败');
  const result: Trip = { id: trip.id, title: input.title, description: input.description, musicUrl: input.musicUrl ?? '', stations: [], isCustom: true };
  for (const [stationIndex, station] of input.stations.entries()) {
    const { data: stop, error: stopError } = await supabase.from('stops').insert({ trip_id: trip.id, title: station.name, introduction: station.description, longitude: station.coordinates[0], latitude: station.coordinates[1], sort_order: stationIndex, created_by: auth.user.id }).select('id').single();
    if (stopError || !stop) throw stopError ?? new Error('站点保存失败');
    const media = await Promise.all(station.files.map((file) => uploadPrivateMedia(file, file.type.startsWith('video/') ? 'video' : 'image')));
    if (media.length) {
      const { error: linkError } = await supabase.from('stop_media').insert(media.map((item, index) => ({ stop_id: stop.id, media_id: item.id, display_order: index })));
      if (linkError) throw linkError;
    }
    result.stations.push({ id: stationIndex + 1, name: station.name, folderName: station.name, coordinates: station.coordinates, photos: media.map((item) => `media://${item.id}`) });
  }
  return result;
}
