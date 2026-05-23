import { useState } from 'react';
import TypingTest from './components/typingtest'
import ReadMode from './components/ReadMode'
import Leaderboard from './components/Leaderboard'

function App() {
  const [currentPage, setCurrentPage] = useState('test');
  const [ghostData, setGhostData] = useState(null);

  return (
    <div className="App min-h-screen bg-mt-bg text-mt-text relative">
      <nav className="absolute top-4 left-4 sm:top-8 sm:left-8 z-50 flex gap-6 bg-mt-bg/80 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg border border-mt-sub/10">
        <button 
          onClick={() => { setGhostData(null); setCurrentPage('test'); }}
          className={`font-bold uppercase tracking-widest text-xs transition-all duration-300 ${currentPage === 'test' ? 'text-mt-main drop-shadow-[0_0_8px_rgba(226,183,20,0.5)]' : 'text-mt-sub hover:text-mt-text'}`}
        >
          Type
        </button>
        <button 
          onClick={() => setCurrentPage('read')}
          className={`font-bold uppercase tracking-widest text-xs transition-all duration-300 ${currentPage === 'read' ? 'text-mt-main drop-shadow-[0_0_8px_rgba(226,183,20,0.5)]' : 'text-mt-sub hover:text-mt-text'}`}
        >
          Read
        </button>
        <button 
          onClick={() => setCurrentPage('leaderboard')}
          className={`font-bold uppercase tracking-widest text-xs transition-all duration-300 ${currentPage === 'leaderboard' ? 'text-mt-main drop-shadow-[0_0_8px_rgba(226,183,20,0.5)]' : 'text-mt-sub hover:text-mt-text'}`}
        >
          Leaderboards
        </button>
      </nav>
      {currentPage === 'test' ? <TypingTest ghostData={ghostData} setGhostData={setGhostData} /> : currentPage === 'read' ? <ReadMode /> : <Leaderboard onPlayAgainst={(ghost) => { setGhostData(ghost); setCurrentPage('test'); }} />}
    </div>
  )
}

export default App