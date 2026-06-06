import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, MapPin, Music, Image as ImageIcon, Save, Download, HelpCircle } from 'lucide-react';
import type { Trip, Station } from '../types';
import { saveAsset, getAssetUrl } from '../utils/db';
import exifr from 'exifr';

// Pre-configured music library options
const DEFAULT_MUSIC_LIBRARY = [
  { name: "张震岳 - 小宇", url: "/张震岳 - 小宇.mp3" },
  { name: "许巍 - 旅行", url: "/许巍 - 旅行.mp3" },
  { name: "朴树 - 平凡之路", url: "/朴树 - 平凡之路.mp3" },
  { name: "赵雷 - 成都", url: "/赵雷 - 成都.mp3" },
  { name: "陈绮贞 - 旅行的意义", url: "/陈绮贞 - 旅行的意义.mp3" },
];

interface ExtendedStation extends Station {
  isGpsParsed?: boolean;
  isGpsFallback?: boolean;
}

interface AddTripModalProps {
  onClose: () => void;
  onSave: (trip: Trip) => void;
  allTrips: Trip[];
}

export default function AddTripModal({
  onClose,
  onSave,
  allTrips,
}: AddTripModalProps) {
  const [tripId] = useState(() => `custom-trip-${Date.now()}`);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Music Library State (loaded from localStorage if exists)
  const [musicLibrary, setMusicLibrary] = useState<{ name: string; url: string }[]>(() => {
    const saved = localStorage.getItem('music_library');
    return saved ? JSON.parse(saved) : DEFAULT_MUSIC_LIBRARY;
  });
  const [musicUrl, setMusicUrl] = useState(musicLibrary[0]?.url || '/张震岳 - 小宇.mp3');

  // Stations State
  const [stations, setStations] = useState<ExtendedStation[]>([
    { id: 1, name: '起点站', folderName: '1起点站', coordinates: [108.387056, 22.767789], photos: [] }
  ]);
  
  // Track photo previews
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});

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
    const url = prompt("请输入歌曲路径或云端链接 (如: /音乐文件名.mp3 或 HTTP 链接):");
    if (!url) return;

    const newSong = { name: name.trim(), url: url.trim() };
    const updated = [...musicLibrary, newSong];
    setMusicLibrary(updated);
    localStorage.setItem('music_library', JSON.stringify(updated));
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
        isGpsFallback: true // Flagged as fallback until photos with GPS are uploaded
      }
    ]);
  };

  // Remove a station
  const removeStation = (index: number) => {
    if (stations.length <= 1) {
      alert("旅行至少需要一个景点！");
      return;
    }
    const nextStations = stations.filter((_, i) => i !== index).map((s, i) => ({
      ...s,
      id: i + 1,
      folderName: `${i + 1}${s.name}`
    }));
    setStations(nextStations);
  };

  // Handle station details change
  const handleStationChange = (index: number, field: keyof Station, value: any) => {
    setStations((prev) => {
      const next = [...prev];
      if (field === 'name') {
        next[index] = {
          ...next[index],
          name: value,
          folderName: `${next[index].id}${value}`
        };
      } else {
        next[index] = {
          ...next[index],
          [field]: value
        };
      }
      return next;
    });
  };

  // Upload photo for a station & auto parse EXIF
  const handlePhotoUpload = async (stationIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadedPaths: string[] = [];
    let parsedCoords: [number, number] | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Automatically read GPS coordinate from the very first photo if not already resolved
      if (i === 0) {
        try {
          const gps = await exifr.gps(file);
          if (gps && gps.latitude && gps.longitude) {
            parsedCoords = [
              parseFloat(gps.longitude.toFixed(6)),
              parseFloat(gps.latitude.toFixed(6))
            ];
            console.log(`Parsed GPS for ${file.name}:`, parsedCoords);
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
        const previewUrl = URL.createObjectURL(file);
        setPhotoPreviews((prev) => ({ ...prev, [dbPath]: previewUrl }));
      } catch (err) {
        console.error(`Failed to save image ${file.name}:`, err);
      }
    }

    setStations((prev) => {
      const next = [...prev];
      let nextCoords = next[stationIndex].coordinates;
      let gpsParsed = false;
      let gpsFallback = false;

      if (parsedCoords) {
        nextCoords = parsedCoords;
        gpsParsed = true;
      } else {
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
        isGpsFallback: gpsParsed ? false : (gpsFallback && !next[stationIndex].isGpsParsed)
      };
      return next;
    });
  };

  // Add network photo URL
  const addWebPhoto = (stationIndex: number) => {
    const url = prompt("请输入网络图片链接 (例如: https://example.com/photo.jpg):");
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      alert("请输入以 http:// 或 https:// 开头的有效网址链接！");
      return;
    }
    setStations((prev) => {
      const next = [...prev];
      next[stationIndex] = {
        ...next[stationIndex],
        photos: [...next[stationIndex].photos, url.trim()]
      };
      return next;
    });
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
    const cleanStations = stations.map(({ isGpsParsed, isGpsFallback, ...rest }) => rest);

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
      stations: stations.map(({ isGpsParsed, isGpsFallback, ...rest }) => rest)
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
          <h2>添加专属旅行回忆</h2>
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
              <button className="add-station-btn" onClick={addStation}>
                <Plus size={14} />
                <span>添加景点</span>
              </button>
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

                  <div className="form-group-row">
                    {/* Station Name */}
                    <div className="form-group">
                      <label>景点名称</label>
                      <input
                        type="text"
                        placeholder="如: 大理古城"
                        value={station.name}
                        onChange={(e) => handleStationChange(index, 'name', e.target.value)}
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
                          color: station.photos.length === 0 
                            ? '#64748b' 
                            : station.isGpsParsed 
                            ? '#059669' 
                            : '#d97706',
                          borderColor: station.photos.length === 0 
                            ? 'rgba(100, 116, 139, 0.2)' 
                            : station.isGpsParsed 
                            ? 'rgba(5, 150, 105, 0.3)' 
                            : 'rgba(217, 119, 6, 0.3)',
                          background: station.photos.length === 0 
                            ? 'rgba(100, 116, 139, 0.04)' 
                            : station.isGpsParsed 
                            ? 'rgba(5, 150, 105, 0.04)' 
                            : 'rgba(217, 119, 6, 0.04)'
                        }}
                      >
                        <MapPin size={13} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {station.photos.length === 0
                            ? '请添加照片以提取 GPS 坐标'
                            : station.isGpsParsed
                            ? `已解析 GPS: [${station.coordinates[0].toFixed(5)}, ${station.coordinates[1].toFixed(5)}]`
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
                        accept="image/*"
                        multiple
                        id={`photo-upload-${station.id}`}
                        onChange={(e) => handlePhotoUpload(index, e)}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor={`photo-upload-${station.id}`} className="photo-upload-card">
                        <Plus size={20} />
                        <span>本地照片</span>
                      </label>
                      <button
                        type="button"
                        className="photo-upload-card"
                        style={{ borderStyle: 'solid', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}
                        onClick={() => addWebPhoto(index)}
                      >
                        <Plus size={20} />
                        <span>网络图片</span>
                      </button>

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
              <p>1. 系统将自动读取你上传该景点**第一张照片的 EXIF GPS 属性**来确定地图标记和驾驶动画路线。</p>
              <p>2. 如果照片不带定位（例如单反拍摄或被聊天工具压缩），系统将自动使用上一个景点的坐标进行微偏移，确保路线不中断。</p>
              <p>3. 添加完成后点击 **“导出 JSON 配置文件”** 覆盖项目中的 <code>tripsData.json</code> 即可永久固化。</p>
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
              <span>保存到浏览器</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
