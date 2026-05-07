import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import UploadImage from './pages/UploadImage';
import Overview from './pages/Overview';
import Settings from './pages/Settings';
import LandingPage from './pages/LandingPage';
import AudioStudio from './pages/AudioStudio';
import AudioLibrary from './pages/AudioLibrary';
import { PollProvider } from './context/PollContext';
import { BulkUploadProvider, useBulkUpload } from './context/BulkUploadContext';
import DiscordCallback from './pages/DiscordCallback';
import { 
  LayoutDashboard, 
  Music, 
  Image as ImageIcon, 
  Settings as SettingsIcon, 
  LogOut, 
  ArrowLeft, 
  ChevronRight, 
  Sparkles, 
  ListMusic, 
  Loader2, 
  MessageSquare,
  Menu,
  X as CloseIcon
} from 'lucide-react';

// --- Components ---

const Sidebar = ({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) => {
  const loc = useLocation();
  const { bulkQueue, isBulkProcessing } = useBulkUpload();
  const logout = () => {
    localStorage.removeItem('disperser_key');
    localStorage.removeItem('disperser_user_id');
    localStorage.removeItem('disperser_user');
    window.location.href = '/';
  };

  const menuItems = [
    { name: 'Overview', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Audio Studio', path: '/dashboard/studio', icon: <Sparkles size={20} /> },
    { name: 'Audio Library', path: '/dashboard/library', icon: <ListMusic size={20} /> },
    { name: 'Upload Image', path: '/dashboard/image', icon: <ImageIcon size={20} /> },
    { name: 'Settings', path: '/dashboard/settings', icon: <SettingsIcon size={20} /> },
  ];

  const user = JSON.parse(localStorage.getItem('disperser_user') || '{}');

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="logo flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Music size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Disperser
          </span>
        </div>
        <button 
          className="lg:hidden p-2 text-slate-400 hover:text-white"
          onClick={() => setOpen(false)}
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {/* User Profile Section in Sidebar */}
      <div className="px-2 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden border border-slate-700">
            {user.avatar ? (
              <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`} alt="avatar" />
            ) : (
              <MessageSquare size={18} className="text-indigo-400" />
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-bold text-white truncate">{user.username || 'Creator'}</div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 mt-0">
        {menuItems.map((item) => {
          const isActive = loc.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setOpen(false)}
              className={`nav-link relative flex items-center justify-between group ${isActive ? 'active' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-cyan-400'} transition-colors`}>
                  {item.icon}
                </span>
                <span className="font-medium text-sm">{item.name}</span>
              </div>
              {isActive && <ChevronRight size={14} className="text-white opacity-50" />}
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-slate-800 space-y-4">
        {bulkQueue.length > 0 && (
          <div className="px-2 py-3 bg-slate-900/50 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bulk Status</span>
              {isBulkProcessing && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
            </div>
            <div className="flex items-center gap-2">
              {isBulkProcessing ? <Loader2 size={14} className="text-cyan-400 animate-spin" /> : <Sparkles size={14} className="text-slate-500" />}
              <span className="text-xs text-slate-300 font-medium">
                {bulkQueue.filter(i => i.status === 'success').length} / {bulkQueue.length} Ready
              </span>
            </div>
            <Link to="/dashboard/studio" onClick={() => setOpen(false)} className="text-[10px] text-cyan-500 hover:text-cyan-400 mt-2 block font-bold transition-colors">
              VIEW QUEUE →
            </Link>
          </div>
        )}

        <button
          className="nav-link w-full flex items-center gap-3 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
          onClick={logout}
          style={{ border: 'none', background: 'none', cursor: 'pointer' }}
        >
          <LogOut size={20} />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
};

const Login = () => {

  const handleDiscordLogin = () => {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(window.location.origin + '/discord-callback');
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join`;
    window.location.href = url;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080a0c] text-white p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      <div className="w-full max-w-md bg-[#111820] p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors">
          <ArrowLeft size={16} /> Back to Landing
        </Link>
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Music size={22} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Disperser Studio</span>
        </div>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-slate-400 text-sm">Please authorize with Discord to access the studio.</p>
          </div>
          
          <button 
            className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl font-bold shadow-lg shadow-cyan-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3" 
            onClick={handleDiscordLogin}
          >
            <MessageSquare size={20} /> Login with Discord
          </button>
        </div>
      </div>
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    if (localStorage.getItem('disperser_user')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  return <LandingPage onLoginClick={() => window.location.href = '/login'} />;
};

const DashboardLayout = ({ userExists }: { userExists: boolean }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (!userExists) return <Navigate to="/login" />;

  return (
    <PollProvider>
      <BulkUploadProvider>
        <div className="layout">
          <div className="mobile-nav">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-cyan-500 to-blue-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Music size={16} className="text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Disperser
              </span>
            </div>
            <button 
              className="p-2 text-slate-400 hover:text-white transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
          </div>

          <div 
            className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />

          <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
          <main className="content">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/studio" element={<AudioStudio />} />
              <Route path="/library" element={<AudioLibrary />} />
              <Route path="/image" element={<UploadImage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </BulkUploadProvider>
    </PollProvider>
  );
};

import { HelmetProvider } from 'react-helmet-async';

// --- Main App ---

export default function App() {
  const [user] = useState(localStorage.getItem('disperser_user'));

  return (
    <HelmetProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/discord-callback" element={<DiscordCallback />} />
          <Route path="/dashboard/*" element={<DashboardLayout userExists={!!user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </HelmetProvider>
  );
}
