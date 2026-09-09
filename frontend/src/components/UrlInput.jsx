import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

const UrlInput = ({ onSearch, loading, loadingStage }) => {
  const [url, setUrl] = useState('');
  const [strategy, setStrategy] = useState('standard');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSearch(url.trim(), strategy);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative flex items-center">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube URL here..."
            className="w-full px-6 py-4 rounded-full bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-lg"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="absolute right-2 px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Find Viral Clips
          </button>
        </div>
        
        <div className="flex items-center justify-center gap-4 text-gray-300">
          <label htmlFor="strategy" className="font-medium">Video Style:</label>
          <select 
            id="strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            disabled={loading}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="standard">Standard Portrait (Crop)</option>
            <option value="split-screen">Split-Screen Gameplay</option>
            <option value="story-mode">🎬 Story Mode (Multi-Segment)</option>
          </select>
        </div>
      </form>
      
      {loading && (
        <div className="mt-4 flex items-center justify-center gap-3 text-blue-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-medium animate-pulse">{loadingStage || 'Processing...'}</span>
        </div>
      )}
    </div>
  );
};

export default UrlInput;
