import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, MapPin, Music, Image as ImageIcon, Save, Download, HelpCircle, Sparkles, LoaderCircle } from 'lucide-react';
import type { Trip, Station } from '../types';
import { saveAsset, getAssetUrl } from '../utils/db';
import exifr from 'exifr';
import { clusterPhotoFiles } from '../features/media/photoClustering';
import { findNearbyAttractions, searchLocationSuggestions, type LocationSuggestion, type NearbyAttraction } from '../features/media/nearbyAttractions';
import { isPhotoFile, PHOTO_ACCEPT } from '../features/media/photoFile';
import { createPhotoPreviewUrl } from '../features/media/photoPreview';

// Pre-configured music library options
const DEFAULT_MUSIC_LIBRARY = [
  { name: "倒带", url: "/music/蔡依林 - 倒带 .ogg" },
  { name: "张震岳 - 小宇", url: "/music/张震岳 - 小宇.mp3" },
  { name: "许巍 - 曾经的你", url: "/music/曾经的你.mp3" },
  { name: "许巍 - 旅行", url: "/许巍 - 旅行.mp3" },
  { name: "朴树 - 平凡之路", url: "/朴树 - 平凡之路.mp3" },
  { name: "赵雷 - 成都", url: "/赵雷 - 成都.mp3" },
  { name: "陈绮贞 - 旅行的意义", url: "/陈绮贞 - 旅行的意义.mp3" },
];

function hasSupportedAudioFormat(url: string) {
  try {
    const pathname = new URL(url, window.location.origin).pathname.toLowerCase();
    const extensionIndex = pathname.lastIndexOf('.');
    if (extensionIndex < 0) return true;
    const extension = pathname.slice(extensionIndex);
    return !extension || ['.mp3', '.ogg'].includes(extension);
  } catch {
    return false;
  }
}

function getMusicLibrary() {
  try {
    const saved = localStorage.getItem('music_library');
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return DEFAULT_MUSIC_LIBRARY;
    return [...DEFAULT_MUSIC_LIBRARY, ...parsed.filter((song: unknown) => {
      if (!song || typeof song !== 'object') return false;
      const candidate = song as { name?: unknown; url?: unknown };
      return typeof candidate.name === 'string' && typeof candidate.url === 'string'
        && Boolean(candidate.name.trim()) && Boolean(candidate.url.trim())
        && !DEFAULT_MUSIC_LIBRARY.some((defaultSong) => defaultSong.url === candidate.url);
    })];
  } catch {
    return DEFAULT_MUSIC_LIBRARY;
  }
}

interface ExtendedStation extends Station {
  isGpsParsed?: boolean;
  isGpsFallback?: boolean;
  locationPhotoCount?: number;
  locationRadiusKm?: number;
  nearbyAttractions?: NearbyAttraction[];
  locationQuery?: string;
}

function averageCoordinates(coordinates: [number, number][]): [number, number] | null {
  if (!coordinates.length) return null;
  const [longitude, latitude] = coordinates.reduce<[number, number]>(
    ([longitudeTotal, latitudeTotal], [currentLongitude, currentLatitude]) => [
      longitudeTotal + currentLongitude,
      latitudeTotal + currentLatitude,
    ],
    [0, 0],
  );
  return [Number((longitude / coordinates.length).toFixed(6)), Number((latitude / coordinates.length).toFixed(6))];
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
}

interface AddTripModalProps {
  onClose: () => void;
  onSave: (trip: Trip) => void;
  allTrips: Trip[];
  initialTrip?: Trip;
}

