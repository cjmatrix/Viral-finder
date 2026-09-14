import React, { useState } from 'react';
import UrlInput from './components/UrlInput';
import ClipViewer from './components/ClipViewer';
import PlayerModal from './components/PlayerModal';
import { Flame } from 'lucide-react';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [clips, setClips] = useState([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSearch = async (searchUrl, strategy, clipCount = 4) => {
    setUrl(searchUrl);
    setLoading(true);
    setLoadingStage('Fetching transcript...');
    setClips([]);
    
    try {
      // Fake staging updates for UI since backend doesn't do SSE by default
      setTimeout(() => setLoadingStage('Scoring chunks with Flash LLM...'), 3000);
      setTimeout(() => setLoadingStage(`Refining Top ${clipCount} viral moments with Primary LLM...`), 8000);

      const response = await fetch('http://localhost:5000/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: searchUrl, strategy, clipCount })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze video');
      }

      const data = await response.json();
      setClips(data.clips || []);
      setSelectedClipIndex(0);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  };

  const handleNudge = (type, amount) => {
    setClips(prevClips => {
      const newClips = [...prevClips];
      const clip = { ...newClips[selectedClipIndex] };
      
      if (type === 'start') {
        clip.start_time = Math.max(0, clip.start_time + amount);
      } else if (type === 'end') {
        clip.end_time = Math.max(clip.start_time + 1, clip.end_time + amount);
      }
      
      newClips[selectedClipIndex] = clip;
      return newClips;
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-blue-500/30">
      <header className="border-b border-gray-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-orange-500 to-red-500 p-2 rounded-xl">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              ViralClip Finder
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
            Turn long videos into <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">viral shorts</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Paste a YouTube URL and our dual-stage AI will instantly find, score, and perfectly trim the 4 most viral moments.
          </p>
          
          <UrlInput onSearch={handleSearch} loading={loading} loadingStage={loadingStage} />
        </div>

        {clips.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center gap-4 mb-8 overflow-x-auto pb-4 scrollbar-hide">
              {clips.map((clip, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedClipIndex(index)}
                  className={`flex-shrink-0 px-6 py-3 rounded-full font-medium transition-all ${
                    selectedClipIndex === index 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 scale-105' 
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  #{clip.rank} Pick • {clip.virality_score}/100
                </button>
              ))}
            </div>

            <div className="max-w-3xl mx-auto transition-all duration-500">
              <ClipViewer 
                clip={clips[selectedClipIndex]} 
                onNudge={handleNudge}
                onPreview={() => setModalOpen(true)}
              />
            </div>
          </div>
        )}
      </main>

      {clips.length > 0 && (
        <PlayerModal 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          videoUrl={clips[selectedClipIndex].video_url}
        />
      )}
    </div>
  );
}

export default App;
