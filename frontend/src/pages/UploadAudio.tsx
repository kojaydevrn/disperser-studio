import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Music, ListMusic, Sparkles } from 'lucide-react';
import AudioStudio from './AudioStudio';
import AudioLibrary from './AudioLibrary';

export default function UploadAudio() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="page-header">
        <h1 className="page-title">Audio Studio</h1>
        <p className="page-desc">Prepare and manage your sound assets for Roblox.</p>
      </div>

      <Tabs defaultValue="studio" className="w-full">
        <TabsList className="bg-slate-900/50 border border-slate-800 p-1 h-12 mb-8">
          <TabsTrigger value="studio" className="flex items-center gap-2 px-6 data-[state=active]:bg-cyan-600 data-[state=active]:text-white transition-all">
            <Sparkles size={16} />
            Studio Upload
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2 px-6 data-[state=active]:bg-cyan-600 data-[state=active]:text-white transition-all">
            <ListMusic size={16} />
            Audio Library
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="studio">
          <AudioStudio />
        </TabsContent>
        
        <TabsContent value="library">
          <AudioLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
