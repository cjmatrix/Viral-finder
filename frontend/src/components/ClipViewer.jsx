import React from 'react';
import { Play, Clock, Flame, ChevronLeft, ChevronRight, Hash } from 'lucide-react';

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const ClipViewer = ({ clip, onNudge, onPreview }) => {
  const duration = Math.round(clip.end_time - clip.start_time);

  return (
    <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 hover:border-blue-500/50 transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 text-blue-400 font-bold bg-blue-500/10 px-3 py-1 rounded-full">
          <Hash className="w-4 h-4" />
          <span>{clip.rank} Viral Pick</span>
        </div>
        <div className="flex items-center gap-1 text-orange-400 font-bold bg-orange-500/10 px-3 py-1 rounded-full">
          <Flame className="w-4 h-4" />
          <span>{clip.virality_score}/100</span>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-white mb-2">{clip.title}</h3>
      <p className="text-gray-400 text-sm mb-4">{clip.hook}</p>
      
      <div className="bg-gray-900/50 rounded-xl p-4 mb-6">
        <p className="text-gray-300 text-sm italic">"{clip.reason}"</p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-center bg-gray-900 rounded-lg p-3">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wider mb-1">Start Time</span>
            <span className="font-mono text-white text-lg">{formatTime(clip.start_time)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onNudge('start', -5)} className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white" title="-5s">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => onNudge('start', 5)} className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white" title="+5s">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center bg-gray-900 rounded-lg p-3">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wider mb-1">End Time</span>
            <span className="font-mono text-white text-lg">{formatTime(clip.end_time)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onNudge('end', -5)} className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white" title="-5s">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => onNudge('end', 5)} className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white" title="+5s">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-700">
        <div className="flex items-center gap-2 text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">{duration} seconds</span>
        </div>
        <button 
          onClick={onPreview}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          <Play className="w-4 h-4 fill-current" />
          Preview Clip
        </button>
      </div>
    </div>
  );
};

export default ClipViewer;
