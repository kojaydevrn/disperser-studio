import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Music, Image as ImageIcon, CheckCircle, Clock, AlertCircle, MessageSquare, Shield, Crown, Zap, SubscriptIcon, Subscript, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '../api/api';
import { supabase } from '../api/supabase';

export default function Overview() {
  const userStr = localStorage.getItem('disperser_user');
  const user = userStr ? JSON.parse(userStr) : {};
  const username = user.username || 'Creator';
  const [currentRole, setCurrentRole] = useState(user.current_role || 'Free');
  const [expireDate, setExpireDate] = useState(user.subscription_expires_at
    ? new Date(user.subscription_expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '-');

  const [totalAudios, setTotalAudios] = useState(0);
  const [totalApproved, setTotalApproved] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [dailyUploads, setDailyUploads] = useState(0);
  const dailyLimit = currentRole === 'Free' ? 3 : Infinity;
  
  const hasConfig = localStorage.getItem('disperser_key') && localStorage.getItem('disperser_user_id');

  useEffect(() => {
    const fetchData = async () => {
      const data = await api.getQueue();
      // Stats from library are still useful for total counts
      setTotalAudios(data.length);
      setTotalApproved(data.filter((item: any) => item.status === 'success').length);
      setTotalPending(data.filter((item: any) => item.status === 'pending' || item.status === 'processing' || item.status === 'reviewing').length);

      // Fetch latest user info
      if (user.id) {
        const { data: dbUser } = await supabase.from('users').select('current_role, subscription_expires_at, uploads_today, last_upload_date').eq('id', user.id).single();
        if (dbUser) {
          setCurrentRole(dbUser.current_role);
          const newExpireDate = dbUser.subscription_expires_at
            ? new Date(dbUser.subscription_expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            : '-';
          setExpireDate(newExpireDate);
          
          // Daily Reset Logic for Display
          const today = new Date().toISOString().split('T')[0];
          const lastUpload = dbUser.last_upload_date ? new Date(dbUser.last_upload_date).toISOString().split('T')[0] : '';
          
          if (lastUpload !== today) {
            setDailyUploads(0);
          } else {
            setDailyUploads(dbUser.uploads_today || 0);
          }

          // Update localStorage
          const updatedUser = { ...user, current_role: dbUser.current_role, subscription_expires_at: dbUser.subscription_expires_at, uploads_today: dbUser.uploads_today };
          localStorage.setItem('disperser_user', JSON.stringify(updatedUser));
        }
      }
    };
    fetchData();
  }, [user.id, currentRole]);

  const stats = [
    { label: 'Total Audios', value: totalAudios.toString(), icon: <Music className="text-cyan-400" />, trend: 'Uploaded assets' },
    {
      label: 'Daily Upload Limit',
      value: currentRole === 'Free' ? `${dailyUploads}/${dailyLimit}` : '∞',
      icon: <Zap className="text-amber-400" />,
      trend: currentRole === 'Free' ? `${dailyLimit - dailyUploads} uploads left today` : 'Unlimited uploads'
    },
    { label: 'Approved Assets', value: totalApproved.toString(), icon: <CheckCircle className="text-emerald-400" />, trend: 'Ready on Roblox' },
    { label: 'Pending/Processing', value: totalPending.toString(), icon: <Clock className="text-blue-400" />, trend: 'Awaiting moderation' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Helmet>
        <title>Dashboard | Disperser Studio</title>
      </Helmet>
      <div className="page-header">
        <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold mb-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          SYSTEM ONLINE
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight mb-2">
          Hello, <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">{username}</span>
        </h1>
        <p className="page-desc">Welcome back to Disperser Studio. Here's a quick look at your assets.</p>
      </div>

      {!hasConfig && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertCircle className="text-red-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Configuration Required!</h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                You haven't set up your <span className="text-white font-semibold">Roblox API Key</span> or <span className="text-white font-semibold">User ID</span> yet. 
                Without these, you won't be able to upload assets to Roblox. Please complete your profile in Settings.
              </p>
            </div>
          </div>
          <Button 
            variant="destructive"
            className="bg-red-600 hover:bg-red-500 text-white font-bold px-8 shrink-0"
            onClick={() => window.location.href = '/dashboard/settings'}
          >
            Complete Now
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Card key={i} className="bg-slate-900/40 border-slate-800 backdrop-blur-sm hover:border-cyan-500/30 transition-all group">
            <CardHeader className="pb-2">
              <div className="w-10 h-10 rounded-lg bg-slate-800/50 flex items-center justify-center mb-2 group-hover:bg-cyan-500/10 transition-colors">
                {stat.icon}
              </div>
              <CardTitle className="text-sm font-medium text-slate-400">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-slate-500">{stat.trend}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <Card className="lg:col-span-2 bg-slate-900/40 border-slate-800 p-8 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Crown size={120} />
          </div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
            <Shield className="text-cyan-400" /> Subscription Status
          </h2>
          <p className="text-slate-400 mb-8 max-w-md">Manage your account tier to unlock higher limits and faster processing speeds.</p>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 flex-1">
              <div className="text-sm text-slate-400 mb-1">Current Tier</div>
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                {currentRole}
              </div>
            </div>
            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 flex-1">
              <div className="text-sm text-slate-400 mb-1">Expiration Date</div>
              <div className="text-2xl font-bold text-white mt-1">
                {currentRole === 'Free' ? 'Lifetime' : expireDate}
              </div>
            </div>
          </div>

          {currentRole === 'Free' && (
            <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <Sparkles size={100} className="text-amber-400" />
              </div>
              <div className="relative z-10">
                <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2 mb-2">
                  <Crown size={20} /> Upgrade to Pro Plan
                </h3>
                <p className="text-sm text-slate-300 mb-6 max-w-lg leading-relaxed">
                  You are currently on the <span className="font-bold text-white">Free Plan</span>.
                  Unlock bulk imports, unlimited uploads, and priority processing to supercharge your workflow.
                </p>
                <Button
                  onClick={() => window.open('https://discord.gg/2dRtqgmKPR', '_blank')}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-black px-8 h-12 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  Upgrade via Discord
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-slate-900/40 border-slate-800 p-6 space-y-6 flex flex-col">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Sparkles className="text-indigo-400" />
              </div>
              <h3 className="font-bold text-white text-lg">Upgrade to Pro Plan</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Upgrade your benefit and you can join our <span className='text-cyan-400'>Discord</span> server!
            </p>

            {currentRole === 'Free' && (
              <div className="space-y-4 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 mb-6">
                <div className="text-lg font-bold text-indigo-400 uppercase tracking-wider mb-2">Pro Plan Benefits:</div>
                <ul className="space-y-2">
                  {[
                    "Realtime update status asset",
                    "Optimized Audio Enhanced",
                    "Bulk Imports (YT/Local)",
                    "Unlimited Uploads",
                    "Priority Queue Download",
                    "Bulk Audio Editor",
                    "Auto Collab (Soon)"
                  ].map((benefit, i) => (
                    <li key={i} className="text-[15px] text-slate-300 flex items-center gap-2">
                      <Zap size={10} className="text-indigo-400" /> {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800 p-6 space-y-4">
          <h3 className="font-bold text-white mb-4">Quick Links</h3>
          <div className="space-y-2">
            <button className="w-full text-left p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors text-sm text-slate-300">
              Roblox Creator Dashboard
            </button>
            <button
              onClick={() => window.open('https://discord.gg/2dRtqgmKPR', '_blank')}
              className="w-full text-left p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors text-sm text-slate-300"
            >
              Community Discord
            </button>
            <button className="w-full text-left p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors text-sm text-slate-300">
              Developer API Docs
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
