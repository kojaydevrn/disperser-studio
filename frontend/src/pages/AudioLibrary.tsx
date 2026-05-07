import React, { useState, useMemo } from 'react';
import { api } from '../api/api';
import { usePollContext } from '../context/PollContext';
import { Helmet } from 'react-helmet-async';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Trash2,
  CloudUpload,
  Copy,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
  Search,
  Loader2,
  Music,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function AudioLibrary() {
  const userStr = localStorage.getItem('disperser_user');
  const user = userStr ? JSON.parse(userStr) : {};
  const currentRole = user.current_role || 'Free';

  const { items, loading, refresh, updateItemLocal, startPoll, logs, addLog, clearLogs } = usePollContext();
  const [search, setSearch] = useState('');
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const hasConfig = localStorage.getItem('disperser_key') && localStorage.getItem('disperser_user_id');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredItems = useMemo(() => {
    return items.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, search]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      approved: items.filter(i => i.status === 'success').length,
      rejected: items.filter(i => i.status === 'rejected').length,
      pending: items.filter(i => i.status === 'pending' || i.status === 'error').length,
    };
  }, [items]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  const handleUpload = async (id: string) => {
    if (!hasConfig) {
      addLog(`[Item:${id}] Upload failed: Roblox configuration (API Key/User ID) missing!`, 'error');
      return;
    }
    const item = items.find(i => i.id === id);
    if (!item) return;

    setUploadingIds(prev => new Set(prev).add(id));
    await api.updateItem(id, { status: 'uploading', errorMessage: null });
    updateItemLocal(id, { status: 'uploading', errorMessage: null });
    addLog(`[Item:${id}] Starting upload process for "${item.name}"...`, 'info');

    try {
      addLog(`[Item:${id}] Preparing secure transfer...`, 'info');
      const signedUrl = await api.getSignedUrl(id);
      if (!signedUrl) throw new Error('Failed to generate source link');

      addLog(`[Item:${id}] Uploading to Roblox (Server-side stream)...`, 'info');
      const res = await api.robloxUploadFromUrl(item.name, item.description || 'Uploaded via Disperser Studio', signedUrl);

      if (res.success && res.operation?.path) {
        addLog(`[Item:${id}] Upload successful! Operation Path: ${res.operation.path}`, 'success');
        await api.updateItem(id, { status: 'processing', operationPath: res.operation.path });
        startPoll(id, res.operation.path);
      } else {
        throw new Error(res.error || 'Upload failed');
      }
    } catch (e: any) {
      addLog(`[Item:${id}] Upload failed: ${e.message}`, 'error');
      await api.updateItem(id, { status: 'error', errorMessage: e.message });
    }

    setUploadingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    refresh(true);
  };

  const handleBulkUpload = async () => {
    const toUpload = Array.from(selectedIds).filter(id => {
      const item = items.find(i => i.id === id);
      return item && (item.status === 'pending' || item.status === 'error');
    });

    if (toUpload.length === 0) return;

    setIsBulkUploading(true);
    setBulkProgress(0);

    try {
      for (let i = 0; i < toUpload.length; i++) {
        setBulkProgress(i + 1);
        await handleUpload(toUpload[i]);
      }
    } catch (e: any) {
      addLog(`Bulk upload interrupted: ${e.message}`, 'error');
    } finally {
      setIsBulkUploading(false);
      setSelectedIds(new Set());
      setBulkProgress(0);
    }
  };

  const handleBulkDelete = async () => {
    for (const id of Array.from(selectedIds)) {
      await api.deleteItem(id);
    }
    setSelectedIds(new Set());
    refresh();
  };

  const handleDelete = async (id: string) => {
    await api.deleteItem(id);
    refresh();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableOnPage = paginatedItems.filter(i => i.status === 'pending' || i.status === 'error');
    if (selectableOnPage.length === 0) return;

    const allSelectableSelected = selectableOnPage.every(i => selectedIds.has(i.id));

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        selectableOnPage.forEach(i => next.delete(i.id));
      } else {
        selectableOnPage.forEach(i => next.add(i.id));
      }
      return next;
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'success':
        return { label: 'Approved', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 size={12} /> };
      case 'reviewing':
        return { label: 'In Review', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <Clock size={12} /> };
      case 'rejected':
        return { label: 'Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <AlertCircle size={12} /> };
      case 'error':
        return { label: 'Error', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <AlertCircle size={12} /> };
      case 'uploading':
        return { label: 'Uploading...', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', icon: <Loader2 size={12} className="animate-spin" /> };
      case 'processing':
        return { label: 'Processing...', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Loader2 size={12} className="animate-spin" /> };
      default:
        return { label: 'Pending', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: <Clock size={12} /> };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <Helmet>
        <title>Audio Library | Disperser Studio</title>
      </Helmet>
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Assets</div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <Music className="text-cyan-500" size={20} />
            {stats.total}
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Approved</div>
          <div className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <CheckCircle2 size={20} />
            {stats.approved}
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Rejected</div>
          <div className="text-2xl font-bold text-red-400 flex items-center gap-2">
            <X size={20} />
            {stats.rejected}
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pending/Error</div>
          <div className="text-2xl font-bold text-amber-400 flex items-center gap-2">
            <Clock size={20} />
            {stats.pending}
          </div>
        </div>
      </div>

      {/* Main Header & Search */}
      {!hasConfig && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="text-amber-400 shrink-0" size={20} />
          <p className="text-sm text-amber-200/80">
            <span className="font-bold text-amber-400">Warning:</span> You haven't configured your Roblox API Key & User ID yet. Upload features will not work until setup is completed in the Settings menu.
          </p>
        </div>
      )}

      <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Audio Assets</h2>
            <p className="text-sm text-slate-500">Manage and track your audio library.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <Input
                placeholder="Search assets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 focus-visible:ring-cyan-500/50"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => refresh()} disabled={loading} className="border-slate-800 bg-slate-950 hover:bg-slate-800">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-900/60">
              <TableRow className="border-slate-800">
                <TableHead className="w-12 px-4">
                  <Checkbox
                    checked={
                      paginatedItems.length > 0 && 
                      paginatedItems.filter(i => i.status === 'pending' || i.status === 'error').length > 0 &&
                      paginatedItems.filter(i => i.status === 'pending' || i.status === 'error').every(i => selectedIds.has(i.id))
                    }
                    onCheckedChange={toggleSelectAll}
                    disabled={currentRole === 'Free' || paginatedItems.filter(i => i.status === 'pending' || i.status === 'error').length === 0}
                  />
                </TableHead>
                <TableHead className="text-slate-300">Asset Details</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300">Roblox ID</TableHead>
                <TableHead className="text-right text-slate-300">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <Music size={32} className="text-slate-800" />
                      <p className="text-sm">No assets found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item) => {
                  const statusCfg = getStatusConfig(item.status);
                  const isUploading = uploadingIds.has(item.id);
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <TableRow key={item.id} className={`border-slate-800 hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-cyan-500/5' : ''}`}>
                      <TableCell className="px-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                          disabled={item.status !== 'pending' && item.status !== 'error'}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="font-semibold text-white truncate max-w-[240px]">{item.name}</div>
                        <div className="text-[12px] text-slate-500 mt-1 flex items-center gap-1">
                          <Clock size={10} /> {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`gap-1.5 text-[10px] py-0 h-5 ${statusCfg.color}`}
                        >
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.assetId ? (
                          <button
                            onClick={() => navigator.clipboard.writeText(item.assetId)}
                            className="group flex items-center gap-2 font-mono text-[12px] text-slate-400 hover:text-cyan-400 transition-colors"
                          >
                            <code>{item.assetId}</code>
                            <Copy size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {(item.status === 'pending' || (item.status === 'error' && !item.errorMessage?.includes('Rejected'))) && (
                            <Button
                              size="sm"
                              onClick={() => handleUpload(item.id)}
                              disabled={isUploading || isBulkUploading}
                              className="h-7 px-3 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] gap-1.5"
                            >
                              {isUploading ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
                              Upload
                            </Button>
                          )}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-slate-900 border-slate-800">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-white">Delete asset?</AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400">Permanently remove "{item.name}"?</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-red-600 text-white">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-xs text-slate-500">
            Showing <span className="text-white font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-white font-medium">{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> of <span className="text-white font-medium">{filteredItems.length}</span> assets
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="bg-slate-950 border-slate-800 text-slate-400 h-8 px-2"
            >
              <ChevronLeft size={16} />
            </Button>

            {Array.from({ length: totalPages }).map((_, i) => (
              <Button
                key={i + 1}
                variant={currentPage === i + 1 ? "secondary" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(i + 1)}
                className={`h-8 w-8 p-0 ${currentPage === i + 1 ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
              >
                {i + 1}
              </Button>
            )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="bg-slate-950 border-slate-800 text-slate-400 h-8 px-2"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-50 animate-in slide-in-from-bottom-8">
          <div className="bg-slate-900/90 border border-cyan-500/30 backdrop-blur-md p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
                <CheckSquare className="text-cyan-400" size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{selectedIds.size} Assets Selected</div>
                <div className="text-[10px] text-slate-400">Apply actions to all selected items</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentRole === 'Free' ? (
                <Button
                  disabled
                  className="bg-slate-800 text-slate-500 text-xs px-4 h-10 gap-2 cursor-not-allowed"
                  title="Bulk Upload is a Pro feature"
                >
                  <CloudUpload size={16} />
                  <span>Upload (Pro Only)</span>
                </Button>
              ) : (
                <Button
                  onClick={handleBulkUpload}
                  disabled={isBulkUploading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-4 h-10 gap-2"
                >
                  {isBulkUploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Uploading {bulkProgress}/{selectedIds.size}...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload size={16} />
                      <span>Upload to Roblox</span>
                    </>
                  )}
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="h-10 px-3 text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={18} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-slate-900 border-slate-800">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Delete {selectedIds.size} assets?</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">Permanently remove all selected items from library?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 text-white">Delete All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedIds(new Set())}
                className="h-8 w-8 text-slate-500 hover:text-white"
              >
                <X size={18} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Logs Section */}
      <ActivityLogs logs={logs} onClear={clearLogs} />
    </div>
  );
}

const ActivityLogs = React.memo(({ logs, onClear }: { logs: any[], onClear: () => void }) => {
  return (
    <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
          <h3 className="text-sm font-semibold text-white">Activity Logs</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 text-xs text-slate-400 hover:text-white"
        >
          Clear Logs
        </Button>
      </div>
      <div className="bg-black/40 rounded border border-slate-800 p-3 h-48 overflow-y-auto font-mono text-[11px] leading-relaxed flex flex-col gap-1">
        {logs.length === 0 ? (
          <span className="text-slate-600 italic">No recent activity...</span>
        ) : (
          logs.map((log) => {
            const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let color = 'text-slate-300';
            if (log.type === 'error') color = 'text-red-400';
            if (log.type === 'success') color = 'text-emerald-400';
            if (log.type === 'warning') color = 'text-amber-400';

            return (
              <div key={log.id} className={`${color}`}>
                <span className="text-slate-600 mr-2">[{time}]</span>
                {log.message}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
