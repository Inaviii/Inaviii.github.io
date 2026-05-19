import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function Leaderboard() {
  const [scores, setScores] = useState({ passage: [], time30: [], time60: [], time120: [], ranked: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ranked');
  const playerId = localStorage.getItem('latintype_pid');

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const scoresRef = collection(db, "scores");

        const categories = [
          { key: 'passage', mode: 'passage', duration: null },
          { key: 'time30', mode: 'time', duration: 30 },
          { key: 'time60', mode: 'time', duration: 60 },
          { key: 'time120', mode: 'time', duration: 120 }
        ];

        const results = {};

        // use promise.all to fetch all categories in parallel
        await Promise.all(categories.map(async (cat) => {
          try {
            let q;
            if (cat.mode === 'passage') {
              q = query(scoresRef, where("mode", "==", "passage"), orderBy("wpm", "desc"), limit(50));
            } else {
              q = query(scoresRef, where("mode", "==", "time"), where("duration", "==", cat.duration), orderBy("wpm", "desc"), limit(50));
            }
            const querySnapshot = await getDocs(q);
            results[cat.key] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (e) {
            console.error(`Error fetching category ${cat.key}:`, e);
            results[cat.key] = [];
          }
        }));

        try {
          const usersRef = collection(db, "users");
          const rankedQ = query(usersRef, orderBy("elo", "desc"), limit(50));
          const rankedSnap = await getDocs(rankedQ);
          results['ranked'] = rankedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
          console.error("Error fetching ranked leaderboard (check Firestore rules for 'users' collection):", e);
          results['ranked'] = [];
        }

        setScores(results);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchScores();
  }, []);

  const renderTable = (data) => {
    if (!data || data.length === 0) return <div className="text-mt-sub mt-16 text-center italic text-lg">No scores yet for this mode. Be the first to claim glory!</div>;

    return (
      <div className="w-full mt-6 overflow-hidden rounded-lg shadow-lg border border-mt-sub/20 bg-mt-bg/80 backdrop-blur-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-mt-sub-alt/60 text-mt-sub text-sm uppercase tracking-wider">
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 w-16 text-center">#</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20">Name</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 text-right">WPM</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 text-right">Accuracy</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 text-right hidden sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mt-sub/10">
            {data.map((score, index) => (
              <tr key={score.id} className="hover:bg-mt-sub-alt/40 transition-colors">
                <td className="px-6 py-5 text-center font-bold text-mt-sub">{index + 1}</td>
                <td className="px-6 py-5 font-bold text-mt-text">
                  <div className="truncate max-w-[150px] sm:max-w-[300px]">{score.name || "Anonymous"}</div>
                  {score.passage && <div className="text-xs text-mt-sub/80 truncate max-w-[150px] sm:max-w-[300px] mt-1 font-normal">{score.passage}</div>}
                </td>
                <td className="px-6 py-5 text-right font-light text-2xl text-mt-main">{score.wpm}</td>
                <td className="px-6 py-5 text-right text-mt-text font-mono">{score.acc}%</td>
                <td className="px-6 py-5 text-right text-mt-sub/80 text-sm hidden sm:table-cell">
                  {new Date(score.date).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRankedTable = (data) => {
    if (!data || data.length === 0) return <div className="text-mt-sub mt-16 text-center italic text-lg">No ranked players yet. Be the first!</div>;

    return (
      <div className="w-full mt-6 overflow-hidden rounded-lg shadow-lg border border-mt-sub/20 bg-mt-bg/80 backdrop-blur-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-mt-sub-alt/60 text-mt-sub text-sm uppercase tracking-wider">
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 w-16 text-center">#</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20">Name</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 text-right">Record</th>
              <th className="px-6 py-4 font-bold border-b border-mt-sub/20 text-right">Elo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mt-sub/10">
            {data.map((user, index) => {
              const rankedName = localStorage.getItem('latintype_ranked_name');
              const isCurrentUser = user.id === rankedName;
              return (
                <tr key={user.id} className={`hover:bg-mt-sub-alt/40 transition-colors ${isCurrentUser ? 'bg-mt-main/20 border-l-4 border-l-mt-main' : ''}`}>
                  <td className={`px-6 py-5 text-center font-bold ${index < 3 ? 'text-mt-main' : 'text-mt-sub'}`}>{index + 1}</td>
                  <td className="px-6 py-5 font-bold text-mt-text truncate max-w-[150px] sm:max-w-[300px]">
                    {user.name}
                  </td>
                  <td className="px-6 py-5 text-right font-mono text-mt-sub text-sm">{user.wins}W - {user.losses}L</td>
                  <td className="px-6 py-5 text-right text-mt-main font-bold text-2xl">{user.elo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col items-center pt-8 pb-16 font-mono tracking-wide relative z-10">
      <div className="w-full max-w-4xl flex flex-col px-4">
        <div className="flex items-baseline mb-8 border-b border-mt-sub/20 pb-4">
          <h1 className="text-4xl font-bold text-mt-text tracking-tighter">
            latin<span className="text-mt-main">type</span>
          </h1>
          <span className="text-mt-sub font-light text-2xl ml-4 tracking-widest uppercase">Leaderboards</span>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={() => setActiveTab('ranked')} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'ranked' ? 'bg-mt-main text-mt-bg shadow-[0_0_15px_rgba(226,183,20,0.3)]' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text hover:bg-mt-sub-alt/80'}`}>🏆 Ranked Multiplayer</button>
          <button onClick={() => setActiveTab('time30')} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'time30' ? 'bg-mt-main text-mt-bg shadow-[0_0_15px_rgba(226,183,20,0.3)]' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text hover:bg-mt-sub-alt/80'}`}>30s Time Attack</button>
          <button onClick={() => setActiveTab('time60')} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'time60' ? 'bg-mt-main text-mt-bg shadow-[0_0_15px_rgba(226,183,20,0.3)]' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text hover:bg-mt-sub-alt/80'}`}>60s Time Attack</button>
          <button onClick={() => setActiveTab('time120')} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'time120' ? 'bg-mt-main text-mt-bg shadow-[0_0_15px_rgba(226,183,20,0.3)]' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text hover:bg-mt-sub-alt/80'}`}>120s Time Attack</button>
          <button onClick={() => setActiveTab('passage')} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${activeTab === 'passage' ? 'bg-mt-main text-mt-bg shadow-[0_0_15px_rgba(226,183,20,0.3)]' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text hover:bg-mt-sub-alt/80'}`}>Passage Mode</button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-32">
            <span className="text-mt-main animate-pulse font-bold tracking-widest uppercase text-xl">Fetching Scrolls...</span>
          </div>
        ) : (
          activeTab === 'ranked' ? renderRankedTable(scores['ranked']) : renderTable(scores[activeTab])
        )}
      </div>
    </div>
  );
}
