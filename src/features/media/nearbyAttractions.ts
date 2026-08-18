export interface NearbyAttraction {
  id: string;
  name: string;
  address?: string;
  distanceKm: number;
}

interface MapboxFeature {
  id?: string;
  text?: string;
  place_name?: string;
  center?: unknown;
  properties?: { address?: string };
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

const MAX_SUGGESTIONS = 6;

export interface LocationSuggestion {
  id: string;
  name: string;
  address?: string;
  coordinates: [number, number];
}

function isCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function distanceInKm([longitudeA, latitudeA]: [number, number], [longitudeB, latitudeB]: [number, number]) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export async function findNearbyAttractions(coordinates: [number, number]): Promise<NearbyAttraction[]> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token) return [];

  const [longitude, latitude] = coordinates;
  const params = new URLSearchParams({
    types: 'poi',
    limit: '10',
    language: 'zh-CN',
    access_token: token,
  });

  try {
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?${params}`);
    if (!response.ok) return [];
    const data = await response.json() as MapboxResponse;
    const seenNames = new Set<string>();
    return (data.features ?? [])
      .flatMap((feature) => {
        const name = feature.text?.trim();
        if (!name || !isCoordinates(feature.center) || seenNames.has(name)) return [];
        seenNames.add(name);
        return [{
          id: feature.id ?? `${name}-${feature.center.join(',')}`,
          name,
          address: feature.properties?.address ?? feature.place_name,
          distanceKm: distanceInKm(coordinates, feature.center),
        }];
      })
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .slice(0, MAX_SUGGESTIONS);
  } catch {
    return [];
  }
}

/** Search a user-entered place name and return selectable map coordinates. */
export async function searchLocationSuggestions(query: string): Promise<LocationSuggestion[]> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const normalizedQuery = query.trim();
  if (!token || normalizedQuery.length < 2) return [];

  const params = new URLSearchParams({
    autocomplete: 'true',
    limit: String(MAX_SUGGESTIONS),
    language: 'zh-CN',
    types: 'poi,address,place,locality,neighborhood',
    access_token: token,
  });

  try {
    const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalizedQuery)}.json?${params}`);
    if (!response.ok) return [];
    const data = await response.json() as MapboxResponse;
    const seen = new Set<string>();
    return (data.features ?? []).flatMap((feature) => {
      if (!isCoordinates(feature.center)) return [];
      const name = feature.text?.trim() || feature.place_name?.split(',')[0]?.trim();
      if (!name || seen.has(name)) return [];
      seen.add(name);
      return [{
        id: feature.id ?? `${name}-${feature.center.join(',')}`,
        name,
        address: feature.place_name,
        coordinates: [feature.center[0], feature.center[1]],
      }];
    });
  } catch {
    return [];
  }
}
