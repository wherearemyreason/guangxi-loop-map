/** Public shape used by the travel UI. It deliberately does not expose storage keys. */
export type Coordinates = readonly [longitude: number, latitude: number];

export interface TravelMedia {
  id: string;
  kind: 'image' | 'video';
  /** A display-safe URL. Private storage URLs should be resolved by the service. */
  url: string;
  alt: string;
  posterUrl?: string;
  durationSeconds?: number;
}

export interface TravelStop {
  id: string;
  order: number;
  name: string;
  description: string;
  coordinates: Coordinates;
  media: TravelMedia[];
}

export interface TravelTrip {
  id: string;
  title: string;
  description: string;
  coverUrl?: string;
  stops: TravelStop[];
}

export interface TravelRepository {
  listTrips(): Promise<TravelTrip[]>;
  getTrip(id: string): Promise<TravelTrip | null>;
}
