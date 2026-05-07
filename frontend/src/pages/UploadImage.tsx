import React from 'react';
import { Card } from '@/components/ui/card';
import { Image as ImageIcon, Upload, FileWarning } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export default function UploadImage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Helmet>
        <title>Upload Image | Disperser Studio</title>
      </Helmet>
      <div className="page-header">
        <h1 className="page-title">Upload Images</h1>
        <p className="page-desc">Bulk upload decals, textures, and sprites to Roblox.</p>
      </div>

      <Card className="bg-slate-900/40 border-slate-800 border-dashed p-20 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-6">
          <ImageIcon size={40} className="text-cyan-400 opacity-50" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Image Uploader Coming Soon</h2>
        <p className="text-slate-500 max-w-sm mb-8">
          We are currently focusing on the Audio Studio. Image support will be added in the next major update.
        </p>
        <div className="flex items-center gap-2 text-amber-500 text-sm bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/20">
          <FileWarning size={16} />
          <span>Priority: Audio Preparation</span>
        </div>
      </Card>
    </div>
  );
}
