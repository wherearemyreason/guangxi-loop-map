import { useState } from 'react';
import { Compass, Plus, Trash2, ChevronLeft, ChevronRight, Map } from 'lucide-react';
import type { Trip } from '../types';

interface TripSidebarProps {
  trips: Trip[];
  activeTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  onAddTripClick: () => void;
  onDeleteTrip: (tripId: string) => void;
}

export default function TripSidebar({
  trips,
  activeTripId,
  onSelectTrip,
  onAddTripClick,
  onDeleteTrip,
}: TripSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      {/* Collapse/Expand Toggle Button */}
      <button
        className={`sidebar-toggle glass ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? "收起列表" : "展开旅行列表"}
      >
        {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {/* Sidebar Panel */}
      <div className={`sidebar-container glass ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Compass className="logo-icon" size={22} />
            <h2>专属旅行回忆</h2>
          </div>
          <p className="subtitle">和你一起走过的每一段旅程</p>
        </div>

        <div className="trip-list">
          {trips.map((trip) => {
            const isActive = trip.id === activeTripId;
            const photoCount = trip.stations.reduce((sum, s) => sum + s.photos.length, 0);
            
            // Get cover image: first photo of first station, or fallback
            const coverImage = trip.stations[0]?.photos[0] || '';

            return (
              <div
                key={trip.id}
                className={`trip-card ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTrip(trip.id)}
              >
                {/* Trip Card Cover */}
                <div className="trip-cover">
                  {coverImage ? (
                    <img src={coverImage} alt={trip.title} />
                  ) : (
                    <div className="trip-cover-placeholder">
                      <Map size={24} />
                    </div>
                  )}
                  {trip.isCustom && (
                    <span className="custom-badge">本地</span>
                  )}
                </div>

                <div className="trip-info">
                  <h3>{trip.title}</h3>
                  <p className="desc">{trip.description}</p>
                  <div className="meta">
                    <span>📍 {trip.stations.length} 站</span>
                    <span>🖼️ {photoCount} 张照片</span>
                  </div>
                </div>

                {trip.isCustom && (
                  <button
                    className="delete-trip-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除旅行“${trip.title}”吗？`)) {
                        onDeleteTrip(trip.id);
                      }
                    }}
                    title="删除此旅行"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button className="add-trip-btn" onClick={onAddTripClick}>
          <Plus size={16} />
          <span>记录新的旅行</span>
        </button>
      </div>
    </>
  );
}
