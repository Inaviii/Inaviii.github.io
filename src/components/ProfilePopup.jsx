import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DECORATIONS = [
  { id: 'none', level: 1, name: 'Standard' },
  { id: 'bronze', level: 3, name: 'Bronze Ring', class: 'ring-4 ring-[#cd7f32] shadow-[0_0_15px_rgba(205,127,50,0.5)]' },
  { id: 'silver', level: 6, name: 'Silver Ring', class: 'ring-4 ring-[#c0c0c0] shadow-[0_0_15px_rgba(192,192,192,0.5)]' },
  { id: 'gold', level: 12, name: 'Gold Laurel', class: 'ring-4 ring-[#e2b714] shadow-[0_0_15px_rgba(226,183,20,0.5)]' },
  { id: 'imperial', level: 15, name: 'Imperial Glow', class: 'ring-4 ring-[#800080] shadow-[0_0_25px_rgba(128,0,128,0.8)] animate-[pulse_2s_ease-in-out_infinite]' },
];

export const CURSORS = [
  { id: 'line', level: 1, name: 'Standard Line', icon: '|' },
  { id: 'underline', level: 2, name: 'Underline', icon: '_' },
  { id: 'block', level: 5, name: 'Block', icon: '█' },
];

export const BADGES = {
  'first_match': { title: 'First Blood', desc: 'Complete your first multiplayer match.', icon: '⚔️' },
  'speed_demon': { title: 'Speed Demon', desc: 'Reach 100 WPM in any mode.', icon: '⚡' },
  'zen_master': { title: 'Zen Master', desc: 'Complete a Zen mode session.', icon: '🧘' },
  'time_lord': { title: 'Time Lord', desc: 'Complete a Time Attack session.', icon: '⏳' },
  'scholar': { title: 'Scholar', desc: 'Earn 1,000 Total XP.', icon: '📜' },
};

