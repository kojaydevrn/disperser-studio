import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import * as Tone from 'tone';
import audioBufferToWav from 'audiobuffer-to-wav';
import { api } from '../api/api';
import { useNavigate } from 'react-router-dom';
import { usePollContext } from '@/context/PollContext';
import { processAudio } from '@/utils/processor';
import {
  Upload,
  Youtube,
  Check,
  X,
  Scissors,
  Music,
  Play,
  Pause,
  Volume2,
  Zap,
  Activity,
  Headphones,
  AudioWaveform,
  Loader2,
  Sparkles,
  FileAudio,
  Clock,
  AlertCircle,
  CheckCircle2,
  Crown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { z } from 'zod';
import { BulkItemEditor } from './BulkItemEditor';
import { useBulkUpload } from '@/context/BulkUploadContext';
import { Helmet } from 'react-helmet-async';

const assetSchema = z.object({
  name: z.string().min(1, 'Asset name is required').min(3, 'Name must be at least 3 characters').max(50, 'Name must be under 50 characters'),
});

export default function AudioStudio() {
  const userStr = localStorage.getItem('disperser_user');
  const user = userStr ? JSON.parse(userStr) : {};
  const currentRole = user.current_role || 'Free';

  const [file, setFile] = useState<File | null>(null);
  const [ytUrl, setYtUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [assetName, setAssetName] = useState('');
  const [nameError, setNameError] = useState('');
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });

  const [history, setHistory] = useState<any[]>([]);
  const [ytError, setYtError] = useState('');
  const [saveError, setSaveError] = useState('');

  const navigate = useNavigate();
  const { refresh } = usePollContext();

  // Bulk Upload Context
  const {
    bulkQueue,
    isBulkProcessing,
    editingIndex,
    setEditingIndex,
    addToBulkQueue,
    removeFromBulkQueue,
    processBulkQueue,
    updateBulkItem,
    applyToAll,
    handleSaveAll: originalSaveAll,
    clearBulkQueue,
    loading: bulkLoading,
    loadingMsg: bulkLoadingMsg,
    saveError: bulkSaveError
  } = useBulkUpload();

  const handleSaveAll = async () => {
    try {
      await originalSaveAll();
    } catch (e) {
    } finally {
      await refresh();
      navigate('/dashboard/library');
    }
  };

  const [bulkYtUrls, setBulkYtUrls] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      setHistory(await api.getHistory());
    };
    loadHistory();
  }, []);

  const waveRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const regions = useRef<any>(null);
  const trimRef = useRef(trim);

  // Keep trimRef in sync
  useEffect(() => { trimRef.current = trim; }, [trim]);

  // Format seconds to mm:ss
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!file || !waveRef.current) return;

    ws.current = WaveSurfer.create({
      container: waveRef.current,
      waveColor: '#1e293b',
      progressColor: '#06b6d4',
      cursorColor: '#22d3ee',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      height: 140,
      normalize: true,
      plugins: [regions.current = RegionsPlugin.create()]
    });

    ws.current.loadBlob(file);

    ws.current.on('ready', () => {
      const d = ws.current!.getDuration();
      setDuration(d);
      setTrim({ start: 0, end: d });
      regions.current.addRegion({
        id: 'trim',
        start: 0,
        end: d,
        color: 'rgba(6, 182, 212, 0.12)',
        drag: true,
        resize: true
      });
    });

    ws.current.on('play', () => setIsPlaying(true));
    ws.current.on('pause', () => setIsPlaying(false));
    ws.current.on('timeupdate', (time: number) => {
      setCurrentTime(time);
      // Auto-stop at trim end (use ref to avoid stale closure)
      if (time >= trimRef.current.end && ws.current?.isPlaying()) {
        ws.current.pause();
      }
    });

    regions.current.on('region-updated', (region: any) => {
      setTrim({ start: region.start, end: region.end });
    });

    return () => ws.current?.destroy();
  }, [file]);

  // Handle Bulk Item Loading into Wavesurfer
  useEffect(() => {
    if (editingIndex === null || !bulkQueue[editingIndex]?.buffer || !waveRef.current) return;
    const item = bulkQueue[editingIndex];

    ws.current = WaveSurfer.create({
      container: waveRef.current,
      waveColor: '#1e293b',
      progressColor: '#06b6d4',
      cursorColor: '#22d3ee',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      height: 140,
      normalize: true,
      plugins: [regions.current = RegionsPlugin.create()]
    });

    const blob = new Blob([item.buffer as any], { type: 'audio/mpeg' });
    ws.current.loadBlob(blob);

    ws.current.on('ready', () => {
      const d = ws.current!.getDuration();
      setDuration(d);
      setTrim({ start: 0, end: d });
      regions.current.addRegion({
        id: 'trim',
        start: 0,
        end: d,
        color: 'rgba(6, 182, 212, 0.12)',
        drag: true,
        resize: true
      });
      // Auto-populate name if not already set
      if (!assetName || assetName === 'YouTube Audio') {
        setAssetName(item.name);
      }
    });

    ws.current.on('play', () => setIsPlaying(true));
    ws.current.on('pause', () => setIsPlaying(false));
    ws.current.on('timeupdate', (time: number) => {
      setCurrentTime(time);
      if (time >= trimRef.current.end && ws.current?.isPlaying()) {
        ws.current.pause();
      }
    });

    regions.current.on('region-updated', (region: any) => {
      setTrim({ start: region.start, end: region.end });
    });

    return () => ws.current?.destroy();
  }, [editingIndex, bulkQueue.length]);

  // Apply volume changes in real-time
  useEffect(() => {
    if (ws.current) {
      // HTMLMediaElement.volume only accepts [0, 1]; values >1 are applied at export via Tone.js
      ws.current.setVolume(Math.min(volume, 1));
    }
  }, [volume]);

  // Apply speed + pitch in real-time
  // We disable preservesPitch on the media element so playbackRate also shifts pitch.
  // Combined rate = speed * pitchMultiplier
  useEffect(() => {
    if (!ws.current) return;
    const pitchMultiplier = Math.pow(2, pitch / 100);
    const combinedRate = speed * pitchMultiplier;
    ws.current.setPlaybackRate(combinedRate);

    // Disable preservesPitch so rate changes also affect pitch
    try {
      const media = ws.current.getMediaElement();
      if (media) {
        (media as any).preservesPitch = false;
        (media as any).mozPreservesPitch = false;
        (media as any).webkitPreservesPitch = false;
      }
    } catch { }
  }, [speed, pitch]);

  // Play from trim start, stop at trim end
  const togglePlay = () => {
    if (!ws.current) return;
    if (ws.current.isPlaying()) {
      ws.current.pause();
    } else {
      // Always start from trim region start
      ws.current.setTime(trimRef.current.start);
      ws.current.play();
    }
  };

  const handleImport = async () => {
    if (!ytUrl) return;
    setLoading(true);
    setYtError('');
    setLoadingMsg('Downloading from YouTube...');
    try {
      const { title, buffer } = await api.ytDownload(ytUrl);
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      setFile(new File([blob], `${title}.mp3`));
      setAssetName(title);
      await api.addToHistory(title, ytUrl, buffer);
      setHistory(await api.getHistory());
    } catch (e: any) {
      setYtError(e.message);
    }
    setLoading(false);
    setLoadingMsg('');
  };

  const handleSave = async () => {
    if (!file || !ws.current) return;

    // Validate asset name
    const result = assetSchema.safeParse({ name: assetName });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message || 'Invalid asset name');
      return;
    }
    setNameError('');
    setSaveError('');

    // Check final duration
    const fullDuration = ws.current.getDuration();
    const actualTrimStart = trim.start || 0;
    const actualTrimEnd = trim.end || fullDuration;
    const trimDuration = actualTrimEnd - actualTrimStart;
    const finalDuration = trimDuration / speed;

    if (finalDuration > 420) {
      setSaveError(`Final audio is too long (${Math.floor(finalDuration / 60)}m ${Math.round(finalDuration % 60)}s). Maximum allowed is 7 minutes. Please trim the audio or increase speed.`);
      return;
    }

    setLoading(true);
    setLoadingMsg('Applying effects & preparing asset...');
    try {
      // Start Tone.js audio context
      await Tone.start();

      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new AudioContext();
      const original = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();

      const processed = await processAudio(original, {
        volume,
        speed,
        pitch,
        trimStart: trim.start,
        trimEnd: trim.end
      });
      const wav = audioBufferToWav((processed as any).get ? (processed as any).get() : processed);
      const wavBlob = new Blob([wav], { type: 'audio/wav' });
      await api.addToQueue(assetName, 'Uploaded via Studio', wavBlob);

      setFile(null);
      setAssetName('');
      setYtUrl('');
      setHistory(await api.getHistory());
    } catch (e: any) {
      setSaveError('Processing failed: ' + e.message);
    } finally {
      await refresh();
      navigate('/dashboard/library');
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleBulkYoutubeAdd = () => {
    const urls = bulkYtUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) return;

    const newItems = urls.map(url => ({
      id: Math.random().toString(36).substring(7),
      name: 'YouTube Audio',
      source: url,
      type: 'youtube' as const,
      status: 'pending' as const,
      volume: 1,
      speed: 1,
      pitch: 0,
      trim: null,
      assetName: 'YouTube Audio'
    }));

    addToBulkQueue(newItems);
    setBulkYtUrls('');
  };

  const handleBulkFilesAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const newItems = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name.replace(/\.[^/.]+$/, ""),
      source: file.name,
      file: file,
      type: 'local' as const,
      status: 'pending' as const,
      volume: 1,
      speed: 1,
      pitch: 0,
      trim: null,
      assetName: file.name.replace(/\.[^/.]+$/, "")
    }));

    addToBulkQueue(newItems);
    e.target.value = ''; // Reset input
  };

  // Bulk handlers are now managed in BulkUploadContext




  const handleLoadHistory = (item: any) => {
    const blob = new Blob([item.buffer], { type: 'audio/mpeg' });
    setFile(new File([blob], `${item.title}.mp3`));
    setAssetName(item.title);
    setYtUrl(item.ytUrl || '');
    setSaveError('');
    setYtError('');
    setEditingIndex(null); // Clear bulk mode if loading single history
  };

  // Reset a single control
  const resetControl = (ctrl: 'volume' | 'speed' | 'pitch') => {
    if (ctrl === 'volume') setVolume(1);
    if (ctrl === 'speed') setSpeed(1);
    if (ctrl === 'pitch') setPitch(0);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <Helmet>
        <title>Audio Studio | Disperser Studio</title>
      </Helmet>
      {/* Loading Overlay */}
      {(loading || bulkLoading) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="w-24 h-24 relative mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-cyan-500/10 border-t-cyan-500 animate-spin" />
            <div className="absolute inset-4 rounded-full border-4 border-blue-500/10 border-b-blue-500 animate-reverse-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap size={32} className="text-cyan-400 animate-pulse" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Processing Assets</h2>
          <p className="text-slate-400 max-w-md leading-relaxed animate-pulse">
            {loadingMsg || bulkLoadingMsg || 'Preparing your audio files for Roblox...'}
          </p>
          <div className="mt-8 flex gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {(!file && editingIndex === null) ? (
        /* ==================== IMPORT SCREEN ==================== */
        <div className="space-y-6">
          {/* Header Card */}
          <Card className="bg-gradient-to-br from-cyan-500/5 to-blue-600/5 border-slate-800 p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
                <Headphones size={28} className="text-white" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Audio Preparation Studio</h2>
                <p className="text-slate-400 leading-relaxed max-w-xl">
                  Import audio from <span className="text-red-400 font-semibold">YouTube</span> or upload a local file.
                  Then use the built-in editor to <span className="text-cyan-400 font-semibold">trim</span>,
                  adjust <span className="text-cyan-400 font-semibold">speed</span>,
                  <span className="text-cyan-400 font-semibold">pitch</span>, and {" "}
                  <span className="text-cyan-400 font-semibold">volume</span> before uploading to Roblox.
                </p>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                  <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs gap-1">
                    <FileAudio size={12} /> MP3 Output
                  </Badge>
                  <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs gap-1">
                    <Sparkles size={12} /> Powered by Tone.js
                  </Badge>
                  <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs gap-1">
                    <AudioWaveform size={12} /> Waveform Editor
                  </Badge>
                </div>
              </div>
            </div>
          </Card>

          {/* Import Options */}
          <Tabs defaultValue="single" className="space-y-6">
            <TabsList className="bg-slate-900 border border-slate-800 p-1 w-full overflow-x-auto justify-start">
              <TabsTrigger value="single" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 gap-2 px-6">
                <Music size={14} /> Single Import
              </TabsTrigger>
              <TabsTrigger value="bulk" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 gap-2 px-6">
                <Zap size={14} /> Bulk Import {currentRole === 'Free' && <Crown size={12} className="text-yellow-500 ml-1" />}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              {currentRole === 'Free' && (
                <div className="mb-6 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                  <AlertCircle size={14} />
                  <span>You are using the <b>Free Plan</b>. You have a maximum limit of <b>3 Uploads/Imports per day</b>. Upgrade to <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('buy-sub-discord')?.click(); }} className="underline font-bold text-yellow-400">Pro Plan</a> to remove this limit.</span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* YouTube Import */}
                <Card className="bg-slate-900/40 border-slate-800 p-8 space-y-4 hover:border-red-500/20 transition-colors group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                      <Youtube size={22} className="text-red-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">Import from YouTube</h3>
                      <p className="text-xs text-slate-500">Paste a video URL to extract audio as MP3</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="https://youtube.com/watch?v=..."
                      value={ytUrl}
                      onChange={(e) => { setYtUrl(e.target.value); if (ytError) setYtError(''); }}
                      className={`bg-slate-950 border-slate-800 focus-visible:ring-cyan-500/50 h-11 ${ytError ? 'border-red-500/50' : ''}`}
                    />
                    <Button onClick={handleImport} disabled={loading || !ytUrl} className="bg-red-600 hover:bg-red-500 shrink-0 gap-2 h-11">
                      <Youtube size={16} /> Import
                    </Button>
                  </div>
                  {ytError && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/5 p-3 rounded-lg border border-red-500/20 animate-in fade-in slide-in-from-top-1">
                      <AlertCircle size={14} />
                      {ytError}
                    </div>
                  )}

                  {/* History Section */}
                  {history.length > 0 && (
                    <div className="pt-4 mt-4 border-t border-slate-800/50">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Clock size={14} /> Recent Imports
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {history.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleLoadHistory(item)}
                            className="w-full text-left bg-slate-950/50 hover:bg-cyan-500/10 border border-slate-800 hover:border-cyan-500/30 p-3 rounded-xl transition-all group flex items-center justify-between"
                          >
                            <div className="truncate pr-4">
                              <div className="text-sm font-medium text-slate-300 group-hover:text-cyan-400 truncate">{item.title}</div>
                              <div className="text-[10px] text-slate-500 mt-1">{new Date(item.createdAt).toLocaleString()}</div>
                            </div>
                            <Play size={14} className="text-slate-600 group-hover:text-cyan-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Local File Upload */}
                <label className="cursor-pointer">
                  <Card className="bg-slate-900/40 border-slate-800 border-dashed p-8 hover:border-cyan-500/30 hover:bg-slate-900/60 transition-all h-full flex flex-col items-center justify-center text-center gap-4 group">
                    <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors">
                      <Upload size={24} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">Upload Local File</h3>
                      <p className="text-xs text-slate-500 mt-1">Supports MP3, WAV, OGG, M4A</p>
                    </div>
                    <input type="file" accept="audio/*" hidden onChange={e => e.target.files && setFile(e.target.files[0])} />
                  </Card>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="bulk">
              {currentRole === 'Free' ? (
                <Card className="bg-slate-900/40 border-slate-800 p-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-2">
                    <Crown size={32} className="text-yellow-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Pro Plan Exclusive</h3>
                  <p className="text-slate-400 max-w-md mx-auto">
                    Bulk Import allows you to upload dozens of files or YouTube URLs simultaneously. This feature is exclusive to <b>Pro Plan</b> users.
                  </p>
                  <Button
                    onClick={() => document.getElementById('buy-sub-discord')?.click()}
                    className="mt-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white gap-2"
                  >
                    <Crown size={16} /> Upgrade via Discord
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* YouTube Bulk */}
                  <Card className="bg-slate-900/40 border-slate-800 p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                        <Youtube size={22} className="text-red-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white">YouTube Bulk Upload</h3>
                        <p className="text-xs text-slate-500">Paste multiple links, one per line</p>
                      </div>
                    </div>
                    <textarea
                      className="flex-1 min-h-[160px] bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 font-mono focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none resize-none"
                      placeholder="https://youtube.com/watch?v=link1&#10;https://youtube.com/watch?v=link2&#10;https://youtube.com/watch?v=link3"
                      value={bulkYtUrls}
                      onChange={(e) => setBulkYtUrls(e.target.value)}
                    />
                    <Button
                      onClick={handleBulkYoutubeAdd}
                      disabled={!bulkYtUrls.trim()}
                      className="bg-red-600 hover:bg-red-500 gap-2"
                    >
                      Add to Queue
                    </Button>
                  </Card>

                  {/* Local Bulk */}
                  <div className="space-y-6">
                    <label className="cursor-pointer block">
                      <Card className="bg-slate-900/40 border-slate-800 border-dashed p-10 hover:border-cyan-500/30 hover:bg-slate-900/60 transition-all text-center gap-4 group flex flex-col items-center justify-center">
                        <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors">
                          <Upload size={24} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white">Bulk File Upload</h3>
                          <p className="text-xs text-slate-500 mt-1">Select multiple files at once</p>
                        </div>
                        <input
                          type="file"
                          accept="audio/*"
                          multiple
                          hidden
                          onChange={handleBulkFilesAdd}
                        />
                      </Card>
                    </label>

                    {/* Bulk Queue Display */}
                    {bulkQueue.length > 0 && (
                      <Card className="bg-slate-900/60 border-slate-800 p-4">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Zap size={14} className="text-cyan-400" /> Bulk Queue ({bulkQueue.length})
                          </h3>
                          <Button
                            size="sm"
                            onClick={processBulkQueue}
                            disabled={isBulkProcessing || bulkQueue.every(i => i.status === 'success')}
                            className="bg-cyan-600 hover:bg-cyan-500 h-8 gap-2"
                          >
                            {isBulkProcessing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                            <span>Process All</span>
                          </Button>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {bulkQueue.map((item) => (
                            <div key={item.id} className="flex items-center justify-between bg-slate-950 p-2 px-3 rounded-lg border border-slate-800/50">
                              <div className="flex items-center gap-3 truncate">
                                {item.type === 'youtube' ? <Youtube size={14} className="text-red-400" /> : <FileAudio size={14} className="text-cyan-400" />}
                                <div className="truncate">
                                  <div className="text-xs text-white truncate max-w-[150px]">{item.name}</div>
                                  {item.status === 'error' && <div className="text-[10px] text-red-400 truncate">{item.error}</div>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {item.status === 'pending' && <Clock size={14} className="text-slate-600" />}
                                {item.status === 'loading' && <Loader2 size={14} className="text-cyan-400 animate-spin" />}
                                {item.status === 'success' && !isBulkProcessing && (
                                  <button
                                    onClick={() => {
                                      const idx = bulkQueue.indexOf(item);
                                      setEditingIndex(idx);
                                      setAssetName(item.name);
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-all text-[10px] font-bold"
                                  >
                                    <Scissors size={12} /> EDIT
                                  </button>
                                )}
                                {item.status === 'error' && <AlertCircle size={14} className="text-red-400" />}
                                <button
                                  onClick={() => removeFromBulkQueue(item.id)}
                                  disabled={isBulkProcessing}
                                  className="text-slate-600 hover:text-red-400 transition-colors ml-1"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Tips */}
          <div className="bg-slate-900/20 border border-slate-800/50 rounded-xl p-4 flex items-start gap-3">
            <Sparkles size={13} className="text-cyan-400 mt-1.5 shrink-0" />
            <p className="text-sm text-slate-500 leading-relaxed">
              <span className="text-slate-400 font-medium">Pro tip:</span> For best results on Roblox,
              keep your audio under 7 minutes and ensure the final volume isn't too loud (stay under 150%).
              Roblox supports audio up to 7 minutes for free accounts.
            </p>
          </div>
        </div>
      ) : (
        /* ==================== EDITOR SCREEN ==================== */
        <div className="space-y-6">
          {editingIndex !== null ? (
            /* BATCH EDITOR VIEW */
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Zap size={20} className="text-cyan-400" /> Batch Editor
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Review and edit all {bulkQueue.length} assets before processing</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="bg-slate-950 border-slate-800 text-slate-400 py-1.5 px-3">
                    Apply Global Settings:
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => applyToAll('volume', 1)} className="text-[10px] h-8 bg-slate-950 border-slate-800 hover:text-cyan-400">100% Vol</Button>
                  <Button variant="outline" size="sm" onClick={() => applyToAll('speed', 1)} className="text-[10px] h-8 bg-slate-950 border-slate-800 hover:text-cyan-400">1x Speed</Button>
                  <Button variant="outline" size="sm" onClick={() => applyToAll('pitch', 0)} className="text-[10px] h-8 bg-slate-950 border-slate-800 hover:text-cyan-400">0 Pitch</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { applyToAll('volume', 0.05); applyToAll('speed', 2.3); }}
                    className="text-[10px] h-8 bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 gap-1.5"
                  >
                    <Sparkles size={12} /> Auto Optimize (5% Vol, 2.3x Speed)
                  </Button>
                </div>
              </div>

              {/* Best Practice Tip for Batch */}
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-cyan-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className="text-cyan-400 font-bold uppercase tracking-wider mr-2">Roblox Best Practice:</span>
                  To increase approval rates, use <span className="text-white font-medium">5% Volume</span> and <span className="text-white font-medium">2.3x Speed</span>.
                  After uploading, set the <span className="text-cyan-400 font-bold underline">PlaybackSpeed to 0.43</span> in your Roblox sound properties.
                </p>
              </div>

              <div className="space-y-4">
                {bulkQueue.map((item) => (
                  <BulkItemEditor
                    key={item.id}
                    item={item}
                    onUpdate={updateBulkItem}
                    onRemove={removeFromBulkQueue}
                  />
                ))}
              </div>

              <Card className="bg-slate-900 border-slate-800 p-6 sticky bottom-6 shadow-2xl shadow-black/50 z-10">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-cyan-500 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-white">Ready to process?</h4>
                      <p className="text-xs text-slate-500 mt-1">All {bulkQueue.length} items will be processed with their current settings.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <Button
                      variant="ghost"
                      onClick={clearBulkQueue}
                      className="text-slate-500 hover:text-red-400 flex-1 md:flex-none"
                    >
                      Cancel All
                    </Button>
                    <Button
                      onClick={handleSaveAll}
                      disabled={bulkLoading || bulkQueue.length === 0}
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 px-8 py-6 h-auto flex-1 md:flex-none gap-3 text-lg font-bold"
                    >
                      <CheckCircle2 size={24} /> Process & Save All
                    </Button>
                  </div>
                </div>
                {bulkSaveError && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {bulkSaveError}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            /* SINGLE EDITOR VIEW */
            <Card className="bg-slate-900/40 border-slate-800 overflow-hidden">
              <CardContent className="p-0">
                {/* Waveform Section */}
                <div className="bg-slate-950/80 p-4 md:p-6 pb-4 border-b border-slate-800 relative">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={togglePlay}
                        className="w-12 h-12 shrink-0 rounded-full border-slate-700 bg-slate-900/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all"
                      >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                      </Button>
                      <div className="min-width-0">
                        <h3 className="font-bold text-white text-base truncate max-w-[200px] md:max-w-[400px]">{assetName || file?.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 mt-1">
                          <span className="font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">{formatTime(currentTime)}</span>
                          <span className="text-slate-700">/</span>
                          <span className="font-mono">{formatTime(duration)}</span>
                          <span className="hidden sm:inline text-slate-700">•</span>
                          <span className="w-full sm:w-auto">Trim: {formatTime(trim.start)} → {formatTime(trim.end)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 gap-1.5 text-[10px] py-1">
                        <Scissors size={12} /> Drag edges to trim
                      </Badge>
                    </div>
                  </div>

                  <div ref={waveRef} className="rounded-lg overflow-hidden" />
                </div>

                <div className="p-4 md:p-6 space-y-8">
                  {/* Audio Controls Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Volume */}
                    <div className="space-y-3 rounded-xl p-4 border bg-slate-900/30 border-slate-800/50">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                          <Volume2 size={14} className="text-cyan-400" /> Volume
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{Math.round(volume * 100)}%</span>
                          <button onClick={() => resetControl('volume')} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Reset</button>
                        </div>
                      </div>
                      <Slider value={[volume * 100]} max={200} step={1} onValueChange={(v) => setVolume(v[0] / 100)} />
                      <p className="text-[10px] text-slate-600">Adjust output loudness (0% – 200%)</p>
                    </div>

                    {/* Speed */}
                    <div className="space-y-3 rounded-xl p-4 border bg-slate-900/30 border-slate-800/50">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                          <Zap size={14} className="text-cyan-400" /> Speed
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{speed.toFixed(1)}x</span>
                          <button onClick={() => resetControl('speed')} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Reset</button>
                        </div>
                      </div>
                      <Slider value={[speed * 10]} min={5} max={30} step={1} onValueChange={(v) => setSpeed(v[0] / 10)} />
                      <p className="text-[10px] text-slate-600">Playback rate (0.5x – 3.0x)</p>
                    </div>

                    {/* Pitch */}
                    <div className="space-y-3 rounded-xl p-4 border bg-slate-900/30 border-slate-800/50">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                          <Activity size={14} className="text-cyan-400" /> Pitch Shift
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{pitch > 0 ? '+' : ''}{pitch}%</span>
                          <button onClick={() => resetControl('pitch')} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Reset</button>
                        </div>
                      </div>
                      <Slider value={[pitch + 100]} min={0} max={200} step={1} onValueChange={(v) => setPitch(v[0] - 100)} />
                      <p className="text-[10px] text-slate-600">Pitch adjustment (-100% to +100%)</p>
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="flex flex-col gap-4 pt-4 border-t border-slate-800/50">
                    <div className={`bg-slate-950 border rounded-xl p-5 space-y-3 ${nameError ? 'border-red-500/50' : 'border-slate-800'}`}>
                      <Label htmlFor="assetName" className="text-sm font-bold text-slate-300 flex items-center gap-2">
                        Asset Name <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        id="assetName"
                        value={assetName}
                        onChange={(e) => { setAssetName(e.target.value); setNameError(''); }}
                        placeholder="e.g. Epic Background Music, SFX Jump, Ambient Rain..."
                        className={`bg-slate-900 border-slate-800 text-white text-base py-3 px-4 focus-visible:ring-cyan-500/50 ${nameError ? 'border-red-500' : ''}`}
                        maxLength={50}
                      />
                      {nameError && <p className="text-xs text-red-400 font-medium">{nameError}</p>}
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        This will be the display name for your audio asset on Roblox.
                      </p>
                    </div>

                    {saveError && (
                      <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="text-sm text-red-300 leading-relaxed">{saveError}</div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setVolume(0.05); setSpeed(2.3); }}
                        className="bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 gap-2 h-10 w-full sm:w-auto"
                      >
                        <Sparkles size={14} /> Auto Optimize
                      </Button>
                      <div className="flex gap-3">
                        <Button
                          variant="ghost"
                          onClick={() => { setFile(null); setAssetName(''); setYtUrl(''); }}
                          className="text-slate-500 hover:text-white gap-2 flex-1 sm:flex-none"
                        >
                          <X size={16} /> Discard
                        </Button>
                        <Button onClick={handleSave} disabled={loading} className="bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 gap-2 px-6 flex-1 sm:flex-none">
                          <Check size={16} /> Prepare Asset
                        </Button>
                      </div>
                    </div>

                    {/* Best Practice Tip for Single */}
                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-3 flex items-start gap-3 mt-2">
                      <AlertCircle size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        <span className="text-cyan-400 font-bold">Best Practice:</span> Use <span className="text-slate-300">5% Vol</span> & <span className="text-slate-300">2.3x Speed</span> for better approval rates. Set <span className="text-cyan-400 font-medium underline">PlaybackSpeed to 0.43</span> on Roblox after upload.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
