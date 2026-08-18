import exifr from 'exifr';
import { isPhotoFile } from './photoFile';

export interface ClusteredPhoto {
  file: File;
  takenAt: number;
  latitude?: number;
  longitude?: number;
}

export interface PhotoCluster {
  id: string;
  label: string;
  photos: ClusteredPhoto[];
  coordinates?: [number, number];
  startedAt: number;
  radiusKm: number;
}

export interface PhotoClusteringOptions {
  radiusKm?: number;
  unlocatedTimeGapHours?: number;
}

const DEFAULT_RADIUS_KM = 5;
const DEFAULT_TIME_GAP_HOURS = 8;

function hasCoordinates(photo: ClusteredPhoto): photo is ClusteredPhoto & Required<Pick<ClusteredPhoto, 'latitude' | 'longitude'>> {
  return Number.isFinite(photo.latitude)
    && Number.isFinite(photo.longitude)
    && Math.abs(photo.latitude!) <= 90
    && Math.abs(photo.longitude!) <= 180;
}

function distanceInKm(a: ClusteredPhoto, b: ClusteredPhoto) {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return null;
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6371;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function readPhoto(file: File): Promise<ClusteredPhoto> {
  let takenAt = file.lastModified || Date.now();
  let latitude: number | undefined;
  let longitude: number | undefined;

  try {
    // Keep date filtering for speed, but read GPS through exifr.gps because
    // combining a date-only pick list with gps:true drops latitude/longitude.
    const [metadata, gps] = await Promise.all([
      exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] }).catch(() => undefined),
      exifr.gps(file).catch(() => undefined),
    ]);
    const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
    if (date instanceof Date && !Number.isNaN(date.getTime())) takenAt = date.getTime();
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      latitude = gps.latitude;
      longitude = gps.longitude;
    }
  } catch {
    // Missing EXIF is normal for screenshots and images compressed by chat apps.
  }

  return { file, takenAt, latitude, longitude };
}

function clusterCoordinates(photos: ClusteredPhoto[]): [number, number] | undefined {
  const located = photos.filter(hasCoordinates);
  if (!located.length) return undefined;
  const latitude = located.reduce((total, photo) => total + photo.latitude!, 0) / located.length;
  const longitude = located.reduce((total, photo) => total + photo.longitude!, 0) / located.length;
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

function distanceFromCoordinates(photo: ClusteredPhoto, coordinates: [number, number]) {
  return distanceInKm(photo, {
    file: photo.file,
    takenAt: photo.takenAt,
    longitude: coordinates[0],
    latitude: coordinates[1],
  });
}

function clusterRadius(photos: ClusteredPhoto[], center?: [number, number]) {
  if (!center) return 0;
  return Math.max(0, ...photos.map((photo) => distanceFromCoordinates(photo, center) ?? 0));
}

function canMergeGroups(first: ClusteredPhoto[], second: ClusteredPhoto[], radiusKm: number) {
  const merged = [...first, ...second];
  const center = clusterCoordinates(merged);
  return center != null && clusterRadius(merged, center) <= radiusKm;
}

function groupDistance(first: ClusteredPhoto[], second: ClusteredPhoto[]) {
  const firstCenter = clusterCoordinates(first);
  const secondCenter = clusterCoordinates(second);
  if (!firstCenter || !secondCenter) return Number.POSITIVE_INFINITY;
  return distanceInKm(
    { file: first[0].file, takenAt: first[0].takenAt, longitude: firstCenter[0], latitude: firstCenter[1] },
    { file: second[0].file, takenAt: second[0].takenAt, longitude: secondCenter[0], latitude: secondCenter[1] },
  ) ?? Number.POSITIVE_INFINITY;
}

function clusterLocatedPhotos(photos: ClusteredPhoto[], radiusKm: number) {
  const groups: ClusteredPhoto[][] = photos
    .filter(hasCoordinates)
    .sort((first, second) => first.latitude - second.latitude || first.longitude - second.longitude || first.takenAt - second.takenAt)
    .map((photo) => [photo]);

  while (true) {
    let closestPair: { firstIndex: number; secondIndex: number; distance: number } | undefined;
    for (let firstIndex = 0; firstIndex < groups.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1) {
        if (!canMergeGroups(groups[firstIndex], groups[secondIndex], radiusKm)) continue;
        const distance = groupDistance(groups[firstIndex], groups[secondIndex]);
        if (!closestPair || distance < closestPair.distance) {
          closestPair = { firstIndex, secondIndex, distance };
        }
      }
    }
    if (!closestPair) return groups;

    const merged = [...groups[closestPair.firstIndex], ...groups[closestPair.secondIndex]];
    groups.splice(closestPair.secondIndex, 1);
    groups.splice(closestPair.firstIndex, 1, merged);
  }
}

export async function clusterPhotoFiles(files: File[], options: PhotoClusteringOptions = {}): Promise<PhotoCluster[]> {
  const radiusKm = options.radiusKm ?? DEFAULT_RADIUS_KM;
  const timeGapMs = (options.unlocatedTimeGapHours ?? DEFAULT_TIME_GAP_HOURS) * 60 * 60 * 1000;
  const photos = (await Promise.all(files.filter(isPhotoFile).map(readPhoto)))
    .sort((a, b) => a.takenAt - b.takenAt);
  if (!photos.length) return [];

  const locatedGroups: ClusteredPhoto[][] = clusterLocatedPhotos(photos, radiusKm);
  const unlocated = photos.filter((photo) => !hasCoordinates(photo));

  const unlocatedGroups: ClusteredPhoto[][] = [];
  for (const photo of unlocated) {
    const nearestByTime = locatedGroups
      .map((group, index) => ({
        index,
        gap: Math.min(...group.map((locatedPhoto) => Math.abs(locatedPhoto.takenAt - photo.takenAt))),
      }))
      .sort((a, b) => a.gap - b.gap)[0];
    if (nearestByTime && nearestByTime.gap <= timeGapMs) {
      locatedGroups[nearestByTime.index].push(photo);
      continue;
    }
    const current = unlocatedGroups.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || photo.takenAt - previous.takenAt > timeGapMs) unlocatedGroups.push([photo]);
    else current.push(photo);
  }

  const groups = [...locatedGroups, ...unlocatedGroups]
    .map((group) => group.sort((a, b) => a.takenAt - b.takenAt))
    .sort((a, b) => a[0].takenAt - b[0].takenAt);

  return groups.map((group, index) => {
    const coordinates = clusterCoordinates(group);
    return {
    id: crypto.randomUUID(),
    label: `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(group[0].takenAt)} · 候选站点 ${index + 1}`,
    photos: group,
    coordinates,
    startedAt: group[0].takenAt,
    radiusKm: Number(clusterRadius(group, coordinates).toFixed(2)),
  };
  });
}
