// IndexedDB utility for storing large assets like photos and audio files

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

export function getCustomTrips(): Promise<any[]> {
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

export function saveCustomTrip(trip: any): Promise<void> {
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
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const key = cursor.primaryKey as string;
          if (key.startsWith(`${tripId}/`)) {
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

// Helper to convert Asset Path to Object URL
const assetUrlCache = new Map<string, string>();

export function getAssetUrl(path: string): Promise<string> {
  // If it's already a standard HTTP/relative path, return it directly
  if (!path.startsWith('blob://db/')) {
    return Promise.resolve(path);
  }
  
  // Check memory cache
  if (assetUrlCache.has(path)) {
    return Promise.resolve(assetUrlCache.get(path)!);
  }
  
  return getAsset(path).then((blob) => {
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
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
