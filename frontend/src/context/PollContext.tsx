import React, { createContext, useContext, useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { api } from '../api/api';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface PollContextType {
  startPoll: (id: string, opPath: string) => void;
  refresh: (silent?: boolean) => Promise<any[]>;
  updateItemLocal: (id: string, updates: any) => void;
  items: any[];
  loading: boolean;
  logs: LogEntry[];
  addLog: (message: string, type?: LogEntry['type']) => void;
  clearLogs: () => void;
}

const PollContext = createContext<PollContextType | null>(null);

export const usePollContext = () => {
  const ctx = useContext(PollContext);
  if (!ctx) throw new Error('usePollContext must be used within PollProvider');
  return ctx;
};

export const PollProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const polls = useRef<Record<string, any>>({});

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(),
      timestamp: Date.now(),
      message,
      type
    }].slice(-50)); // Keep last 50 logs
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const updateItemLocal = useCallback((id: string, updates: any) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  }, []);

  const refresh = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getQueue();
      setItems(data);
      return data;
    } catch (e) {
      console.error('Queue refresh failed:', e);
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const startPoll = useCallback((id: string, opPath: string) => {
    if (polls.current[id]) return;
    const isOperation = opPath.includes('operations/');
    const resourceId = opPath.split('/').pop();

    addLog(`[Item:${id}] Starting poll for ${isOperation ? 'operation' : 'asset'}: ${resourceId}`, 'info');

    polls.current[id] = setInterval(async () => {
      try {
        let assetId = !isOperation ? resourceId : null;

        if (isOperation) {
          const res = await api.checkOperation(resourceId!);

          if (!res.success) {
            addLog(`[Item:${id}] Operation check failed: ${res.error}`, 'error');
            return;
          }

          const op = res.operation;
          if (!op) return;

          assetId = op.response?.assetId
            || op.metadata?.assetId
            || op.response?.asset_id
            || op.metadata?.asset_id
            || op.response?.path?.split('/').pop()
            || op.assetId
            || op.asset_id
            || op.path?.replace('assets/', '');

          const isDone = op.done === true || op.done === 'true' || !!op.response || !!op.error || !!assetId;

          if (!isDone) return;

          if (op.error) {
            console.error(`[DEBUG] Poll Item:${id} Operation reported error:`, op.error);
            addLog(`[Item:${id}] Operation error: ${op.error.message || JSON.stringify(op.error)}`, 'error');
            clearInterval(polls.current[id]);
            delete polls.current[id];
            await api.updateItem(id, { status: 'error', errorMessage: op.error.message || 'Upload operation failed' });
            updateItemLocal(id, { status: 'error', errorMessage: op.error.message || 'Upload operation failed' });
            return;
          }
        }

        if (!assetId) {
          if (isOperation) {
            addLog(`[Item:${id}] Operation done but no assetId found.`, 'warning');
            clearInterval(polls.current[id]);
            delete polls.current[id];
            await api.updateItem(id, { status: 'success' });
            updateItemLocal(id, { status: 'success' });
          }
          return;
        }

        // Check moderation
        addLog(`[Item:${id}] Checking moderation status for asset: ${assetId}`, 'info');
        const metaRes = await api.getAssetMeta(assetId!);

        const robloxData = metaRes?.metadata || metaRes?.data || metaRes;
        const moderationResult = robloxData?.moderationResult || robloxData?.moderation_result;

        const moderationState = (moderationResult?.moderationState || moderationResult?.moderation_state || '').trim().toLowerCase();

        addLog(`[Item:${id}] Moderation state detected: "${moderationState || 'unknown'}"`, 'info');

        if (moderationState === 'approved' || moderationState === 'moderation_state_approved') {
          clearInterval(polls.current[id]);
          delete polls.current[id];

          await api.updateItem(id, { status: 'success', assetId });
          await api.deleteFileOnly(id);
          updateItemLocal(id, { status: 'success', assetId });
          addLog(`[Item:${id}] Approved by Roblox!`, 'success');
        } else if (moderationState === 'rejected' || moderationState === 'moderation_state_rejected') {
          clearInterval(polls.current[id]);
          delete polls.current[id];
          await api.updateItem(id, { status: 'rejected', errorMessage: 'Rejected by Roblox Moderation', assetId });
          await api.deleteFileOnly(id);
          updateItemLocal(id, { status: 'rejected', errorMessage: 'Rejected by Roblox Moderation', assetId });
          addLog(`[Item:${id}] Rejected by Roblox.`, 'error');
        } else if (moderationState === 'reviewing' || moderationState === 'moderation_state_reviewing') {
          updateItemLocal(id, { status: 'reviewing', assetId });
        } else {
          updateItemLocal(id, { assetId });
        }
      } catch (e: any) {
        addLog(`[Item:${id}] Error during poll: ${e.message}`, 'error');
      }
    }, 20000);
  }, [addLog, updateItemLocal]);

  // On mount: refresh + auto-resume any items stuck in processing
  useEffect(() => {
    const init = async () => {
      const data = await refresh();
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          if ((item.status === 'processing' || item.status === 'reviewing') && item.operationPath) {
            startPoll(item.id, item.operationPath);
          }
        });
      }
    };
    init();

    // Background refresh every 30s (silent)
    const interval = setInterval(() => refresh(true), 30000);

    return () => {
      clearInterval(interval);
      // Don't clear polls on unmount — this provider should live at the app root
    };
  }, [refresh, startPoll]);

  const value = useMemo(() => ({
    startPoll,
    refresh,
    updateItemLocal,
    items,
    loading,
    logs,
    addLog,
    clearLogs
  }), [startPoll, refresh, updateItemLocal, items, loading, logs, addLog, clearLogs]);

  return (
    <PollContext.Provider value={value}>
      {children}
    </PollContext.Provider>
  );
};
