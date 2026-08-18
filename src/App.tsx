import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Compass, Images, LockKeyhole, LogOut, Settings2 } from 'lucide-react';
import { TravelPage } from './features/travel';
import { MomentsPage } from './features/moments/MomentsPage';
import { MomentDetail } from './features/moments/MomentDetail';
import { ManagePage } from './features/manage/ManagePage';
import { LoginPage } from './features/auth/LoginPage';
import { SetupPage } from './features/auth/SetupPage';
import { useAuth } from './features/auth/AuthProvider';
import './app.css';

function MomentDetailRoute() {
  const { momentId = '' } = useParams();
  const navigate = useNavigate();
  return <MomentDetail momentId={momentId} onBack={() => navigate('/moments')} />;
}

function MomentsRoute() {
  const navigate = useNavigate();
  return <MomentsPage onOpenMoment={(id) => navigate(`/moments/${id}`)} />;
}

export default function App() {
  const { configured, loading, user, role, displayName, signOut } = useAuth();
  if (!configured) return <SetupPage />;
  if (loading) return <main className="app-loading">正在验证访问权限…</main>;
  if (!user) return <LoginPage />;
  if (!role) return <main className="auth-page"><section className="auth-card setup-card"><p>OOOLJ.FUN</p><h1>账号尚未获邀</h1><span>该账号没有本站成员权限。请让空间所有者在 Supabase 中完成成员配置。</span><button type="button" onClick={() => void signOut()}>退出登录</button></section></main>;
  return <div className="app-frame">
    <header className="app-nav">
      <NavLink to="/travel" className="app-brand" aria-label="回忆站首页">
        <span className="brand-mark">O</span><span><b>ooolj.fun</b><small><LockKeyhole size={11}/> 两个人的私密回忆</small></span>
      </NavLink>
      <nav aria-label="主导航">
        <NavLink to="/travel"><Compass size={18}/><span>旅行地图</span></NavLink>
        <NavLink to="/moments"><Images size={18}/><span>朋友圈</span></NavLink>
        <NavLink to="/manage"><Settings2 size={18}/><span>管理回忆</span></NavLink>
      </nav>
      <div className="app-account"><span>{displayName || user.email} · {role === 'owner' ? '所有者' : '共同记录者'}</span><button type="button" onClick={() => void signOut()} aria-label="退出登录"><LogOut size={16}/></button></div>
    </header>
    <div className="app-content">
      <Routes>
        <Route path="/" element={<Navigate to="/travel" replace/>}/>
        <Route path="/travel" element={<TravelPage/>}/>
        <Route path="/moments" element={<MomentsRoute/>}/>
        <Route path="/moments/:momentId" element={<MomentDetailRoute/>}/>
        <Route path="/manage" element={<ManagePage/>}/>
        <Route path="*" element={<Navigate to="/travel" replace/>}/>
      </Routes>
    </div>
  </div>;
}