export default function ProfilePopup({ userProfile, isCurrentUser, cursorStyle, setCursorStyle, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [localDecoration, setLocalDecoration] = useState(userProfile.profileDecoration || 'none');
  const [activeTitle, setActiveTitle] = useState(userProfile.activeTitle || null);

  const handleSetTitle = async (id) => {
    if (!isCurrentUser) return;
    const newTitle = activeTitle === id ? null : id; // Toggle off if clicked again
    setActiveTitle(newTitle);
    try {
      const docRef = doc(db, 'users', userProfile.name.toLowerCase());
      await updateDoc(docRef, { activeTitle: newTitle });
      userProfile.activeTitle = newTitle;
    } catch (e) {
      console.error("Failed to update active title", e);
    }
  };

  const handleSetDecoration = async (id) => {
    setLocalDecoration(id);
    if (isCurrentUser) {
      try {
        const docRef = doc(db, 'users', userProfile.name.toLowerCase());
        await updateDoc(docRef, { profileDecoration: id });
        userProfile.profileDecoration = id;
      } catch (e) {
        console.error("Failed to update profile decoration", e);
      }
    }
  };

  const handleSetCursor = (id) => {
    if (setCursorStyle) setCursorStyle(id);
    localStorage.setItem('cursorStyle', id);
  };

  useEffect(() => {
    if (activeTab === 'history' && history === null) {
      const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
          const q = query(
            collection(db, 'scores'),
            where('name', '==', userProfile.name),
            orderBy('timestamp', 'desc'),
            limit(10)
          );
          const snap = await getDocs(q);
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          setHistory(docs);
        } catch (e) {
          console.error("Failed to fetch history", e);
        } finally {
          setLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [activeTab, history, userProfile.name]);

  const xp = userProfile.xp || 0;
  const level = userProfile.level || 1;
  const prevLevelXp = Math.pow(level - 1, 2) * 100;
  const nextLevelXp = Math.pow(level, 2) * 100;
  const progress = Math.max(0, Math.min(100, ((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-mt-bg/80 backdrop-blur-md" onClick={onClose}>
      <div 
        className="bg-mt-sub-alt p-6 sm:p-8 rounded-xl shadow-2xl border border-mt-sub/20 max-w-2xl w-full mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full bg-mt-main flex items-center justify-center text-mt-bg text-2xl font-bold shrink-0 ${DECORATIONS.find(d => d.id === (isCurrentUser ? localDecoration : (userProfile.profileDecoration || 'none')))?.class || 'shadow-[0_0_15px_rgba(226,183,20,0.5)]'}`}>
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-mt-main uppercase tracking-widest flex items-center gap-2">
                {userProfile.name}
                {userProfile.crowns > 0 && <span className="text-xl" title={`${userProfile.crowns} Daily Challenge Wins`}>{Array(userProfile.crowns).fill('👑').join('')}</span>}
              </h2>
              {activeTitle && BADGES[activeTitle] ? (
                <p className="text-mt-sub text-sm font-bold tracking-widest uppercase flex items-center gap-2 mt-1">
                  <span className="text-lg leading-none">{BADGES[activeTitle].icon}</span> <span className="text-mt-text">{BADGES[activeTitle].title}</span>
                </p>
              ) : (
                <p className="text-mt-sub text-xs font-mono uppercase mt-1">Level {level} Typist</p>
              )}
              <p className="text-mt-sub text-sm font-mono mt-1">Global Elo: <span className="text-mt-main font-bold">{userProfile.elo}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-mt-sub hover:text-mt-error text-2xl transition-colors">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-mt-sub/20 mb-6">
          <button 
            className={`pb-3 font-bold uppercase tracking-widest text-sm transition-colors ${activeTab === 'overview' ? 'text-mt-main border-b-2 border-mt-main' : 'text-mt-sub hover:text-mt-text'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`pb-3 font-bold uppercase tracking-widest text-sm transition-colors ${activeTab === 'badges' ? 'text-mt-main border-b-2 border-mt-main' : 'text-mt-sub hover:text-mt-text'}`}
            onClick={() => setActiveTab('badges')}
          >
            Badges
          </button>
          <button 
            className={`pb-3 font-bold uppercase tracking-widest text-sm transition-colors ${activeTab === 'history' ? 'text-mt-main border-b-2 border-mt-main' : 'text-mt-sub hover:text-mt-text'}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          {isCurrentUser && (
            <button 
              className={`pb-3 font-bold uppercase tracking-widest text-sm transition-colors ${activeTab === 'armory' ? 'text-mt-main border-b-2 border-mt-main' : 'text-mt-sub hover:text-mt-text'}`}
              onClick={() => setActiveTab('armory')}
            >
              Armory
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-[300px]">
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-6">
              <div className="bg-mt-bg p-6 rounded-lg border border-mt-sub/10">
                <div className="flex justify-between items-end mb-2">
                  <span className="font-bold text-mt-text text-lg uppercase tracking-widest">Level {level}</span>
                  <span className="text-mt-sub text-xs font-mono">{xp} / {nextLevelXp} XP</span>
                </div>
                <div className="w-full bg-mt-sub-alt rounded-full h-3 overflow-hidden shadow-inner">
                  <div className="bg-mt-main h-full transition-all duration-1000 shadow-[0_0_10px_rgba(226,183,20,0.8)]" style={{ width: `${progress}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-mt-bg p-4 rounded-lg border border-mt-sub/10 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-bold text-mt-main mb-1">{userProfile.wins}</span>
                  <span className="text-mt-sub text-xs uppercase tracking-widest">Wins</span>
                </div>
                <div className="bg-mt-bg p-4 rounded-lg border border-mt-sub/10 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-bold text-mt-error mb-1">{userProfile.losses}</span>
                  <span className="text-mt-sub text-xs uppercase tracking-widest">Losses</span>
                </div>
                <div className="bg-mt-bg p-4 rounded-lg border border-mt-sub/10 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-bold text-mt-text mb-1">{userProfile.draws || 0}</span>
                  <span className="text-mt-sub text-xs uppercase tracking-widest">Draws</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'badges' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(BADGES).map(([id, badge]) => {
                const isUnlocked = (userProfile.badges || []).includes(id);
                const isEquipped = activeTitle === id;
                return (
                  <div 
                    key={id} 
                    onClick={() => { if (isUnlocked && isCurrentUser) handleSetTitle(id); }}
                    className={`p-4 rounded-lg border flex flex-col items-center text-center transition-all ${isUnlocked ? 'bg-mt-bg hover:border-mt-main/50' : 'bg-mt-bg/30 border-mt-sub/10 grayscale opacity-40'} ${isEquipped ? 'border-mt-main shadow-[0_0_15px_rgba(226,183,20,0.2)] bg-mt-main/10' : 'border-mt-sub/30'} ${isCurrentUser && isUnlocked ? 'cursor-pointer hover:-translate-y-1' : ''}`}
                  >
                    <span className="text-4xl mb-3 drop-shadow-md">{badge.icon}</span>
                    <h4 className={`font-bold text-sm mb-1 ${isEquipped ? 'text-mt-main' : isUnlocked ? 'text-mt-text' : 'text-mt-sub'}`}>{badge.title}</h4>
                    <p className="text-mt-sub text-[0.65rem] leading-tight">{badge.desc}</p>
                    {isEquipped && <span className="text-mt-main text-[0.65rem] font-bold uppercase tracking-widest mt-3">✓ Equipped</span>}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'armory' && isCurrentUser && (
            <div className="flex flex-col gap-8 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              <div>
                <h3 className="text-xl font-bold text-mt-text uppercase tracking-widest mb-4">Cursor Styles</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {CURSORS.map(cursor => {
                    const isUnlocked = level >= cursor.level;
                    const isActive = cursorStyle === cursor.id;
                    return (
                      <button 
                        key={cursor.id}
                        disabled={!isUnlocked}
                        onClick={() => handleSetCursor(cursor.id)}
                        className={`p-4 rounded-lg border flex flex-col items-center text-center transition-all ${!isUnlocked ? 'bg-mt-bg/30 border-mt-sub/10 grayscale opacity-40 cursor-not-allowed' : isActive ? 'bg-mt-main/20 border-mt-main shadow-[0_0_15px_rgba(226,183,20,0.2)]' : 'bg-mt-bg border-mt-sub/30 hover:border-mt-main/50 hover:-translate-y-1'}`}
                      >
                        <span className={`text-3xl mb-2 font-mono h-10 flex items-center justify-center ${isActive ? 'text-mt-main' : 'text-mt-text'}`}>{cursor.icon}</span>
                        <h4 className={`font-bold text-xs uppercase ${isActive ? 'text-mt-main' : 'text-mt-sub'}`}>{cursor.name}</h4>
                        {!isUnlocked && <span className="text-[0.6rem] font-mono text-mt-error mt-2 tracking-widest">🔒 LVL {cursor.level}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-mt-text uppercase tracking-widest mb-4">Profile Borders</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {DECORATIONS.map(deco => {
                    const isUnlocked = level >= deco.level;
                    const isActive = localDecoration === deco.id;
                    return (
                      <button 
                        key={deco.id}
                        disabled={!isUnlocked}
                        onClick={() => handleSetDecoration(deco.id)}
                        className={`p-4 rounded-lg border flex flex-col items-center text-center transition-all ${!isUnlocked ? 'bg-mt-bg/30 border-mt-sub/10 grayscale opacity-40 cursor-not-allowed' : isActive ? 'bg-mt-main/20 border-mt-main shadow-[0_0_15px_rgba(226,183,20,0.2)]' : 'bg-mt-bg border-mt-sub/30 hover:border-mt-main/50 hover:-translate-y-1'}`}
                      >
                        <div className={`w-10 h-10 rounded-full bg-mt-main flex items-center justify-center text-mt-bg text-xl font-bold mb-4 shrink-0 ${deco.class}`}>
                          {userProfile.name.charAt(0).toUpperCase()}
                        </div>
                        <h4 className={`font-bold text-xs uppercase leading-tight ${isActive ? 'text-mt-main' : 'text-mt-sub'}`}>{deco.name}</h4>
                        {!isUnlocked && <span className="text-[0.6rem] font-mono text-mt-error mt-2 tracking-widest">🔒 LVL {deco.level}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex flex-col gap-3 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {loadingHistory ? (
                <div className="text-center py-12 text-mt-sub animate-pulse font-mono uppercase tracking-widest text-sm">Loading Archives...</div>
              ) : history && history.length > 0 ? (
                history.map(score => (
                  <div key={score.id} className="bg-mt-bg p-4 rounded-lg border border-mt-sub/10 flex justify-between items-center hover:border-mt-sub/30 transition-colors shrink-0">
                    <div>
                      <h4 className="font-bold text-mt-text uppercase tracking-widest text-sm">
                        {score.mode === 'time' ? `${score.duration}s Time Attack` : score.mode === 'passage' ? 'Passage Mode' : score.mode}
                      </h4>
                      <p className="text-mt-sub/80 text-xs font-mono mt-1">
                        {score.passage || new Date(score.timestamp?.toDate() || score.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-light text-mt-main leading-none">{score.wpm}</div>
                      <div className="text-[0.65rem] text-mt-sub font-mono uppercase tracking-widest mt-1">{score.acc}% Acc</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-mt-sub/50 italic">No public records found.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
