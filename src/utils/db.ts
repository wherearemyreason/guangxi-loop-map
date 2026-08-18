// IndexedDB utility for storing large assets like photos and audio files

import { createPhotoPreviewUrl } from '../features/media/photoPreview';
import { isHeifFile } from '../features/media/photoFile';

const DB_NAME = 'TravelDiaryDB';
const DB_VERSION = 2;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets'); // Key is the asset path or unique ID
      }
      if (!db.objectStoreNames.contains('visitors')) {
        db.createObjectStore('visitors', { keyPath: 'id', autoIncrement: true });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Custom Trips Operations ───────────────────────────────────

export function getCustomTrips<T = unknown>(): Promise<T[]> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('trips', 'readonly');
      const store = tx.objectStore('trips');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveCustomTrip(trip: unknown): Promise<void> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      store.put(trip);
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function deleteCustomTrip(tripId: string): Promise<void> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'assets'], 'readwrite');
      const tripStore = tx.objectStore('trips');
      const assetStore = tx.objectStore('assets');
      
      tripStore.delete(tripId);
      
      // We also want to delete all assets starting with the tripId prefix
      // We open a cursor on assets
      const request = assetStore.openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const key = cursor.primaryKey as string;
          // Custom media paths are stored as blob://db/{tripId}/..., so use
          // the same prefix here when removing a complete trip.
          if (key.startsWith(`blob://db/${tripId}/`)) {
            assetStore.delete(key);
          }
          cursor.continue();
        }
      };
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// ── Asset Blob Operations ────────────────────────────────────

export function saveAsset(path: string, blob: Blob): Promise<void> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      const store = tx.objectStore('assets');
      store.put(blob, path);
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function getAsset(path: string): Promise<Blob | null> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readonly');
      const store = tx.objectStore('assets');
      const request = store.get(path);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  });
}

export function deleteAsset(path: string): Promise<void> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      const store = tx.objectStore('assets');
      store.delete(path);
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function deleteAssetsByPrefix(prefix: string): Promise<void> {
  return initDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    const store = tx.objectStore('assets');
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const key = cursor.primaryKey;
      if (typeof key === 'string' && key.startsWith(prefix)) store.delete(key);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// Helper to convert Asset Path to Object URL
const assetUrlCache = new Map<string, string>();

export function getAssetUrl(path: string): Promise<string> {
  // Public HEIC files also need conversion because browsers cannot render them natively.
  if (!path.startsWith('blob://db/')) {
    if (!isHeifFile({ name: path, type: '' })) return Promise.resolve(path);
    if (assetUrlCache.has(path)) return Promise.resolve(assetUrlCache.get(path)!);
    return fetch(path).then(async (response) => {
      if (!response.ok) return path;
      const blob = await response.blob();
      const url = await createPhotoPreviewUrl(blob, path);
      assetUrlCache.set(path, url);
      return url;
    }).catch(() => path);
  }
  
  // Check memory cache
  if (assetUrlCache.has(path)) {
    return Promise.resolve(assetUrlCache.get(path)!);
  }
  
  return getAsset(path).then(async (blob) => {
    if (!blob) return '';
    const url = await createPhotoPreviewUrl(blob, path);
    assetUrlCache.set(path, url);
    return url;
  });
}

export function clearAssetUrlCache() {
  assetUrlCache.forEach((url) => URL.revokeObjectURL(url));
  assetUrlCache.clear();
}

// ── Visitor Logs Operations ───────────────────────────────────

export interface Visitor {
  id?: number;
  name: string;
  relationship: string;
  timestamp: number;
}

export function saveVisitor(visitor: Visitor): Promise<number> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('visitors', 'readwrite');
      const store = tx.objectStore('visitors');
      const addRequest = store.add(visitor);
      
      addRequest.onsuccess = () => {
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      };
      addRequest.onerror = () => reject(addRequest.error);
    });
  });
}

export function getVisitors(): Promise<Visitor[]> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains('visitors')) {
        resolve([]);
        return;
      }
      const tx = db.transaction('visitors', 'readonly');
      const store = tx.objectStore('visitors');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

export function getVisitorCount(): Promise<number> {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains('visitors')) {
        resolve(0);
        return;
      }
      const tx = db.transaction('visitors', 'readonly');
      const store = tx.objectStore('visitors');
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  });
}
