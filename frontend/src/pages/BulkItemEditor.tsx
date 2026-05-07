import React, { useState, useRef, useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { 
  Youtube, 
  FileAudio, 
  Volume2, 
  Zap, 
  Activity, 
  Scissors, 
  Play, 
  Pause,
  X,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface BulkItemEditorProps {
  item: any;
  onUpdate: (id: string, updates: any) => void;
  onRemove: (id: string) => void;
}

export const BulkItemEditor: React.FC<BulkItemEditorProps> = ({ item, onUpdate, onRemove }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const waveRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const regions = useRef<any>(null);
  const trimRef = useRef(item.trim || { start: 0, end: 0 });

  useEffect(() => {
    trimRef.current = item.trim || { start: 0, end: duration };
  }, [item.trim, duration]);

  useEffect(() => {
    if (!item.buffer || !waveRef.current || !isExpanded) return;

    ws.current = WaveSurfer.create({
      container: waveRef.current,
      waveColor: '#1e293b',
      progressColor: '#06b6d4',
      cursorColor: '#22d3ee',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      height: 80,
      normalize: true,
      plugins: [regions.current = RegionsPlugin.create()]
    });

    const blob = new Blob([item.buffer], { type: 'audio/mpeg' });
    ws.current.loadBlob(blob);

    ws.current.on('ready', () => {
      const d = ws.current!.getDuration();
      setDuration(d);
      
      const start = item.trim?.start || 0;
      const end = item.trim?.end || d;
      
      regions.current.addRegion({
        id: 'trim',
        start,
        end,
        color: 'rgba(6, 182, 212, 0.12)',
        drag: true,
        resize: true
      });
      
      if (!item.trim) {
        onUpdate(item.id, { trim: { start, end } });
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
      onUpdate(item.id, { trim: { start: region.start, end: region.end } });
    });

    return () => {
      ws.current?.destroy();
      ws.current = null;
    };
  }, [isExpanded, item.id]); // Re-init if expanded or item changes

  // Real-time Effect Previews
  useEffect(() => {
    if (ws.current) {
      ws.current.setVolume(Math.min(item.volume, 1));
    }
  }, [item.volume]);

  useEffect(() => {
    if (!ws.current) return;
    const pitchMultiplier = Math.pow(2, item.pitch / 100);
    const combinedRate = item.speed * pitchMultiplier;
    ws.current.setPlaybackRate(combinedRate);

    try {
      const media = ws.current.getMediaElement();
      if (media) {
        (media as any).preservesPitch = false;
        (media as any).mozPreservesPitch = false;
        (media as any).webkitPreservesPitch = false;
      }
    } catch { }
  }, [item.speed, item.pitch]);

  const togglePlay = () => {
    if (!ws.current) return;
    if (ws.current.isPlaying()) {
      ws.current.pause();
    } else {
      ws.current.setTime(item.trim?.start || 0);
      ws.current.play();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={`bg-slate-900/40 border-slate-800 transition-all overflow-hidden ${isExpanded ? 'ring-1 ring-cyan-500/30' : ''}`}>
      <div 
        className="p-3 sm:p-4 flex flex-row items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors gap-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${item.type === 'youtube' ? 'bg-red-500/10' : 'bg-cyan-500/10'}`}>
            {item.type === 'youtube' ? <Youtube size={18} className="text-red-400" /> : <FileAudio size={18} className="text-cyan-400" />}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-white text-xs sm:text-sm truncate">{item.assetName || item.name}</h4>
            <div className="flex items-center flex-wrap gap-x-2 sm:gap-3 text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
              <span className="flex items-center gap-1"><Volume2 size={10} /> {Math.round(item.volume * 100)}%</span>
              <span className="flex items-center gap-1"><Zap size={10} /> {item.speed}x</span>
              <span className="flex items-center gap-1"><Scissors size={10} /> {formatTime((item.trim?.end || 0) - (item.trim?.start || 0))}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-slate-500 hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          >
            <Trash2 size={16} />
          </Button>
          {isExpanded ? <ChevronUp size={18} className="text-slate-600" /> : <ChevronDown size={18} className="text-slate-600" />}
        </div>
      </div>

      {isExpanded && (
        <CardContent className="p-4 sm:p-6 pt-0 space-y-6 border-t border-slate-800/50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
            {/* Left: Waveform & Name */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Asset Name</Label>
                <Input 
                  value={item.assetName || ''} 
                  onChange={(e) => onUpdate(item.id, { assetName: e.target.value })}
                  placeholder="Enter asset name..."
                  className="bg-slate-950 border-slate-800 text-sm h-10"
                />
              </div>

              <div className="bg-slate-950/50 rounded-xl p-3 sm:p-4 border border-slate-800/50 relative">
                <div className="flex items-center justify-between mb-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={togglePlay}
                    className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                  </Button>
                  <div className="text-[10px] font-mono text-slate-500">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>
                <div ref={waveRef} className="rounded-md overflow-hidden" />
              </div>
            </div>

            {/* Right: Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                  <span className="flex items-center gap-1.5"><Volume2 size={12} /> Volume</span>
                  <span className="text-cyan-400">{Math.round(item.volume * 100)}%</span>
                </div>
                <Slider value={[item.volume * 100]} max={200} step={1} onValueChange={(v) => onUpdate(item.id, { volume: v[0] / 100 })} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                  <span className="flex items-center gap-1.5"><Zap size={12} /> Speed</span>
                  <span className="text-cyan-400">{item.speed}x</span>
                </div>
                <Slider value={[item.speed * 10]} min={5} max={30} step={1} onValueChange={(v) => onUpdate(item.id, { speed: v[0] / 10 })} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                  <span className="flex items-center gap-1.5"><Activity size={12} /> Pitch</span>
                  <span className="text-cyan-400">{item.pitch > 0 ? '+' : ''}{item.pitch}%</span>
                </div>
                <Slider value={[item.pitch + 100]} min={0} max={200} step={1} onValueChange={(v) => onUpdate(item.id, { pitch: v[0] - 100 })} />
              </div>
              <div className="pt-2 lg:pt-4 border-t border-slate-800/50 sm:col-span-2 lg:col-span-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onUpdate(item.id, { volume: 0.05, speed: 2.3 })}
                  className="w-full text-[10px] h-9 bg-cyan-500/5 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 gap-2 font-bold"
                >
                  <Sparkles size={12} /> OPTIMIZE FOR ROBLOX
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
