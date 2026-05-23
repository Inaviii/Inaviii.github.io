import React, { useState } from 'react';

const BADGES = {
  'first_match': { title: 'First Blood', desc: 'Complete your first multiplayer match.', icon: '⚔️' },
  'speed_demon': { title: 'Speed Demon', desc: 'Reach 100 WPM in any mode.', icon: '⚡' },
  'zen_master': { title: 'Zen Master', desc: 'Complete a Zen mode session.', icon: '🧘' },
  'time_lord': { title: 'Time Lord', desc: 'Complete a Time Attack session.', icon: '⏳' },
  'scholar': { title: 'Scholar', desc: 'Earn 1,000 Total XP.', icon: '📜' },
};

export default function ProfilePopup({ userProfile, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');

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
            <div className="w-12 h-12 rounded-full bg-mt-main flex items-center justify-center text-mt-bg text-2xl font-bold shadow-[0_0_15px_rgba(226,183,20,0.5)]">
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-3xl font-bold text-mt-text uppercase tracking-widest">{userProfile.name}</h2>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Object.entries(BADGES).map(([id, badge]) => {
                const isUnlocked = (userProfile.badges || []).includes(id);
                return (
                  <div key={id} className={`p-4 rounded-lg border flex flex-col items-center text-center transition-all ${isUnlocked ? 'bg-mt-bg border-mt-main/30 shadow-[0_0_15px_rgba(226,183,20,0.1)]' : 'bg-mt-bg/30 border-mt-sub/10 grayscale opacity-40'}`}>
                    <span className="text-4xl mb-3 drop-shadow-md">{badge.icon}</span>
                    <h4 className={`font-bold text-sm mb-1 ${isUnlocked ? 'text-mt-main' : 'text-mt-sub'}`}>{badge.title}</h4>
                    <p className="text-mt-sub text-[0.65rem] leading-tight">{badge.desc}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
