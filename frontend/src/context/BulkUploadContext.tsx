import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/api/api';
import * as Tone from 'tone';
import audioBufferToWav from 'audiobuffer-to-wav';
import { processAudio } from '@/utils/processor';

interface BulkItem {
  id: string;
  name: string;
  source: string;
  type: 'youtube' | 'local';
  status: 'pending' | 'loading' | 'success' | 'error';
  buffer?: Uint8Array;
  error?: string;
  volume: number;
  speed: number;
  pitch: number;
  trim: { start: number; end: number } | null;
  assetName: string;
  file?: File;
}

interface BulkUploadContextType {
  bulkQueue: BulkItem[];
  isBulkProcessing: boolean;
  editingIndex: number | null;
  setEditingIndex: (idx: number | null) => void;
  addToBulkQueue: (items: any[]) => void;
  removeFromBulkQueue: (id: string) => void;
  processBulkQueue: () => Promise<void>;
  updateBulkItem: (id: string, updates: any) => void;
  applyToAll: (type: 'volume' | 'speed' | 'pitch', value: number) => void;
  handleSaveAll: () => Promise<void>;
  clearBulkQueue: () => void;
  loading: boolean;
  loadingMsg: string;
  saveError: string;
  setSaveError: (err: string) => void;
}

const BulkUploadContext = createContext<BulkUploadContextType | undefined>(undefined);

export const BulkUploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bulkQueue, setBulkQueue] = useState<BulkItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const addToBulkQueue = (items: any[]) => {
    setBulkQueue(prev => [...prev, ...items]);
  };

  const clearBulkQueue = () => {
    setBulkQueue([]);
    setEditingIndex(null);
  };

  const removeFromBulkQueue = (id: string) => {
    setBulkQueue(prev => {
      const newQueue = prev.filter(item => item.id !== id);
      if (newQueue.length === 0) setEditingIndex(null);
      return newQueue;
    });
  };

  const updateBulkItem = (id: string, updates: any) => {
    setBulkQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const applyToAll = (type: 'volume' | 'speed' | 'pitch', value: number) => {
    setBulkQueue(prev => prev.map(item => ({ ...item, [type]: value })));
  };

  const processBulkQueue = async () => {
    if (isBulkProcessing) return;
    setIsBulkProcessing(true);

    // We need to work with the latest queue items
    // Use a temporary copy to avoid stale closures in the loop
    const items = [...bulkQueue];

    for (const item of items) {
      if (item.status === 'success') continue;

      setBulkQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'loading' } : i));

      try {
        let buffer: Uint8Array;
        let name = item.name;

        if (item.type === 'youtube') {
          const res = await api.ytDownload(item.source);
          buffer = res.buffer;
          name = res.title;
          await api.addToHistory(res.title, item.source, res.buffer);
        } else if (item.file) {
          const ab = await item.file.arrayBuffer();
          buffer = new Uint8Array(ab);
        } else {
          throw new Error('No source found');
        }

        setBulkQueue(prev => prev.map(i => i.id === item.id ? {
          ...i,
          status: 'success',
          name,
          buffer,
          volume: 1,
          speed: 1,
          pitch: 0,
          trim: null,
          assetName: name
        } : i));
      } catch (e: any) {
        setBulkQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: e.message } : i));
      }
    }

    setIsBulkProcessing(false);
    
    // Auto-open editor if not already open and we have successes
    setBulkQueue(current => {
      if (editingIndex === null && current.some(i => i.status === 'success')) {
        setEditingIndex(0);
      }
      return current;
    });
  };



  const handleSaveAll = async () => {
    const itemsToProcess = bulkQueue.filter(i => i.status === 'success' && i.buffer);
    if (itemsToProcess.length === 0) return;

    setLoading(true);
    setSaveError('');
    await Tone.start();

    try {
      for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        setLoadingMsg(`Processing ${i + 1}/${itemsToProcess.length}: ${item.assetName || item.name}...`);
        
        const audioCtx = new AudioContext();
        const original = await audioCtx.decodeAudioData(item.buffer!.buffer.slice(0) as ArrayBuffer);
        audioCtx.close();

        const finalDuration = ( (item.trim?.end || original.duration) - (item.trim?.start || 0) ) / item.speed;
        if (finalDuration > 420) {
          throw new Error(`Asset "${item.assetName || item.name}" is too long (${Math.floor(finalDuration / 60)}m ${Math.round(finalDuration % 60)}s). Max 7 mins.`);
        }

        const processed = await processAudio(original, {
          volume: item.volume,
          speed: item.speed,
          pitch: item.pitch,
          trimStart: item.trim?.start || 0,
          trimEnd: item.trim?.end || original.duration
        });

        const wav = audioBufferToWav(processed.get()!);
        const wavBlob = new Blob([wav], { type: 'audio/wav' });
        await api.addToQueue(item.assetName || item.name, 'Bulk Upload via Studio', wavBlob);
      }
      
      setBulkQueue([]);
      setEditingIndex(null);
    } catch (e: any) {
      setSaveError('Batch processing failed: ' + e.message);
    }
    setLoading(false);
    setLoadingMsg('');
  };

  return (
    <BulkUploadContext.Provider value={{
      bulkQueue,
      isBulkProcessing,
      editingIndex,
      setEditingIndex,
      addToBulkQueue,
      removeFromBulkQueue,
      processBulkQueue,
      updateBulkItem,
      applyToAll,
      handleSaveAll,
      clearBulkQueue,
      loading,
      loadingMsg,
      saveError,
      setSaveError
    }}>
      {children}
    </BulkUploadContext.Provider>
  );
};

export const useBulkUpload = () => {
  const context = useContext(BulkUploadContext);
  if (context === undefined) {
    throw new Error('useBulkUpload must be used within a BulkUploadProvider');
  }
  return context;
};
