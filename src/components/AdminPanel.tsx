import React, { useState, useRef } from 'react';
import { X, Upload, Save, Loader2, Database } from 'lucide-react';
import { supabase } from '../utils/supabase';

interface AdminPanelProps {
  onClose: () => void;
  onDataUpdated: () => void;
}

export default function AdminPanel({ onClose, onDataUpdated }: AdminPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [stationName, setStationName] = useState('');
  const [lng, setLng] = useState('');
  const [lat, setLat] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check initial session
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSession(data.session);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSession(data.session);
        alert('注册成功！');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '认证失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos(Array.from(e.target.files));
    }
  };

  const handleSubmitStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stationName || !lng || !lat) {
      setErrorMsg('请填写完整的站点名称和经纬度');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const uploadedUrls: string[] = [];
      
      // Upload photos
      for (const file of photos) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${stationName}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('memories')
          .upload(filePath, file);
          
        if (uploadError) throw uploadError;
        
        const { data } = supabase.storage.from('memories').getPublicUrl(filePath);
        uploadedUrls.push(data.publicUrl);
      }

      // Insert to DB
      const { error: dbError } = await supabase.from('trips').insert({
        name: stationName,
        folder_name: stationName,
        lng: parseFloat(lng),
        lat: parseFloat(lat),
        photos: uploadedUrls
      });

      if (dbError) throw dbError;

      alert('站点与回忆上传成功！');
      onDataUpdated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
        >
          <X size={20} className="text-gray-600" />
        </button>

        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Database className="text-primary" /> 
          隐藏管理面板
        </h2>

        {errorMsg && (
          <div className="bg-red-100 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">
            {errorMsg}
          </div>
        )}

        {!session ? (
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱帐号</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition flex justify-center"
            >
              {loading ? <Loader2 className="animate-spin" /> : (isLogin ? '登录' : '注册管理员')}
            </button>
            <p className="text-center text-sm text-gray-500 mt-2">
              <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline">
                {isLogin ? '没有账号？点击注册' : '已有账号？点击登录'}
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmitStation} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新增回忆站点名称</label>
              <input 
                type="text" 
                required 
                value={stationName}
                onChange={e => setStationName(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                placeholder="例如：巴马长寿村"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">经度 (Lng)</label>
                <input 
                  type="number" 
                  step="any"
                  required 
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                  placeholder="107.xxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">纬度 (Lat)</label>
                <input 
                  type="number" 
                  step="any"
                  required 
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                  placeholder="24.xxx"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">上传现场照片</label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-gray-50 transition"
              >
                <Upload className="mx-auto text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">
                  {photos.length > 0 ? `已选择 ${photos.length} 张照片` : '点击选择照片文件'}
                </span>
              </div>
              <input 
                type="file" 
                multiple 
                accept="image/*,image/heic,image/heif,.heic,.heif" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary to-accent text-white rounded-xl font-medium shadow-lg hover:opacity-90 transition flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : <><Save size={18} /> 保存回忆并发布</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
