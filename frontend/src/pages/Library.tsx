import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/api';
import { Play, Trash2, CloudUpload, Copy, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

export default function Library() {
  const [items, setItems] = useState<any[]>([]);
  const polls = useRef<Record<string, any>>({});

  const refresh = useCallback(async () => {
    setItems(await api.getQueue());
  }, []);

  useEffect(() => {
    refresh();
    return () => Object.values(polls.current).forEach(clearInterval);
  }, [refresh]);

  const startPoll = (id: string, opPath: string) => {
    if (polls.current[id]) return;
    const opId = opPath.split('/').pop();
    polls.current[id] = setInterval(async () => {
      const res = await api.checkOperation(opId!);
      if (res.success && res.operation?.done) {
        const assetId = res.operation.response?.assetId || res.operation.response?.path?.split('/').pop();
        if (assetId) {
          const meta = await api.getAssetMeta(assetId);
          const state = (meta.metadata?.moderationResult?.moderationState || '').trim().toUpperCase();
          if (state === 'REJECTED') {
            clearInterval(polls.current[id]);
            await api.updateItem(id, { status: 'error', errorMessage: 'Rejected by Moderation', assetId });
          } else if (state === 'APPROVED') {
            clearInterval(polls.current[id]);
            await api.updateItem(id, { status: 'success', assetId });
          }
        } else if (res.operation.error) {
          clearInterval(polls.current[id]);
          await api.updateItem(id, { status: 'error', errorMessage: res.operation.error.message });
        }
        refresh();
      }
    }, 5000);
  };

  const handleUpload = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await api.updateItem(id, { status: 'uploading', errorMessage: null });
    refresh();
    try {
      const buffer = await api.getItemBuffer(id);
      const res = await api.robloxUpload(item.name, item.description, buffer!);
      if (res.success && res.operation?.path) {
        await api.updateItem(id, { status: 'processing', operationPath: res.operation.path });
        startPoll(id, res.operation.path);
      } else { throw new Error(res.error || 'Upload failed'); }
    } catch (e: any) {
      await api.updateItem(id, { status: 'error', errorMessage: e.message });
    }
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (polls.current[id]) clearInterval(polls.current[id]);
    await api.deleteItem(id);
    refresh();
  };

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">My Library</h1>
        <p className="page-desc">Manage and track your uploads in real-time</p>
      </header>

      <table className="data-table">
        <thead>
          <tr>
            <th className="th">Asset Details</th>
            <th className="th">Status</th>
            <th className="th">Asset ID</th>
            <th className="th" style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="row">
              <td className="td">
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }}/>
                  {new Date(item.createdAt).toLocaleString()}
                </div>
              </td>
              <td className="td">
                <span className={`badge badge-${item.status}`}>
                  {item.status === 'success' && <CheckCircle2 size={12}/>}
                  {item.status === 'error' && <AlertCircle size={12}/>}
                  {item.status}
                </span>
                {item.errorMessage && <div style={{ color: 'var(--error)', fontSize: '10px', marginTop: '6px' }}>{item.errorMessage}</div>}
              </td>
              <td className="td">
                {item.assetId ? (
                  <div className="assets-id-badge" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => navigator.clipboard.writeText(item.assetId)}>
                    <code>{item.assetId}</code> <Copy size={12}/>
                  </div>
                ) : '-'}
              </td>
              <td className="td" style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  {(item.status === 'pending' || (item.status === 'error' && !item.errorMessage?.includes('Rejected'))) && (
                    <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => handleUpload(item.id)}>
                      <CloudUpload size={14}/> Upload
                    </button>
                  )}
                  <button className="btn btn-outline" style={{ padding: '8px 16px', color: 'var(--error)' }} onClick={() => handleDelete(item.id)}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
