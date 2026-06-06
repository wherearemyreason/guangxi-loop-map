import { useEffect, useState } from 'react';
import { getVisitors } from '../utils/db';
import type { Visitor } from '../utils/db';
import { X, Database } from 'lucide-react';

interface VisitorLogsModalProps {
  onClose: () => void;
}

export default function VisitorLogsModal({ onClose }: VisitorLogsModalProps) {
  const [logs, setLogs] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVisitors().then((data) => {
      // Sort by newest visitor first
      const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);
      setLogs(sorted);
      setLoading(false);
    }).catch(err => {
      console.error("Failed to read visitor logs:", err);
      setLoading(false);
    });
  }, []);

  // Calculate statistics
  const totalVisits = logs.length;
  const friendCount = logs.filter(l => l.relationship === '朋友').length;
  const familyCount = logs.filter(l => l.relationship === '家人').length;
  const strangerCount = logs.filter(l => l.relationship === '路人').length;

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  };

  const getFirstChar = (name: string) => {
    return name.trim().charAt(0).toUpperCase();
  };

  return (
    <div className="logs-modal-overlay" onClick={onClose}>
      <div className="logs-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="logs-header">
          <h3>
            <Database size={20} className="text-[#0ea5e9]" />
            <span>访客访问日志</span>
          </h3>
          <button className="close-logs-btn" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            <span>正在读取数据库...</span>
          </div>
        ) : (
          <>
            {/* Statistics Row */}
            <div className="logs-stats">
              <div className="stat-pill">
                <span className="stat-label">总访问量</span>
                <span className="stat-val">{totalVisits}</span>
              </div>
              <div className="stat-pill">
                <span className="stat-label">朋友 / 家人</span>
                <span className="stat-val text-emerald-500">
                  {friendCount} <span className="text-xs text-slate-400 font-normal">/</span> {familyCount}
                </span>
              </div>
              <div className="stat-pill">
                <span className="stat-label">路人</span>
                <span className="stat-val text-slate-500">{strangerCount}</span>
              </div>
            </div>

            {/* List */}
            <div className="logs-list">
              {logs.length === 0 ? (
                <div className="logs-empty">
                  <Database size={32} className="opacity-40" />
                  <span>暂无访客记录</span>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="log-item">
                    {/* Avatar */}
                    <div className={`log-avatar ${log.relationship}`}>
                      {getFirstChar(log.name)}
                    </div>

                    {/* Details */}
                    <div className="log-details">
                      <div className="log-name-row">
                        <span className="log-name">{log.name}</span>
                        <span className={`log-badge ${log.relationship}`}>
                          {log.relationship}
                        </span>
                      </div>
                      <span className="log-time">
                        访问时间: {formatDate(log.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