export default function AddTripModal({
  onClose,
  onSave,
  allTrips,
  initialTrip,
}: AddTripModalProps) {
  const [tripId] = useState(() => initialTrip?.id ?? `custom-trip-${Date.now()}`);
  const [title, setTitle] = useState(initialTrip?.title ?? '');
  const [description, setDescription] = useState(initialTrip?.description ?? '');
  
  // Music Library State (loaded from localStorage if exists)
  const [musicLibrary, setMusicLibrary] = useState<{ name: string; url: string }[]>(() => {
    return getMusicLibrary();
  });
  const [musicUrl, setMusicUrl] = useState(initialTrip?.musicUrl || musicLibrary[0]?.url || '/music/蔡依林 - 倒带 .ogg');

  // Stations State
  const [stations, setStations] = useState<ExtendedStation[]>(() => initialTrip?.stations.map((station) => ({ ...station })) ?? [
    { id: 1, name: '起点站', folderName: '1起点站', coordinates: [108.387056, 22.767789], photos: [], locationQuery: '' }
  ]);
  const [locationSuggestions, setLocationSuggestions] = useState<Record<number, LocationSuggestion[]>>({});
  const [locationSearching, setLocationSearching] = useState<Record<number, boolean>>({});
  const locationRequestIds = useRef<Record<number, number>>({});
  
  // Track photo previews
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [clustering, setClustering] = useState(false);
  const [clusterSummary, setClusterSummary] = useState('');
  const [clusterRadiusKm, setClusterRadiusKm] = useState(5);

  // Search each station's place query after the user pauses typing.
  const locationSearchKey = stations.map((station) => `${station.id}:${station.locationQuery ?? ''}`).join('|');
  useEffect(() => {
    const timers = stations.map((station) => {
      const query = station.locationQuery?.trim() ?? '';
      const requestId = (locationRequestIds.current[station.id] ?? 0) + 1;
      locationRequestIds.current[station.id] = requestId;
      if (query.length < 2) {
        setLocationSearching((current) => current[station.id] ? { ...current, [station.id]: false } : current);
        setLocationSuggestions((current) => current[station.id]?.length ? { ...current, [station.id]: [] } : current);
        return undefined;
      }
      setLocationSearching((current) => ({ ...current, [station.id]: true }));
      return window.setTimeout(() => {
        void searchLocationSuggestions(query).then((suggestions) => {
          if (locationRequestIds.current[station.id] !== requestId) return;
          setLocationSuggestions((current) => ({ ...current, [station.id]: suggestions }));
        }).finally(() => {
          if (locationRequestIds.current[station.id] !== requestId) return;
          setLocationSearching((current) => ({ ...current, [station.id]: false }));
        });
      }, 320);
    });
    return () => timers.forEach((timer) => { if (timer) window.clearTimeout(timer); });
    // locationSearchKey changes only when a station's query or station list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSearchKey]);

  // Load previews for existing blob photos
  useEffect(() => {
    stations.forEach((station) => {
      station.photos.forEach((photo) => {
        if (photo.startsWith('blob://db/') && !photoPreviews[photo]) {
          getAssetUrl(photo).then((url) => {
            setPhotoPreviews((prev) => ({ ...prev, [photo]: url }));
          });
        }
      });
    });
  }, [stations, photoPreviews]);

  // Add a new song to the library list
  const handleAddNewMusic = () => {
    const name = prompt("请输入新歌曲名称 (如: 许巍 - 蓝莲花):");
    if (!name) return;
    const url = prompt("请输入 MP3 或 OGG 歌曲路径或云端链接 (如: /music/歌曲名.mp3):");
    if (!url) return;
    if (!hasSupportedAudioFormat(url.trim())) {
      alert('歌曲格式不支持，请使用 .mp3 或 .ogg 文件');
      return;
    }

    const newSong = { name: name.trim(), url: url.trim() };
    const updated = [...musicLibrary, newSong];
    setMusicLibrary(updated);
    localStorage.setItem('music_library', JSON.stringify(updated));
    window.dispatchEvent(new Event('music-library-updated'));
    setMusicUrl(newSong.url); // Auto-select the newly added song
  };

  // Add a new station
  const addStation = () => {
    const nextId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
    const lastCoords = stations[stations.length - 1]?.coordinates || [108.387056, 22.767789];
    
    setStations([
      ...stations,
      {
        id: nextId,
        name: `第 ${nextId} 站`,
        folderName: `${nextId}第 ${nextId} 站`,
        // Default coordinates are slightly offset from the last station
        coordinates: [
          parseFloat((lastCoords[0] + 0.015).toFixed(6)),
          parseFloat((lastCoords[1] + 0.015).toFixed(6))
        ],
        photos: [],
        isGpsFallback: true, // Flagged as fallback until photos with GPS are uploaded
        locationQuery: ''
      }
    ]);
  };

  // Remove a station
  const removeStation = (index: number) => {
    if (stations.length <= 1) {
      alert("旅行至少需要一个景点！");
      return;
    }
    stations.forEach((station) => {
      locationRequestIds.current[station.id] = (locationRequestIds.current[station.id] ?? 0) + 1;
    });
    const nextStations = stations.filter((_, i) => i !== index).map((s, i) => ({
      ...s,
      id: i + 1,
      folderName: `${i + 1}${s.name}`
    }));
    setStations(nextStations);
    setLocationSuggestions({});
    setLocationSearching({});
  };

  // Handle station details change
  const handleStationNameChange = (index: number, value: string) => {
    setStations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: value, folderName: `${next[index].id}${value}` };
      return next;
    });
  };

  const handleLocationQueryChange = (index: number, value: string) => {
    const stationId = stations[index]?.id;
    if (stationId != null) locationRequestIds.current[stationId] = (locationRequestIds.current[stationId] ?? 0) + 1;
    setStations((prev) => prev.map((station, stationIndex) => stationIndex === index
      ? { ...station, locationQuery: value }
      : station));
  };

  const chooseLocationSuggestion = (stationIndex: number, suggestion: LocationSuggestion) => {
    const stationId = stations[stationIndex]?.id;
    if (stationId != null) locationRequestIds.current[stationId] = (locationRequestIds.current[stationId] ?? 0) + 1;
    setStations((current) => current.map((station, index) => index === stationIndex
      ? {
        ...station,
        name: suggestion.name,
        folderName: `${station.id}${suggestion.name}`,
        locationQuery: suggestion.name,
        coordinates: suggestion.coordinates,
        isGpsParsed: true,
        isGpsFallback: false,
      }
      : station));
    setLocationSuggestions((current) => ({ ...current, [stations[stationIndex].id]: [] }));
  };

  // Upload photo for a station & auto parse EXIF
  const handlePhotoUpload = async (stationIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadedPaths: string[] = [];
    const parsedCoordinates: [number, number][] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (isPhotoFile(file)) {
        try {
          const gps = await exifr.gps(file);
          if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)
            && Math.abs(gps.latitude) <= 90 && Math.abs(gps.longitude) <= 180) {
            parsedCoordinates.push([
              parseFloat(gps.longitude.toFixed(6)),
              parseFloat(gps.latitude.toFixed(6)),
            ]);
          }
        } catch (err) {
          console.error("Failed to parse GPS from image EXIF:", err);
        }
      }

      const timestamp = Date.now();
      const dbPath = `blob://db/${tripId}/station-${stations[stationIndex].id}/photo-${timestamp}-${i}-${file.name}`;
      
      try {
        await saveAsset(dbPath, file);
        uploadedPaths.push(dbPath);
        
        // Generate Object URL for preview
        const previewUrl = await createPhotoPreviewUrl(file, file.name);
        setPhotoPreviews((prev) => ({ ...prev, [dbPath]: previewUrl }));
      } catch (err) {
        console.error(`Failed to save image ${file.name}:`, err);
      }
    }

    const parsedCoords = averageCoordinates(parsedCoordinates);

    setStations((prev) => {
      const next = [...prev];
      let nextCoords = next[stationIndex].coordinates;
      let gpsParsed = false;
      let gpsFallback = false;

      if (parsedCoords) {
        nextCoords = parsedCoords;
        gpsParsed = true;
      } else if (!next[stationIndex].isGpsParsed) {
        // Fallback coordinate generation
        gpsFallback = true;
        if (stationIndex > 0) {
          const prevCoords = next[stationIndex - 1].coordinates;
          nextCoords = [
            parseFloat((prevCoords[0] + 0.012).toFixed(6)),
            parseFloat((prevCoords[1] + 0.012).toFixed(6))
          ];
        }
      }

      next[stationIndex] = {
        ...next[stationIndex],
        coordinates: nextCoords,
        photos: [...next[stationIndex].photos, ...uploadedPaths],
        isGpsParsed: gpsParsed || next[stationIndex].isGpsParsed,
        isGpsFallback: gpsParsed ? false : (gpsFallback && !next[stationIndex].isGpsParsed),
        locationPhotoCount: gpsParsed ? parsedCoordinates.length : next[stationIndex].locationPhotoCount,
      };
      return next;
    });
  };

  const handleClusterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(isPhotoFile);
    e.target.value = '';
    if (!files.length) return;
    setClustering(true);
    setClusterSummary(`正在读取 ${files.length} 张照片的拍摄时间和 GPS…`);

    try {
      const clusters = await clusterPhotoFiles(files, { radiusKm: clusterRadiusKm });
      setClusterSummary(`已按照片间距离分组，正在为 ${clusters.filter((cluster) => cluster.coordinates).length} 个定位集合查找周边景区…`);
      const attractionGroups = await Promise.all(
        clusters.map((cluster) => cluster.coordinates ? findNearbyAttractions(cluster.coordinates) : Promise.resolve([])),
      );
      const generated: ExtendedStation[] = [];
      let fallbackCoordinates: [number, number] = stations.at(-1)?.coordinates ?? [108.387056, 22.767789];

      for (const [clusterIndex, cluster] of clusters.entries()) {
        const paths: string[] = [];
        for (const [photoIndex, photo] of cluster.photos.entries()) {
          const path = `blob://db/${tripId}/cluster-${cluster.id}/photo-${photoIndex}-${photo.file.name}`;
          try {
            await saveAsset(path, photo.file);
            paths.push(path);
            const previewUrl = await createPhotoPreviewUrl(photo.file, photo.file.name);
            setPhotoPreviews((current) => ({ ...current, [path]: previewUrl }));
          } catch (error) {
            console.error(`Failed to import photo ${photo.file.name}:`, error);
          }
        }
        if (!paths.length) continue;
        const coordinates = cluster.coordinates ?? [
          Number((fallbackCoordinates[0] + 0.012).toFixed(6)),
          Number((fallbackCoordinates[1] + 0.012).toFixed(6)),
        ] as [number, number];
        fallbackCoordinates = coordinates;
        generated.push({
          id: clusterIndex + 1,
          name: cluster.label,
          folderName: `${clusterIndex + 1}${cluster.label}`,
          coordinates,
          photos: paths,
          isGpsParsed: Boolean(cluster.coordinates),
          isGpsFallback: !cluster.coordinates,
          locationPhotoCount: cluster.coordinates
            ? cluster.photos.filter((photo) => photo.latitude != null && photo.longitude != null).length
            : undefined,
          locationRadiusKm: cluster.radiusKm,
          nearbyAttractions: attractionGroups[clusterIndex],
        });
      }

      setStations((current) => {
        const shouldReplaceStarter = current.length === 1 && current[0].photos.length === 0 && current[0].name === '起点站';
        const combined = shouldReplaceStarter ? generated : [...current, ...generated];
        return combined.map((station, index) => ({ ...station, id: index + 1, folderName: `${index + 1}${station.name}` }));
      });
      stations.forEach((station) => {
        locationRequestIds.current[station.id] = (locationRequestIds.current[station.id] ?? 0) + 1;
      });
      setLocationSuggestions({});
      setLocationSearching({});
      const locatedCount = clusters.filter((cluster) => cluster.coordinates).length;
      const attractionCount = attractionGroups.reduce((total, attractions) => total + attractions.length, 0);
      setClusterSummary(`已将 ${files.length} 张照片按距离整理为 ${clusters.length} 个候选站点；${locatedCount} 个站点使用组内 GPS 平均坐标，已提供 ${attractionCount} 个周边景区选项。`);
    } catch (error) {
      console.error('Failed to cluster photos:', error);
      setClusterSummary('照片整理失败，请稍后重试，或按站点分别上传。');
    } finally {
      setClustering(false);
    }
  };

  const chooseNearbyAttraction = (stationIndex: number, attraction: NearbyAttraction) => {
    setStations((current) => current.map((station, index) => index === stationIndex
      ? { ...station, name: attraction.name, folderName: `${station.id}${attraction.name}` }
      : station));
  };

  // Remove photo from station
  const removePhoto = (stationIndex: number, photoPath: string) => {
    setStations((prev) => {
      const next = [...prev];
      next[stationIndex] = {
        ...next[stationIndex],
        photos: next[stationIndex].photos.filter((p) => p !== photoPath)
      };
      return next;
    });
  };

  // Save trip to database / state
  const handleSave = () => {
    if (!title.trim()) {
      alert("请输入旅行标题！");
      return;
    }

    // Prepare clean list of stations
    const cleanStations: Station[] = stations.map((station) => ({ id: station.id, name: station.name, folderName: station.folderName, coordinates: station.coordinates, photos: station.photos }));

    const newTrip: Trip = {
      id: tripId,
      title: title.trim(),
      description: description.trim() || `${stations.length} 站 · 专属旅行回忆`,
      musicUrl,
      stations: cleanStations,
      isCustom: true
    };

    onSave(newTrip);
  };

  // Export static configuration JSON file
  const handleExport = () => {
    const customTrip: Trip = {
      id: tripId,
      title: title.trim() || '未命名旅行',
      description: description.trim() || `${stations.length} 站 · 自驾旅途回忆`,
      musicUrl,
      stations: stations.map((station) => ({ id: station.id, name: station.name, folderName: station.folderName, coordinates: station.coordinates, photos: station.photos }))
    };

    const cleanStaticTrips = allTrips.filter((t) => !t.isCustom);
    const exportData = [...cleanStaticTrips, customTrip];

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "tripsData.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card add-trip-card glass" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>{initialTrip ? '编辑旅行记录' : '新增一条旅行记录'}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="modal-body">
          {/* Section 1: Trip Info */}
          <div className="form-section">
            <h3 className="section-title">🗺️ 旅行基本信息</h3>
            <div className="form-group-row">
              <div className="form-group">
                <label>旅行标题 *</label>
                <input
                  type="text"
                  placeholder="如: 云南大理蜜月行"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>旅行简介</label>
                <input
                  type="text"
                  placeholder="如: 7 站 · 风花雪月浪漫之旅"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Background Music Repository Selector */}
            <div className="form-group">
              <label className="flex items-center gap-1">
                <Music size={14} />
                <span>旅行专属背景音乐</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={musicUrl}
                  onChange={(e) => setMusicUrl(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    outline: 'none'
                  }}
                >
                  {musicLibrary.map((song, sIdx) => (
                    <option key={sIdx} value={song.url}>
                      {song.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddNewMusic}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-primary)',
                    color: 'var(--color-primary)',
                    background: 'transparent',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  新增歌曲
                </button>
              </div>
            </div>

          </div>

          {/* Section 2: Stations */}
          <div className="form-section">
            <div className="flex justify-between items-center mb-3">
              <h3 className="section-title m-0">📍 路线景点列表 ({stations.length})</h3>
              <button type="button" className="add-station-btn" onClick={addStation}>
                <Plus size={14} />
                <span>手动添加站点</span>
              </button>
            </div>

            <div className="cluster-import-panel">
              <div className="cluster-import-copy"><Sparkles size={19}/><div><b>将整批照片收纳进这次旅行</b><span>支持 iPhone HEIC/HEIF；全部照片按 GPS 距离分组，每组用有效 GPS 的平均值定位。</span></div></div>
              <label className="cluster-radius-field">站点范围<select value={clusterRadiusKm} disabled={clustering} onChange={(event) => setClusterRadiusKm(Number(event.target.value))}><option value={1}>1 km · 紧凑景区</option><option value={3}>3 km · 城区景点</option><option value={5}>5 km · 推荐</option><option value={10}>10 km · 郊区范围</option><option value={20}>20 km · 大范围</option></select></label>
              <label className={clustering ? 'cluster-import-button disabled' : 'cluster-import-button'}>
                {clustering ? <LoaderCircle className="spin" size={17}/> : <ImageIcon size={17}/>} {clustering ? '正在整理' : '选择整批照片'}
                <input type="file" accept={PHOTO_ACCEPT} multiple disabled={clustering} onChange={handleClusterUpload}/>
              </label>
              {clusterSummary && <p className="cluster-summary" role="status">{clusterSummary}</p>}
            </div>

            <div className="stations-list-form">
              {stations.map((station, index) => (
                <div key={station.id} className="station-form-card glass">
                  <div className="station-card-header">
                    <h4>第 {index + 1} 站</h4>
                    <button
                      className="delete-station-btn"
                      onClick={() => removeStation(index)}
                      title="删除此站"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {station.nearbyAttractions && (
                    <div className="nearby-attractions">
                      <div className="nearby-attractions-heading">
                        <MapPin size={14} />
                        <span>周边景区建议</span>
                        {station.locationPhotoCount && <small>{station.locationPhotoCount} 张 GPS 照片均值 · 覆盖半径 {formatDistance(station.locationRadiusKm ?? 0)}</small>}
                      </div>
                      {station.nearbyAttractions.length > 0 ? (
                        <div className="nearby-attraction-options">
                          {station.nearbyAttractions.map((attraction) => (
                            <button
                              type="button"
                              key={attraction.id}
                              className={station.name === attraction.name ? 'nearby-attraction-option selected' : 'nearby-attraction-option'}
                              onClick={() => chooseNearbyAttraction(index, attraction)}
                              title={attraction.address}
                            >
                              <span>{attraction.name}</span>
                              <small>距中心 {formatDistance(attraction.distanceKm)}</small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="nearby-attractions-empty">未查到周边景区；你仍可手动填写站点名称。</p>
                      )}
                    </div>
                  )}

                  <div className="location-picker form-group">
                    <label className="flex items-center gap-1" htmlFor={`location-query-${station.id}`}>
                      <MapPin size={14} />
                      <span>输入地点名定位</span>
                    </label>
                    <div className="location-search-input">
                      <input
                        id={`location-query-${station.id}`}
                        type="text"
                        placeholder="例如：德天瀑布、阳朔西街"
                        value={station.locationQuery ?? ''}
                        onChange={(event) => handleLocationQueryChange(index, event.target.value)}
                        autoComplete="off"
                      />
                      {locationSearching[station.id] && <LoaderCircle className="spin" size={15} aria-label="正在搜索" />}
                    </div>
                    {locationSuggestions[station.id]?.length ? (
                      <div className="location-suggestions" role="listbox" aria-label={`${station.name}地点候选`}>
                        {locationSuggestions[station.id].map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion.id}
                            role="option"
                            className="location-suggestion"
                            onClick={() => chooseLocationSuggestion(index, suggestion)}
                          >
                            <MapPin size={14} />
                            <span><b>{suggestion.name}</b><small>{suggestion.address ?? '地图地点'}</small></span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {(station.locationQuery?.trim().length ?? 0) >= 2 && !locationSearching[station.id] && locationSuggestions[station.id] && locationSuggestions[station.id].length === 0 && (
                      <p className="location-empty" role="status">暂无匹配地点，请换个关键词试试。</p>
                    )}
                    <small className="location-picker-hint">选择候选地点后会写入坐标，下面的站点名称仍可自定义。</small>
                  </div>

                  <div className="form-group-row">
                    {/* Station Name */}
                    <div className="form-group">
                      <label>景点名称</label>
                      <input
                        type="text"
                        placeholder="如: 大理古城"
                        value={station.name}
                        onChange={(e) => handleStationNameChange(index, e.target.value)}
                      />
                    </div>

                    {/* GPS Coordinates Resolution Banner */}
                    <div className="form-group">
                      <label>GPS 地理坐标点</label>
                      <div
                        style={{
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid',
                          height: '38px',
                          color: station.isGpsParsed
                            ? '#059669' 
                            : station.photos.length === 0
                            ? '#64748b'
                            : '#d97706',
                          borderColor: station.isGpsParsed
                            ? 'rgba(5, 150, 105, 0.3)' 
                            : station.photos.length === 0
                            ? 'rgba(100, 116, 139, 0.2)'
                            : 'rgba(217, 119, 6, 0.3)',
                          background: station.isGpsParsed
                            ? 'rgba(5, 150, 105, 0.04)' 
                            : station.photos.length === 0
                            ? 'rgba(100, 116, 139, 0.04)'
                            : 'rgba(217, 119, 6, 0.04)'
                        }}
                      >
                        <MapPin size={13} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {station.isGpsParsed
                            ? `已解析 GPS: [${station.coordinates[0].toFixed(5)}, ${station.coordinates[1].toFixed(5)}]`
                            : station.photos.length === 0
                            ? '输入地点名并选择候选，或添加照片提取 GPS'
                            : `无 GPS (已估算坐标: [${station.coordinates[0].toFixed(4)}, ${station.coordinates[1].toFixed(4)}])`
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="form-group mt-2">
                    <label className="flex items-center gap-1">
                      <ImageIcon size={14} />
                      <span>上传回忆照片 ({station.photos.length})</span>
                    </label>
                    <div className="photo-upload-container">
                      <input
                        type="file"
                        accept={`${PHOTO_ACCEPT},video/*`}
                        multiple
                        id={`photo-upload-${station.id}`}
                        onChange={(e) => handlePhotoUpload(index, e)}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor={`photo-upload-${station.id}`} className="photo-upload-card">
                        <Plus size={20} />
                        <span>照片/视频</span>
                      </label>
                      {/* Photo Previews */}
                      {station.photos.map((photoPath, pIdx) => {
                        const preview = photoPath.startsWith('blob://db/') ? photoPreviews[photoPath] : photoPath;
                        return (
                          <div key={pIdx} className="uploaded-photo-preview">
                            {preview ? (
                              <img src={preview} alt="preview" />
                            ) : (
                              <div className="img-loading">加载中...</div>
                            )}
                            <button
                              className="photo-remove-btn"
                              onClick={() => removePhoto(index, photoPath)}
                              title="移除照片"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Guide Note */}
          <div className="form-guide-note glass">
            <HelpCircle size={16} />
            <div>
              <p className="title">💡 景点坐标提取规则</p>
              <p>1. 一次保存只生成一条旅行记录；自动聚类生成的是这条旅行内部的多个站点。</p>
              <p>2. 每个站点的坐标取该集合内全部有效 GPS 的平均值；超过所选范围的异常或远距离照片会拆分为独立集合。</p>
              <p>3. 手动添加站点时输入地点名并选择地图候选即可定位；站点名称和照片分类仍可在保存前继续修改。</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary flex items-center gap-1" onClick={handleExport}>
            <Download size={16} />
            <span>导出 JSON 配置文件</span>
          </button>
          
          <div className="flex gap-2">
            <button className="btn-cancel" onClick={onClose}>取消</button>
            <button className="btn-primary flex items-center gap-1" onClick={handleSave}>
              <Save size={16} />
              <span>{initialTrip ? '保存修改' : '保存到浏览器'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
