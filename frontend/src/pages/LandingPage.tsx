import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Music, Zap, Shield, Youtube, Disc, ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onLoginClick: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick }) => {
  return (
    <div className="min-h-screen bg-[#06080a] text-white selection:bg-cyan-500/30 relative">
      <Helmet>
        <title>Disperser Studio | Professional Roblox Audio Uploader & Management</title>
        <meta name="description" content="The ultimate solution for Roblox creators. Upload, manage, and edit audio assets with professional tools, bulk import, and real-time moderation tracking." />
        <meta name="keywords" content="Roblox, Audio Uploader, Disperser Studio, Roblox Open Cloud, Audio Management, Bulk Upload, YouTube to Roblox" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Disperser Studio | Professional Roblox Audio Management" />
        <meta property="og:description" content="Automate your Roblox audio workflow. Bulk imports, YouTube extraction, and real-time moderation logs." />
        
        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="Disperser Studio | Roblox Audio Uploader" />
        <meta property="twitter:description" content="Professional audio management for Roblox creators. Upload and edit with ease." />
      </Helmet>

      {/* Dynamic Background Glows - Cyan, Blue, Green */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Top Left - Cyan */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-cyan-600/10 blur-[140px] rounded-full" />
        {/* Top Right - Green */}
        <div className="absolute top-[-5%] right-[-5%] w-[35%] h-[35%] bg-emerald-500/10 blur-[130px] rounded-full" />
        {/* Bottom Right - Blue */}
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-blue-600/10 blur-[140px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="flex items-center justify-between px-10 py-8 max-w-7xl mx-auto z-50 relative">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Music size={20} className="text-white" />
          </div>
          <span className="text-xl font-black tracking-tight">
            Disperser <span className="text-cyan-400">Studio</span>
          </span>
        </div>
        <button
          className="px-6 py-2.5 rounded-full bg-white text-black hover:bg-cyan-50 flex items-center gap-2 text-sm font-bold transition-all shadow-xl active:scale-95"
          onClick={onLoginClick}
        >
          <Disc size={18} />
          Login with Discord
        </button>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-40 px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] uppercase font-black tracking-[0.2em] mb-10">
            <Zap size={12} />
            <span>Fast, Simple and Cheap</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-10 leading-[0.9] text-white">
            Simplify- <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-400 bg-clip-text text-transparent">Uploading Audio</span> <br />
            With One All Package.
          </h1>
          <p className="text-xl text-slate-400 mb-14 max-w-2xl mx-auto font-medium leading-relaxed">
            Import from YouTube, edit in-browser, and bulk-upload assets to Roblox effortlessly.
            Disperser Studio handles the friction so you can focus on creating.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <button
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-12 h-16 rounded-2xl font-black text-lg flex items-center gap-3 transition-all hover:opacity-90 active:scale-95 shadow-2xl shadow-cyan-600/20"
              onClick={onLoginClick}
            >
              Get Started
              <ArrowRight size={22} />
            </button>
            <button
              className="bg-slate-900/50 hover:bg-slate-900 border border-slate-800 h-16 px-12 rounded-2xl text-white font-black text-lg transition-all active:scale-95"
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="px-8 py-32 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 relative">
            <h2 className="text-4xl font-black mb-4 tracking-tight">Everything you need to ship assets</h2>
            <p className="text-slate-500 max-w-lg mx-auto font-medium">Built for Roblox creators, by developers who know the pain of asset management.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Youtube className="text-cyan-400" />,
                title: "Convert from Youtube",
                desc: "Import high-quality audio directly via URL. No more sketchy converters or quality loss."
              },
              {
                icon: <Zap className="text-emerald-400" />,
                title: "In-Browser Studio",
                desc: "Trim, adjust pitch, speed, and volume instantly with real-time waveform visualization."
              },
              {
                icon: <Shield className="text-blue-400" />,
                title: "Smart Queue",
                desc: "Monitor moderation status accurately. Never guess if your asset passed or got rejected."
              }
            ].map((f, i) => (
              <div key={i} className="p-12 rounded-[2.5rem] bg-slate-900/30 border border-slate-800/50 hover:border-cyan-500/30 transition-all group backdrop-blur-sm">
                <div className="w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center mb-10 group-hover:bg-cyan-500/10 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-2xl font-black mb-4 tracking-tight">{f.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="px-8 py-32 relative">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Simple, Transparent Pricing</h2>
            <p className="text-slate-500 font-medium">Choose the plan that fits your studio's needs.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Free Plan */}
            <div className="p-10 rounded-[2.5rem] bg-slate-900/20 border border-slate-800/50 backdrop-blur-sm relative group transition-all">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-400 mb-2">Free Plan</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">Rp 0</span>
                  <span className="text-slate-500 font-medium">/ forever</span>
                </div>
              </div>

              <div className="space-y-4 mb-10">
                {[
                  "Realtime Update Status Asset",
                  "Single Import",
                  "Optimized Audio Enhanced",
                  "Audio Editor Tool",
                  "Single Upload",
                  "Limit / day : 3 Uploads"
                ].map((benefit, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-slate-800/50 flex items-center justify-center shrink-0">
                      <Zap size={10} className="text-slate-500" />
                    </div>
                    <span className="text-sm font-medium">{benefit}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onLoginClick}
                className="w-full py-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-all active:scale-95"
              >
                Get Started
              </button>
            </div>

            {/* Pro Plan */}
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-b from-slate-900/40 to-cyan-500/5 border-2 border-cyan-500/20 backdrop-blur-md relative group transition-all shadow-2xl shadow-cyan-500/5">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg shadow-cyan-500/20">
                Most Popular
              </div>

              <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-cyan-400">Pro Plan</h3>
                  <div className="bg-cyan-500/10 px-2 py-0.5 rounded text-[10px] font-bold text-cyan-400 uppercase tracking-tight">Best Value</div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">Rp 249.000</span>
                  <span className="text-slate-500 font-medium text-sm">/ month</span>
                  <span className="text-slate-500 line-through text-xs ml-auto">Rp 499.000</span>
                </div>
                <p className="text-cyan-500/60 text-xs font-bold mt-1">Limited time offer: Save 50%</p>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-10">
                {[
                  "Realtime update status asset",
                  "Optimized Audio Enhanced",
                  "Single Import (youtube / local files )",
                  "Bulk Imports (youtube / local files )",
                  "Audio Editor Tool",
                  "Bulk Audio Editor",
                  "Bulk Uploads",
                  "Unlimited Uploads",
                  "Priority Queue Download",
                  "Auto Collab to Group / User ( Soon )"
                ].map((benefit, i) => (
                  <div key={i} className="flex items-center gap-3 text-white">
                    <div className="w-5 h-5 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                      <Zap size={10} className="text-cyan-400" />
                    </div>
                    <span className="text-sm font-bold">{benefit}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onLoginClick}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-cyan-500/20"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </section>
      <section className="px-8 py-40 relative">
        <div className="max-w-5xl mx-auto rounded-[3.5rem] bg-[#0c1014] border border-slate-800 p-16 md:p-24 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-emerald-500/5 blur-[100px] rounded-full" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-cyan-500/5 blur-[100px] rounded-full" />
          <h2 className="text-5xl md:text-6xl font-black mb-10 tracking-tighter">Ready to speed up your workflow?</h2>
          <p className="text-slate-400 text-xl mb-14 max-w-xl mx-auto font-medium">Join hundreds of Roblox developers using Disperser Studio to manage their assets.</p>
          <button
            className="bg-white text-black px-16 h-16 rounded-2xl font-black text-xl hover:bg-cyan-50 transition-all active:scale-95 shadow-2xl shadow-white/10"
            onClick={onLoginClick}
          >
            Start Creating Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-20 border-t border-slate-900 text-center relative z-10">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="bg-cyan-600/10 w-8 h-8 rounded-lg flex items-center justify-center">
            <Music size={18} className="text-cyan-400" />
          </div>
          <span className="text-lg font-black tracking-tighter text-slate-400">Disperser Studio</span>
        </div>
        <p className="text-slate-700 text-[10px] font-bold uppercase tracking-widest">© 2026 DISPERSER STUDIO. INDEPENDENT PLATFORM.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
