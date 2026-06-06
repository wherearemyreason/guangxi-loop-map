export interface Station {
  id: number;
  name: string;
  folderName: string;
  coordinates: [number, number];
  photos: string[];
}

export interface Trip {
  id: string;
  title: string;
  description: string;
  musicUrl: string;
  stations: Station[];
  isCustom?: boolean;
}
