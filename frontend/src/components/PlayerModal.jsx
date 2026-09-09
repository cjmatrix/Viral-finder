import React from 'react';
import { X } from 'lucide-react';

const PlayerModal = ({ isOpen, onClose, videoUrl }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-[400px] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Clip Preview</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative aspect-[9/16] w-full bg-black flex items-center justify-center">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="text-gray-400 flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mb-2"></div>
              Processing Video...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerModal;
