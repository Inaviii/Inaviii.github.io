import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, addDoc, query, where, getDocs, updateDoc, onSnapshot, doc, setDoc, getDoc, orderBy, limit, deleteDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import DictionaryPopup from './DictionaryPopup';
import ProfilePopup, { DECORATIONS, BADGES } from './ProfilePopup';

const backgrounds = [
  { name: "None (Solid Dark)", url: "none" },
  { name: "Marble", url: "/bg-statue.jpg" },
  { name: "Colliseum", url: "/bg-forum.jpg" },
  { name: "Papyrus", url: "/bg-manuscript.jpg" },
  { name: "Library", url: "/bg-library.jpg" }
];

const fonts = [
  { name: "Cutive Mono", value: '"Cutive Mono", monospace' },
  { name: "Courier Prime", value: '"Courier Prime", monospace' },
  { name: "Syne Mono", value: '"Syne Mono", monospace' },
  { name: "Courier New", value: '"Courier New", Courier, monospace' },
  { name: "Consolas", value: 'Consolas, monospace' },
  { name: "Lucida Console", value: '"Lucida Console", Monaco, monospace' },
  { name: "OpenDyslexic", value: '"OpenDyslexic", sans-serif' },
];

const normalizeChar = (char) => char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const getVowelIndices = (word, wordScansion = "") => {
  const normalized = word.toLowerCase();
  const vowels = ['a', 'e', 'i', 'o', 'u', 'y', 'ā', 'ē', 'ī', 'ō', 'ū', 'ȳ'];
  
  const rawIndices = [];
  for (let i = 0; i < normalized.length; i++) {
    if (vowels.includes(normalized[i])) {
      if ((normalized[i] === 'u' || normalized[i] === 'ū') && i > 0 && normalized[i - 1] === 'q') continue;
      rawIndices.push(i);
    }
  }

  const marksCount = wordScansion.replace(/ /g, '').length;
  if (marksCount > 0 && rawIndices.length === marksCount) {
    return rawIndices;
  }

  const groupedIndices = [];
  for (let i = 0; i < normalized.length; i++) {
    if (vowels.includes(normalized[i])) {
      if ((normalized[i] === 'u' || normalized[i] === 'ū') && i > 0 && normalized[i - 1] === 'q') continue;
      if (i > 0 && groupedIndices.includes(i - 1)) {
        const pair = normalized[i - 1] + normalized[i];
        if (['ae', 'au', 'oe'].includes(pair)) continue;
      }
      groupedIndices.push(i);
    }
  }
  return groupedIndices;
};

const isDiphthongStart = (word, cIdx, vowelIndices) => {
  const normalized = word.toLowerCase();
  if (cIdx >= normalized.length - 1) return false;
  const pair = normalized[cIdx] + normalized[cIdx + 1];
  const diphthongs = ['ae', 'au', 'oe', 'ei', 'eu', 'ui'];
  const vowels = ['a', 'e', 'i', 'o', 'u', 'y', 'ā', 'ē', 'ī', 'ō', 'ū', 'ȳ'];
  
  return vowels.includes(normalized[cIdx]) && 
         vowels.includes(normalized[cIdx + 1]) && 
         diphthongs.includes(pair) && 
         vowelIndices.includes(cIdx) && 
         !vowelIndices.includes(cIdx + 1);
};

export default function TypingTest() {
  // lazy loading architecture state
  const [libraryIndex, setLibraryIndex] = useState(null);
  const [activeAuthorData, setActiveAuthorData] = useState([]);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFetchingAuthor, setIsFetchingAuthor] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);

  // time attack mode state
  const [testMode, setTestMode] = useState('passage'); // 'passage', 'time', 'zen', 'multiplayer'
  const [timeLimit, setTimeLimit] = useState(60);
  const [timeRemaining, setTimeRemaining] = useState(null);

  // multiplayer state
  const [isQueueing, setIsQueueing] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [playerId, setPlayerId] = useState(() => {
    let id = localStorage.getItem('latintype_pid');
    if (!id) { id = 'p_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('latintype_pid', id); }
    return id;
  });
  const [opponentId, setOpponentId] = useState(null);
  const [matchStatus, setMatchStatus] = useState(null); // 'waiting', 'playing', 'finished'
  const [matchFoundData, setMatchFoundData] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [multiplayerCountdown, setMultiplayerCountdown] = useState(null);
  const [opponentProfile, setOpponentProfile] = useState(null);
  const [eloChange, setEloChange] = useState(null);

  // user profile state
  const [userProfile, setUserProfile] = useState(null);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [tempUsername, setTempUsername] = useState('');

  // cascading selection state
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [selectedWork, setSelectedWork] = useState('');
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [loadedPieceId, setLoadedPieceId] = useState(null);
  const [lineRange, setLineRange] = useState({ start: 1, end: 1, max: 1 });

  // engine state
  const [lines, setLines] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [typedHistory, setTypedHistory] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [xpAwarded, setXpAwarded] = useState(false);

  // options & analytics state
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('bgImage') || backgrounds[1].url);
  const [bgOpacity, setBgOpacity] = useState(() => { const v = localStorage.getItem('bgOpacity'); return v !== null ? parseFloat(v) : 0.15; });
  const [volume, setVolume] = useState(() => { const v = localStorage.getItem('volume'); return v !== null ? parseFloat(v) : 0.2; });
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('fontFamily') || fonts.find(f => f.name === 'Syne Mono')?.value || fonts[0].value);
  const [fontSize, setFontSize] = useState(() => { const v = localStorage.getItem('fontSize'); return v !== null ? parseInt(v) : 36; });
  const [showScansion, setShowScansion] = useState(() => { const v = localStorage.getItem('showScansion'); return v !== null ? v === 'true' : true; });
  const [cursorStyle, setCursorStyle] = useState(() => localStorage.getItem('cursorStyle') || 'line');

  // save options to local storage whenever they change.
  useEffect(() => {
    localStorage.setItem('bgImage', bgImage);
    localStorage.setItem('bgOpacity', bgOpacity);
    localStorage.setItem('volume', volume);
    localStorage.setItem('fontFamily', fontFamily);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('showScansion', showScansion);
    localStorage.setItem('cursorStyle', cursorStyle);
  }, [bgImage, bgOpacity, volume, fontFamily, fontSize, showScansion, cursorStyle]);
  const [startTime, setStartTime] = useState(null);
  const [stats, setStats] = useState({ wpm: 0, acc: 100, totalKeys: 0, correctKeys: 0 });

  // leaderboard state
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const inputRef = useRef(null);

  // fetch index on mount
  useEffect(() => {
    // cache buster
    fetch(`/library/index.json?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(indexData => {
        setLibraryIndex(indexData);

        const savedAuthor = localStorage.getItem('selectedAuthor');
        const savedWork = localStorage.getItem('selectedWork');
        const savedPieceId = localStorage.getItem('selectedPieceId');

        const hasSavedPiece = savedAuthor && indexData[savedAuthor] && 
                              savedWork && indexData[savedAuthor][savedWork] && 
                              savedPieceId && indexData[savedAuthor][savedWork].some(p => p.id === savedPieceId);

        const initialAuthor = hasSavedPiece ? savedAuthor : (indexData['Catullus'] ? 'Catullus' : Object.keys(indexData)[0]);
        const initialWork = hasSavedPiece ? savedWork : (indexData[initialAuthor]['Carmina'] ? 'Carmina' : Object.keys(indexData[initialAuthor])[0]);
        const initialPieceId = hasSavedPiece ? savedPieceId : (indexData[initialAuthor][initialWork].some(p => p.id === 'catullus-1') ? 'catullus-1' : indexData[initialAuthor][initialWork][0].id);

        setSelectedAuthor(initialAuthor);
        setSelectedWork(initialWork);
        setSelectedPieceId(initialPieceId);

        fetchAuthorData(initialAuthor);
      });
  }, []);

  useEffect(() => {
    if (selectedAuthor) localStorage.setItem('selectedAuthor', selectedAuthor);
    if (selectedWork) localStorage.setItem('selectedWork', selectedWork);
    if (selectedPieceId) localStorage.setItem('selectedPieceId', selectedPieceId);
  }, [selectedAuthor, selectedWork, selectedPieceId]);

  // fetch user profile on mount
  useEffect(() => {
    const savedName = localStorage.getItem('latintype_ranked_name');
    const declinedName = localStorage.getItem('latintype_declined_name');
    if (savedName) {
      const fetchProfile = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'users', savedName));
          if (docSnap.exists()) {
            setUserProfile({ xp: 0, level: 1, badges: [], ...docSnap.data(), docId: savedName });
          }
        } catch (e) {
          console.error("Error fetching profile", e);
        }
      };
      fetchProfile();
    } else if (!declinedName) {
      setShowUsernamePrompt(true);
    }
  }, []);

  // helper to fetch heavy author data lazily
  const fetchAuthorData = (authorName) => {
    setIsFetchingAuthor(true);
    const safeFilename = authorName.toLowerCase().replace(/ /g, "_") + ".json";

    // cache buster
    fetch(`/library/${safeFilename}?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(data => {
        setActiveAuthorData(data);
        setIsFetchingAuthor(false);
        setIsAppLoading(false);
      });
  };

  // handle author change
  const handleAuthorChange = (e) => {
    const newAuthor = e.target.value;
    setSelectedAuthor(newAuthor);

    const firstWork = Object.keys(libraryIndex[newAuthor])[0];
    setSelectedWork(firstWork);
    setSelectedPieceId(libraryIndex[newAuthor][firstWork][0].id);

    fetchAuthorData(newAuthor);
  };

  // handle work change
  const handleWorkChange = (e) => {
    const newWork = e.target.value;
    setSelectedWork(newWork);
    setSelectedPieceId(libraryIndex[selectedAuthor][newWork][0].id);
  };

  const loadRandomTimeAttack = () => {
    if (!libraryIndex) return;
    setIsFetchingAuthor(true);

    const authors = Object.keys(libraryIndex);
    const randomAuthor = authors[Math.floor(Math.random() * authors.length)];
    const works = Object.keys(libraryIndex[randomAuthor]);
    const randomWork = works[Math.floor(Math.random() * works.length)];
    const pieces = libraryIndex[randomAuthor][randomWork];
    const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];

    setSelectedAuthor(randomAuthor);
    setSelectedWork(randomWork);
    setSelectedPieceId(randomPiece.id);

    const safeFilename = randomAuthor.toLowerCase().replace(/ /g, "_") + ".json";
    fetch(`/library/${safeFilename}?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(data => {
        setActiveAuthorData(data);
        setIsFetchingAuthor(false);
      });
  };

  const seededRandom = (seedStr) => {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = Math.imul(31, hash) + seedStr.charCodeAt(i) | 0;
    }
    return function() {
      hash = Math.imul(hash ^ (hash >>> 15), 1597334677);
      hash = Math.imul(hash ^ (hash >>> 15), 3812015801);
      return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
    };
  };

  const loadDailyChallenge = () => {
    if (!libraryIndex) return;
    setIsFetchingAuthor(true);

    const dateStr = new Date().toISOString().split('T')[0];
    const rand = seededRandom(dateStr);

    const authors = Object.keys(libraryIndex);
    const randomAuthor = authors[Math.floor(rand() * authors.length)];
    const works = Object.keys(libraryIndex[randomAuthor]);
    const randomWork = works[Math.floor(rand() * works.length)];
    const pieces = libraryIndex[randomAuthor][randomWork];
    const randomPiece = pieces[Math.floor(rand() * pieces.length)];

    setSelectedAuthor(randomAuthor);
    setSelectedWork(randomWork);
    setSelectedPieceId(randomPiece.id);

    const safeFilename = randomAuthor.toLowerCase().replace(/ /g, "_") + ".json";
    fetch(`/library/${safeFilename}?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(data => {
        setActiveAuthorData(data);
        setIsFetchingAuthor(false);
      });
  };

  const handleMultiplayerQueue = async () => {
    if (!libraryIndex) return;
    
    if (!userProfile) {
      setShowUsernamePrompt(true);
      return;
    }

    setIsQueueing(true);
    setTestMode('multiplayer');
    setMatchStatus('waiting');
    setMatchFoundData(null);
    setOpponentProfile(null);
    setEloChange(null);
    resetTest();

    try {
      const matchesRef = collection(db, 'matches');
      const q = query(matchesRef, where('status', '==', 'waiting'));
      const querySnapshot = await getDocs(q);

      let joinedMatchId = null;
      let opponentKey = null;
      let mData = null;

      for (const d of querySnapshot.docs) {
        if (!d.data().players || !d.data().players[playerId]) {
          try {
            await runTransaction(db, async (transaction) => {
              const matchDocRef = doc(db, 'matches', d.id);
              const matchSnap = await transaction.get(matchDocRef);
              if (!matchSnap.exists()) throw "Match does not exist!";
              
              const currentData = matchSnap.data();
              if (currentData.status !== 'waiting') throw "Match is no longer waiting!";
              
              transaction.update(matchDocRef, {
                status: 'found',
                [`players.${playerId}`]: { score: 0, wpm: 0, acc: 100, name: userProfile.name, elo: userProfile.elo, accepted: false }
              });
              
              joinedMatchId = d.id;
              opponentKey = Object.keys(currentData.players)[0];
              mData = currentData;
            });
            break; 
          } catch (error) {
            console.log("Transaction failed, trying next available match...", error);
          }
        }
      }

      if (joinedMatchId) {
        setMatchId(joinedMatchId);
        setOpponentId(opponentKey);
        
        setSelectedAuthor(mData.author);
        setSelectedWork(mData.work);
        setSelectedPieceId(mData.pieceId);
        fetchAuthorData(mData.author);

      } else {
        const authors = Object.keys(libraryIndex);
        const randomAuthor = authors[Math.floor(Math.random() * authors.length)];
        const works = Object.keys(libraryIndex[randomAuthor]);
        const randomWork = works[Math.floor(Math.random() * works.length)];
        const randomPieces = libraryIndex[randomAuthor][randomWork];
        const randomPiece = randomPieces[Math.floor(Math.random() * randomPieces.length)];

        setSelectedAuthor(randomAuthor);
        setSelectedWork(randomWork);
        setSelectedPieceId(randomPiece.id);
        fetchAuthorData(randomAuthor);

        const newMatch = await addDoc(collection(db, 'matches'), {
          status: 'waiting',
          author: randomAuthor,
          work: randomWork,
          pieceId: randomPiece.id,
          hostId: playerId,
          players: {
            [playerId]: { score: 0, wpm: 0, acc: 100, name: userProfile.name, elo: userProfile.elo, accepted: false }
          }
        });

        setMatchId(newMatch.id);
      }
    } catch (e) {
      console.error(e);
      setIsQueueing(false);
      setTestMode('passage');
    }
  };

  // Listen to match changes
  useEffect(() => {
    if (!matchId || testMode !== 'multiplayer') return;
    const unsub = onSnapshot(doc(db, 'matches', matchId), (document) => {
      if (document.exists()) {
        const data = document.data();
        if (data.status === 'found') {
          setIsQueueing(false);
          const keys = Object.keys(data.players);
          const oppId = keys.find(k => k !== playerId);
          if (oppId) {
            if (!opponentId) setOpponentId(oppId);
            
            setMatchFoundData({
              myAccepted: data.players[playerId]?.accepted || false,
              oppAccepted: data.players[oppId]?.accepted || false,
              oppName: data.players[oppId]?.name || 'Opponent',
              oppElo: data.players[oppId]?.elo || 1200
            });

            if (data.players[playerId]?.accepted && data.players[oppId]?.accepted && data.hostId === playerId) {
              updateDoc(doc(db, 'matches', matchId), { status: 'playing' }).catch(console.error);
            }
          }
        }

        if (data.status === 'cancelled' && matchStatus === 'waiting') {
           setMatchFoundData(null);
           if (data.declinedBy !== playerId) {
             setTimeout(() => {
               handleMultiplayerQueue();
             }, 100);
           }
        }

        if (data.status === 'playing' && matchStatus === 'waiting') {
          setIsQueueing(false);
          setMatchFoundData(null);
          setMatchStatus('playing');
          
          if (!opponentId) {
             const keys = Object.keys(data.players);
             const oppId = keys.find(k => k !== playerId);
             setOpponentId(oppId);
          }
          setMultiplayerCountdown(3);
        }

        if (data.status === 'playing') {
          const keys = Object.keys(data.players);
          const oppId = keys.find(k => k !== playerId);
          if (oppId && data.players[oppId]) {
            setOpponentScore(data.players[oppId].score || 0);
            if (!opponentProfile) {
              setOpponentProfile({ name: data.players[oppId].name || 'Opponent', elo: data.players[oppId].elo || 1200 });
            }
          }
        }
      }
    });
    return () => unsub();
  }, [matchId, matchStatus, playerId, opponentId, testMode, opponentProfile]);

  // Match end compute Elo
  useEffect(() => {
    if (isFinished && testMode === 'multiplayer' && userProfile && opponentProfile && eloChange === null) {
       const calcElo = async () => {
         const myExpected = 1 / (1 + Math.pow(10, (opponentProfile.elo - userProfile.elo) / 400));
         const actualScore = myScore > opponentScore ? 1 : myScore < opponentScore ? 0 : 0.5;
         const change = Math.round(32 * (actualScore - myExpected));
         setEloChange(change);
         
         const newElo = Math.max(0, userProfile.elo + change);
         const newWins = userProfile.wins + (actualScore === 1 ? 1 : 0);
         const newLosses = userProfile.losses + (actualScore === 0 ? 1 : 0);
         const newDraws = (userProfile.draws || 0) + (actualScore === 0.5 ? 1 : 0);
         
         setUserProfile(prev => ({ ...prev, elo: newElo, wins: newWins, losses: newLosses, draws: newDraws }));
         
         try {
           await updateDoc(doc(db, 'users', userProfile.docId), {
             elo: newElo,
             wins: newWins,
             losses: newLosses,
             draws: newDraws
           });
         } catch(e) { console.error(e); }
       };
       calcElo();
    }
  }, [isFinished, testMode, userProfile, opponentProfile, myScore, opponentScore, eloChange, playerId]);

  // General end of test: compute XP and Badges
  useEffect(() => {
    if (isFinished && userProfile && !xpAwarded) {
      const calculateXP = async () => {
        if (lines.length === 0) return;
        setXpAwarded(true);

        if (testMode === 'daily' && userProfile) {
          const dateStr = new Date().toISOString().split('T')[0];
          const dailyScore = Math.round(stats.wpm * Math.pow(stats.acc / 100, 1.5) * 10);
          
          try {
            await setDoc(doc(db, 'daily_leaderboards', dateStr), { date: dateStr, resolved: false }, { merge: true });
            
            const scoreRef = doc(db, 'daily_leaderboards', dateStr, 'scores', userProfile.docId);
            const scoreSnap = await getDoc(scoreRef);
            if (!scoreSnap.exists() || scoreSnap.data().score < dailyScore) {
              await setDoc(scoreRef, {
                name: userProfile.name || userProfile.docId,
                score: dailyScore,
                wpm: stats.wpm,
                acc: stats.acc,
                timestamp: serverTimestamp()
              });
            }
          } catch(e) { console.error("Error saving daily score", e); }
        }

        let earnedXp = Math.floor(stats.correctKeys / 5) * 5; 
        
        if (testMode === 'time') earnedXp += 50; 
        if (testMode === 'multiplayer') {
          earnedXp += 100;
          if (myScore > opponentScore) earnedXp += 50;
        }

        const newTotalXp = (userProfile.xp || 0) + earnedXp;
        const newLevel = Math.floor(Math.sqrt(newTotalXp / 100)) + 1;

        const newBadges = [...(userProfile.badges || [])];
        if (testMode === 'multiplayer' && !newBadges.includes('first_match')) newBadges.push('first_match');
        if (stats.wpm >= 100 && !newBadges.includes('speed_demon')) newBadges.push('speed_demon');
        if (testMode === 'zen' && !newBadges.includes('zen_master')) newBadges.push('zen_master');
        if (testMode === 'time' && !newBadges.includes('time_lord')) newBadges.push('time_lord');
        if (newTotalXp >= 1000 && !newBadges.includes('scholar')) newBadges.push('scholar');

        setUserProfile(prev => ({ ...prev, xp: newTotalXp, level: newLevel, badges: newBadges }));

        try {
          await updateDoc(doc(db, 'users', userProfile.docId), {
            xp: newTotalXp,
            level: newLevel,
            badges: newBadges
          });
        } catch (e) { console.error("Failed to update XP", e); }
      };
      calculateXP();
    }
  }, [isFinished, userProfile, xpAwarded, stats, testMode, myScore, opponentScore]);

  // multiplayer countdown
  useEffect(() => {
    if (multiplayerCountdown === null) return;
    if (multiplayerCountdown > 0) {
      const timer = setTimeout(() => setMultiplayerCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setMultiplayerCountdown(null);
      setStartTime(Date.now());
      setTimeRemaining(30);
    }
  }, [multiplayerCountdown]);

  const handleSetUsername = async () => {
    if (!tempUsername.trim()) return;
    const cleanName = tempUsername.trim();
    const docId = cleanName.toLowerCase();
    
    try {
      const docRef = doc(db, 'users', docId);
      const docSnap = await getDoc(docRef);
      
      let profile;
      if (docSnap.exists()) {
        profile = {
          xp: 0,
          level: 1,
          badges: [],
          ...docSnap.data()
        };
      } else {
        profile = {
          name: cleanName,
          elo: 1200,
          wins: 0,
          losses: 0,
          draws: 0,
          xp: 0,
          level: 1,
          badges: []
        };
        await setDoc(docRef, profile);
      }
      
      setUserProfile({ ...profile, docId });
      localStorage.setItem('latintype_ranked_name', docId);
      setShowUsernamePrompt(false);
    } catch (e) {
      console.error("Failed to save profile", e);
    }
  };

  // reset engine helper
  const resetTest = () => {
    setWordIndex(0);
    setCurrentInput('');
    setTypedHistory([]);
    setStartTime(null);
    setStats({ wpm: 0, acc: 100, totalKeys: 0, correctKeys: 0 });
    setIsFinished(false);
    setXpAwarded(false);
    setTimeRemaining(testMode === 'time' ? timeLimit : null);
    setScoreSaved(false);
    setIsSaving(false);
    setPlayerName('');
    if (inputRef.current) inputRef.current.focus();
  };

  // parse text when piece changes
  useEffect(() => {
    if (isFetchingAuthor || !activeAuthorData.length) return;

    const selectedPassage = activeAuthorData.find(p => p.id === selectedPieceId);
    if (!selectedPassage) return;

    let rawLines = selectedPassage.text.split('\n');
    let rawScansion = selectedPassage.scansion;
    const totalLines = rawLines.length;

    // detect piece change
    if (loadedPieceId !== selectedPieceId) {
      setLoadedPieceId(selectedPieceId);
      setLineRange({ start: 1, end: totalLines, max: totalLines });
      return;
    }

    if (testMode === 'time') {
      const minLinesNeeded = 20;
      if (rawLines.length > minLinesNeeded) {
        const maxStartIndex = rawLines.length - minLinesNeeded;
        const startIndex = Math.floor(Math.random() * (maxStartIndex + 1));
        rawLines = rawLines.slice(startIndex);
        if (rawScansion) rawScansion = rawScansion.slice(startIndex);
      }
    } else if (testMode === 'passage') {
      const sIndex = Math.max(0, lineRange.start - 1);
      const eIndex = Math.min(totalLines, lineRange.end);
      if (eIndex > sIndex) {
        rawLines = rawLines.slice(sIndex, eIndex);
        if (rawScansion) rawScansion = rawScansion.slice(sIndex, eIndex);
      }
    } else if (testMode === 'daily') {
      const dateStr = new Date().toISOString().split('T')[0];
      const rand = seededRandom(dateStr);
      const maxStartIndex = Math.max(0, rawLines.length - 20);
      const startIndex = Math.floor(rand() * (maxStartIndex + 1));
      rawLines = rawLines.slice(startIndex, startIndex + 20);
      if (rawScansion) rawScansion = rawScansion.slice(startIndex, startIndex + 20);
    }

    let globalIdx = 0;
    const parsedLines = rawLines.map((lineStr, lIdx) => {
      const words = lineStr.trim().split(' ').filter(w => w.length > 0).map(word => {
        const wordObj = { word, globalIdx };
        globalIdx++;
        return wordObj;
      });
      return { words, scansion: rawScansion ? rawScansion[lIdx] : null };
    });

    setLines(parsedLines);
    resetTest();
  }, [selectedPieceId, activeAuthorData, isFetchingAuthor, testMode, loadedPieceId, lineRange.start, lineRange.end]);

  // live timer
  useEffect(() => {
    if (!startTime || isFinished) return;
    const interval = setInterval(() => {
      const timeElapsedMs = Date.now() - startTime;
      const timeElapsedMin = timeElapsedMs / 60000;

      setStats(prev => {
        const newWpm = Math.max(0, Math.round((prev.correctKeys / 5) / timeElapsedMin));
        const newAcc = prev.totalKeys > 0 ? Math.round((prev.correctKeys / prev.totalKeys) * 100) : 100;

        if (testMode === 'multiplayer' && matchId && playerId) {
          const score = (newWpm * (newAcc / 100)) * (timeElapsedMs / 1000);
          setMyScore(score);
          updateDoc(doc(db, 'matches', matchId), {
            [`players.${playerId}.score`]: score,
            [`players.${playerId}.wpm`]: newWpm,
            [`players.${playerId}.acc`]: newAcc
          }).catch(e => console.error(e));
        }

        return { ...prev, wpm: newWpm, acc: newAcc };
      });

      if (testMode === 'time' || testMode === 'multiplayer' || testMode === 'daily') {
        const tLimit = testMode === 'multiplayer' ? 30 : timeLimit;
        const remaining = Math.max(0, tLimit - Math.floor(timeElapsedMs / 1000));
        setTimeRemaining(remaining);
        if (remaining <= 0) {
          setIsFinished(true);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isFinished, testMode, timeLimit, matchId, playerId]);


  const playClickSound = () => {
    if (volume === 0) return;
    const click = new Audio('/click.mp3');
    click.volume = volume;
    click.playbackRate = 0.95 + Math.random() * 0.1;
    click.preservesPitch = false;
    click.play().catch(() => { });
  };

  const handleKeyDown = (e) => {
    if (isFinished && testMode === 'zen' && e.key === ' ') {
      e.preventDefault();
      const pieces = libraryIndex[selectedAuthor][selectedWork];
      const currentIndex = pieces.findIndex(p => p.id === selectedPieceId);
      if (currentIndex !== -1 && currentIndex + 1 < pieces.length) {
        setSelectedPieceId(pieces[currentIndex + 1].id);
      } else {
        const authors = Object.keys(libraryIndex);
        const randomAuthor = authors[Math.floor(Math.random() * authors.length)];
        const works = Object.keys(libraryIndex[randomAuthor]);
        const randomWork = works[Math.floor(Math.random() * randomWork.length)];
        const randomPieces = libraryIndex[randomAuthor][randomWork];
        const randomPiece = randomPieces[Math.floor(Math.random() * randomPieces.length)];
        setSelectedAuthor(randomAuthor);
        setSelectedWork(randomWork);
        setSelectedPieceId(randomPiece.id);
        fetchAuthorData(randomAuthor);
      }
      return;
    }

    if (isFinished || isFetchingAuthor || isAppLoading || multiplayerCountdown !== null || isQueueing) return;

    if (e.key.length === 1 || e.key === 'Backspace' || e.key === ' ') playClickSound();

    if (e.key === ' ') {
      e.preventDefault();
      if (currentInput.trim().length > 0) {
        const flatWords = lines.flatMap(l => l.words);
        if (wordIndex === flatWords.length - 1) setIsFinished(true);

        setTypedHistory([...typedHistory, currentInput.trim()]);
        setWordIndex((prev) => prev + 1);
        setCurrentInput('');
      }
    } else if (e.key === 'Backspace') {
      if (currentInput === '' && wordIndex > 0) {
        e.preventDefault();
        const newHistory = [...typedHistory];
        const previousInput = newHistory.pop();
        setTypedHistory(newHistory);
        setWordIndex((prev) => prev - 1);
        setCurrentInput(previousInput);
      }
    } else if (e.key.length === 1) {
      if (!startTime) setStartTime(Date.now());

      const flatWords = lines.flatMap(l => l.words);
      const activeWordObj = flatWords.find(w => w.globalIdx === wordIndex);

      if (activeWordObj) {
        const expectedWord = activeWordObj.word;
        const normalizedExpected = expectedWord.split('').map(normalizeChar).join('');
        const expectedChar = normalizeChar(expectedWord[currentInput.length] || '');
        const isCorrect = e.key === expectedChar;
        const nextInput = currentInput + e.key;

        setStats(prev => ({
          ...prev,
          totalKeys: prev.totalKeys + 1,
          correctKeys: prev.correctKeys + (isCorrect ? 1 : 0)
        }));

        if (wordIndex === flatWords.length - 1 && nextInput === normalizedExpected) setIsFinished(true);
      }
    }
  };

  const focusInput = (e) => {
    if (e.target.tagName === 'SELECT' || e.target.type === 'range' || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' && e.target.type === 'text' && e.target !== inputRef.current || isFinished) return;
    if (inputRef.current) inputRef.current.focus();
  };

  if (isAppLoading || !libraryIndex) {
    return <div className="min-h-screen bg-mt-bg text-mt-main flex items-center justify-center font-bold text-2xl animate-pulse">Loading Library Index...</div>;
  }

  // virtualization math RAHHHHHHHHH
  const activeLineIndex = lines.findIndex(line => line.words.some(w => w.globalIdx === wordIndex));
  const safeActiveLineIndex = activeLineIndex !== -1 ? activeLineIndex : (lines.length > 0 ? lines.length - 1 : 0);
  const scrollOffset = safeActiveLineIndex > 0 ? safeActiveLineIndex - 1 : 0;

  const lineHeightPx = fontSize * 2.8;
  const viewportHeightPx = lineHeightPx * 4;
  const translateY = `-${scrollOffset * lineHeightPx}px`;

  const renderStart = Math.max(0, safeActiveLineIndex - 2);
  const renderEnd = Math.min(lines.length, safeActiveLineIndex + 4);
  const visibleLines = lines.slice(renderStart, renderEnd);

  // menu arrays
  const uniqueAuthors = Object.keys(libraryIndex);
  const availableWorks = Object.keys(libraryIndex[selectedAuthor]);
  const availablePieces = libraryIndex[selectedAuthor][selectedWork];

  return (
    <div
      className="min-h-screen bg-mt-bg text-mt-text flex flex-col items-center justify-start p-4 sm:p-8 tracking-wide relative"
      onClick={focusInput}
      style={{ fontFamily: fontFamily }}
    >
      {bgImage !== 'none' && (
        <div
          className={`fixed inset-0 z-0 pointer-events-none bg-cover bg-center transition-all duration-500 ${testMode === 'zen' ? 'blur-md scale-105' : ''}`}
          style={{ backgroundImage: `url(${bgImage})`, opacity: bgOpacity }}
        />
      )}


      {/* Header */}
      <div className="w-full z-20 flex justify-center shrink-0 mb-8 sm:mb-0">
        <div className="w-full max-w-[1600px] flex flex-col sm:flex-row sm:justify-between items-start gap-4 sm:gap-0 pointer-events-auto">

          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-mt-text tracking-tighter mt-1">
              latin<span className="text-mt-main">type</span>
            </h1>

            <div className={`flex gap-6 mt-6 transition-opacity duration-500 ${(startTime && testMode !== 'zen') ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex flex-col">
                <span className="text-[0.65rem] uppercase tracking-widest text-mt-sub/70 font-bold mb-1">wpm</span>
                <span className="text-4xl font-light text-mt-text leading-none">{stats.wpm}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[0.65rem] uppercase tracking-widest text-mt-sub/70 font-bold mb-1">acc</span>
                <span className="text-4xl font-light text-mt-text leading-none">{stats.acc}%</span>
              </div>
              {(testMode === 'time' || testMode === 'daily') && (
                <div className="flex flex-col">
                  <span className="text-[0.65rem] uppercase tracking-widest text-mt-main/70 font-bold mb-1">time</span>
                  <span className={`text-4xl font-light leading-none ${timeRemaining <= 10 ? 'text-mt-error animate-pulse' : 'text-mt-main'}`}>
                    {timeRemaining !== null ? timeRemaining : timeLimit}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">

            {/*mode toggle*/}
            <div className="flex bg-mt-bg/80 backdrop-blur-md p-1 rounded-lg shadow-lg mb-2 self-end">
              <button
                onClick={(e) => { e.stopPropagation(); setTestMode('zen'); setMatchStatus('idle'); resetTest(); }}
                className={`py-1 px-3 text-xs font-bold rounded-md transition-colors duration-200 ${testMode === 'zen' ? 'bg-mt-main text-mt-bg' : 'text-mt-sub hover:text-mt-text'}`}
              >
                Zen
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setTestMode('passage'); setMatchStatus('idle'); resetTest(); }}
                className={`py-1 px-3 text-xs font-bold rounded-md transition-colors duration-200 ${testMode === 'passage' ? 'bg-mt-main text-mt-bg' : 'text-mt-sub hover:text-mt-text'}`}
              >
                Passage
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setTestMode('time'); loadRandomTimeAttack(); }}
                className={`py-1 px-3 text-xs font-bold rounded-md transition-colors duration-200 ${testMode === 'time' ? 'bg-mt-main text-mt-bg' : 'text-mt-sub hover:text-mt-text'}`}
              >
                Time Attack
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleMultiplayerQueue(); }}
                className={`py-1 px-3 text-xs font-bold rounded-md transition-colors duration-200 ${testMode === 'multiplayer' ? 'bg-mt-main text-mt-bg' : 'text-mt-sub hover:text-mt-text'}`}
              >
                Multiplayer
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setTestMode('daily'); loadDailyChallenge(); }}
                className={`py-1 px-3 text-xs font-bold rounded-md transition-colors duration-200 ${testMode === 'daily' ? 'bg-mt-main text-mt-bg shadow-[0_0_15px_rgba(226,183,20,0.4)]' : 'text-mt-main/80 hover:text-mt-main'}`}
              >
                Daily Challenge
              </button>
            </div>

            {/*navigation*/}
            <div className="flex gap-3 bg-mt-bg/80 backdrop-blur-md p-1 rounded-lg shadow-lg justify-end w-full">
              {testMode === 'passage' || testMode === 'zen' ? (
                <>
                  <select
                    className="bg-transparent text-mt-main hover:text-mt-text transition-colors duration-200 py-2 px-3 outline-none cursor-pointer text-sm font-bold max-w-35 truncate"
                    value={selectedAuthor}
                    onChange={handleAuthorChange}
                  >
                    {uniqueAuthors.map((author) => <option key={author} value={author} className="bg-mt-bg text-mt-text">{author}</option>)}
                  </select>

                  <span className="text-mt-sub/30 py-2 select-none">/</span>

                  <select
                    className="bg-transparent text-mt-text hover:text-mt-sub transition-colors duration-200 py-2 px-3 outline-none cursor-pointer text-sm font-bold max-w-45 truncate"
                    value={selectedWork}
                    onChange={handleWorkChange}
                  >
                    {availableWorks.map((work) => <option key={work} value={work} className="bg-mt-bg text-mt-text">{work}</option>)}
                  </select>

                  {/*poem/book section */}
                  {availablePieces.length > 1 && (
                    <>
                      <span className="text-mt-sub/30 py-2 select-none">/</span>
                      <select
                        className="bg-mt-sub-alt text-mt-text hover:text-mt-main transition-colors duration-200 py-2 px-4 rounded-md outline-none cursor-pointer text-sm max-w-50 truncate"
                        value={selectedPieceId}
                        onChange={(e) => setSelectedPieceId(e.target.value)}
                      >
                        {availablePieces.map((piece) => <option key={piece.id} value={piece.id} className="bg-mt-bg text-mt-text">{piece.piece}</option>)}
                      </select>
                    </>
                  )}

                  <span className="text-mt-sub/30 py-2 select-none">/</span>
                  <div className="flex items-center gap-2 bg-mt-sub-alt rounded-md px-3 py-1 shrink-0">
                    <span className="text-mt-sub text-[0.65rem] font-bold uppercase tracking-widest hidden sm:inline">Lines</span>

                    <div
                      className="flex flex-col items-center justify-center"
                      onWheel={(e) => {
                        const delta = e.deltaY > 0 ? -1 : 1;
                        setLineRange(prev => ({ ...prev, start: Math.max(1, Math.min(lineRange.max, Math.min(prev.start + delta, prev.end))) }));
                      }}
                    >
                      <button onClick={(e) => { e.stopPropagation(); setLineRange(prev => ({ ...prev, start: Math.min(lineRange.max, Math.min(prev.start + 1, prev.end)) })) }} className="text-mt-sub hover:text-mt-main leading-none text-[0.6rem] h-2 flex items-end justify-center w-full select-none cursor-pointer">▲</button>
                      <input
                        type="number" min="1" max={lineRange.max} value={lineRange.start}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setLineRange(prev => ({ ...prev, start: Math.min(val, prev.end) }));
                        }}
                        className="bg-transparent text-mt-text text-sm font-bold w-12 text-center outline-none -my-[0.1rem]"
                      />
                      <button onClick={(e) => { e.stopPropagation(); setLineRange(prev => ({ ...prev, start: Math.max(1, prev.start - 1) })) }} className="text-mt-sub hover:text-mt-main leading-none text-[0.6rem] h-2 flex items-start justify-center w-full select-none cursor-pointer">▼</button>
                    </div>

                    <span className="text-mt-sub/50">-</span>

                    <div
                      className="flex flex-col items-center justify-center"
                      onWheel={(e) => {
                        const delta = e.deltaY > 0 ? -1 : 1;
                        setLineRange(prev => ({ ...prev, end: Math.max(1, Math.min(lineRange.max, Math.max(prev.start, prev.end + delta))) }));
                      }}
                    >
                      <button onClick={(e) => { e.stopPropagation(); setLineRange(prev => ({ ...prev, end: Math.min(lineRange.max, prev.end + 1) })) }} className="text-mt-sub hover:text-mt-main leading-none text-[0.6rem] h-2 flex items-end justify-center w-full select-none cursor-pointer">▲</button>
                      <input
                        type="number" min="1" max={lineRange.max} value={lineRange.end}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || lineRange.max;
                          setLineRange(prev => ({ ...prev, end: Math.max(val, prev.start) }));
                        }}
                        className="bg-transparent text-mt-text text-sm font-bold w-12 text-center outline-none -my-[0.1rem]"
                      />
                      <button onClick={(e) => { e.stopPropagation(); setLineRange(prev => ({ ...prev, end: Math.max(prev.start, prev.end - 1) })) }} className="text-mt-sub hover:text-mt-main leading-none text-[0.6rem] h-2 flex items-start justify-center w-full select-none cursor-pointer">▼</button>
                    </div>
                  </div>
                </>
              ) : testMode === 'time' ? (
                <>
                  <div className="flex items-center mr-4 hidden md:flex">
                    <span className="text-mt-sub text-xs uppercase tracking-widest truncate max-w-[250px] text-right">
                      {selectedAuthor} - {selectedWork}
                    </span>
                  </div>
                  <select
                    className="bg-transparent text-mt-main hover:text-mt-text transition-colors duration-200 py-2 px-3 outline-none cursor-pointer text-sm font-bold"
                    value={timeLimit}
                    onChange={(e) => { setTimeLimit(parseInt(e.target.value)); setTimeRemaining(parseInt(e.target.value)); }}
                  >
                    <option value={30} className="bg-mt-bg text-mt-text">30s Time Attack</option>
                    <option value={60} className="bg-mt-bg text-mt-text">60s Time Attack</option>
                    <option value={120} className="bg-mt-bg text-mt-text">120s Time Attack</option>
                  </select>
                  <button
                    onClick={(e) => { e.stopPropagation(); loadRandomTimeAttack(); }}
                    className="bg-mt-sub-alt text-mt-text hover:text-mt-main transition-colors duration-200 py-2 px-4 rounded-md text-sm cursor-pointer font-bold"
                  >
                    🎲 Roll New Text
                  </button>
                </>
              ) : (
                <div className="flex items-center px-4">
                  <span className="text-mt-main font-bold text-sm uppercase tracking-widest truncate max-w-[250px] text-right">
                    {selectedAuthor} - {selectedWork}
                  </span>
                </div>
              )}
            </div>

            {/*customization nav*/}
            <div className="flex gap-3">
              <select
                className="bg-mt-sub-alt text-mt-sub hover:text-mt-text transition-colors duration-200 py-1 px-3 rounded-lg outline-none cursor-pointer text-xs"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              >
                {fonts.map((f) => <option key={f.name} value={f.value}>{f.name}</option>)}
              </select>

              <div
                className={`relative overflow-hidden rounded-lg transition-colors duration-200 select-none ${bgImage !== 'none' ? 'bg-mt-main/30' : 'bg-mt-sub-alt'}`}
                onWheel={(e) => {
                  e.stopPropagation();
                  if (bgImage === 'none') return;
                  const delta = e.deltaY > 0 ? -0.01 : 0.01;
                  setBgOpacity(prev => Math.max(0, Math.min(1, prev + delta)));
                }}
              >
                {bgImage !== 'none' && (
                  <div
                    className="absolute inset-y-0 left-0 bg-mt-main z-0 pointer-events-none"
                    style={{ width: `${bgOpacity * 100}%` }}
                  />
                )}
                <select
                  className={`relative z-10 bg-transparent py-1 px-3 outline-none cursor-pointer text-xs font-bold w-full h-full ${bgImage !== 'none' ? 'text-mt-bg' : 'text-mt-sub hover:text-mt-text'}`}
                  value={bgImage}
                  onChange={(e) => setBgImage(e.target.value)}
                >
                  {backgrounds.map((bg) => (
                    <option key={bg.name} value={bg.url} className="bg-mt-bg text-mt-text">
                      {bg.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setVolume(prev => prev > 0 ? 0 : 0.5); 
                }}
                onWheel={(e) => {
                  e.stopPropagation();
                  if (volume === 0) return;
                  const delta = e.deltaY > 0 ? -0.02 : 0.02;
                  setVolume(prev => Math.max(0, Math.min(1, prev + delta)));
                }}
                className={`relative overflow-hidden py-1 px-4 rounded-lg text-xs font-bold transition-colors duration-200 select-none ${volume > 0 ? 'text-mt-bg' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'}`}
              >
                {volume > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-mt-main z-0"
                    style={{ width: `${volume * 100}%` }}
                  />
                )}
                {volume > 0 && (
                  <div className="absolute inset-0 bg-mt-main/30 z-0" />
                )}
                <span className="relative z-10 whitespace-nowrap">
                  🔊 Type: {volume > 0 ? `${Math.round(volume * 100)}%` : 'MUTE'}
                </span>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setShowScansion(!showScansion); }}
                className={`py-1 px-4 rounded-lg text-xs font-bold transition-colors duration-200 ${showScansion ? 'bg-mt-main/20 text-mt-main' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'
                  }`}
              >
                Meter: {showScansion ? 'ON' : 'OFF'}
              </button>

              <div className="flex items-center gap-2 bg-mt-sub-alt py-1 px-3 rounded-lg">
                <span className="text-mt-sub text-[0.65rem] uppercase">Size</span>
                <input
                  type="range" min="16" max="36" step="2"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-16 accent-mt-main cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* viewport container */}
      <div className="relative z-10 w-full max-w-[1600px] flex flex-col items-center px-4 justify-center flex-grow">

        {testMode === 'multiplayer' && (
          <div className="w-full mb-4 bg-mt-bg/80 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-mt-sub/20 relative">
            <div className="flex justify-between items-center mb-2">
              <span className="text-mt-main font-bold text-sm tracking-widest uppercase">
                {userProfile ? `${userProfile.name} (${userProfile.elo})` : 'You'} - {Math.round(myScore)} pts
              </span>
              <span className="text-mt-error font-bold text-sm tracking-widest uppercase">
                {opponentProfile ? `${opponentProfile.name} (${opponentProfile.elo})` : 'Opponent'} - {Math.round(opponentScore)} pts
              </span>
            </div>
            
            <div className="w-full h-10 bg-mt-sub-alt/50 rounded-full mb-4 relative flex items-center shadow-inner">
               <div className="absolute left-0 h-full bg-mt-main/20 rounded-full transition-all duration-1000 ease-linear" style={{ width: `${Math.min(100, Math.max(0, (myScore / 3600) * 100))}%` }} />
               <div className="absolute z-10 transition-all duration-1000 ease-linear flex items-center" style={{ left: `calc(${Math.min(100, Math.max(0, (myScore / 3600) * 100))}% - 12px)` }}>
                 <span className="text-3xl drop-shadow-md transform scale-x-[-1]">🏇</span>
               </div>
            </div>

            <div className="w-full h-10 bg-mt-sub-alt/50 rounded-full relative flex items-center shadow-inner">
               <div className="absolute left-0 h-full bg-mt-error/20 rounded-full transition-all duration-1000 ease-linear" style={{ width: `${Math.min(100, Math.max(0, (opponentScore / 3600) * 100))}%` }} />
               <div className="absolute z-10 transition-all duration-1000 ease-linear flex items-center" style={{ left: `calc(${Math.min(100, Math.max(0, (opponentScore / 3600) * 100))}% - 12px)` }}>
                 <span className="text-3xl drop-shadow-md grayscale opacity-80 transform scale-x-[-1]">🏇</span>
               </div>
            </div>

            {isQueueing && (
              <div className="absolute inset-0 bg-mt-bg/90 backdrop-blur-md rounded-lg flex flex-col items-center justify-center z-20">
                <span className="text-mt-main animate-pulse font-bold tracking-widest uppercase mb-4">Finding Opponent...</span>
                <button onClick={async (e) => {
                  e.stopPropagation();
                  setIsQueueing(false);
                  setTestMode('passage');
                  if (matchId) {
                    try {
                       await updateDoc(doc(db, 'matches', matchId), { status: 'cancelled', declinedBy: playerId });
                    } catch(e) {}
                  }
                }} className="px-4 py-2 bg-mt-error/20 text-mt-error rounded-lg hover:bg-mt-error hover:text-mt-bg transition-colors font-bold text-sm">Cancel</button>
              </div>
            )}
            {matchFoundData && (
              <div className="absolute inset-0 bg-mt-bg/95 backdrop-blur-lg rounded-lg flex flex-col items-center justify-center z-30 p-4 border-2 border-mt-main/50 shadow-[0_0_30px_rgba(226,183,20,0.2)]">
                <h3 className="text-mt-main font-bold tracking-widest uppercase text-xl mb-6 animate-bounce">Match Found!</h3>
                <div className="flex w-full max-w-sm justify-between items-center mb-8">
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-mt-text text-lg">{userProfile.name}</span>
                    <span className="text-mt-sub font-mono">{userProfile.elo}</span>
                    <span className="text-xs text-mt-main mt-2 font-bold">{matchFoundData.myAccepted ? 'Ready' : 'Waiting...'}</span>
                  </div>
                  <span className="font-bold text-mt-sub text-2xl mx-4">VS</span>
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-mt-text text-lg">{matchFoundData.oppName}</span>
                    <span className="text-mt-sub font-mono">{matchFoundData.oppElo}</span>
                    <span className="text-xs text-mt-main mt-2 font-bold">{matchFoundData.oppAccepted ? 'Ready' : 'Waiting...'}</span>
                  </div>
                </div>
                {!matchFoundData.myAccepted ? (
                  <div className="flex gap-4 w-full max-w-xs">
                    <button onClick={async () => {
                      try {
                        await updateDoc(doc(db, 'matches', matchId), { status: 'cancelled', declinedBy: playerId });
                        setMatchFoundData(null);
                        setTestMode('passage');
                      } catch(e) {}
                    }} className="flex-1 py-2 bg-mt-error/20 text-mt-error hover:bg-mt-error hover:text-mt-bg rounded-lg font-bold transition-colors">Decline</button>
                    <button onClick={async () => {
                      try {
                        await updateDoc(doc(db, 'matches', matchId), { [`players.${playerId}.accepted`]: true });
                      } catch(e) {}
                    }} className="flex-1 py-2 bg-mt-main text-mt-bg hover:bg-opacity-80 rounded-lg font-bold transition-colors shadow-lg">Accept</button>
                  </div>
                ) : (
                  <div className="text-mt-sub italic animate-pulse">Waiting for opponent...</div>
                )}
              </div>
            )}
            {multiplayerCountdown !== null && (
              <div className="absolute inset-0 bg-mt-bg/90 backdrop-blur-md rounded-lg flex items-center justify-center z-20">
                <span className="text-6xl text-mt-main font-bold">{multiplayerCountdown > 0 ? multiplayerCountdown : 'GO!'}</span>
              </div>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute w-0 h-0"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        {/* viewport */}
        <div
          className="relative overflow-hidden w-full select-none mt-8 pt-6 rounded-lg"
          style={{ height: `${viewportHeightPx + 24}px`, fontSize: `${fontSize}px` }}
        >
          {/*loading overlay*/}
          <div className={`absolute inset-0 z-40 flex items-center justify-center bg-mt-bg/50 backdrop-blur-sm transition-opacity duration-300 ${isFetchingAuthor ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <span className="text-mt-main animate-pulse font-bold tracking-widest uppercase">Fetching Scrolls...</span>
          </div>

          {/*completion screen*/}
          <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center bg-mt-bg/80 backdrop-blur-md transition-opacity duration-700 ${isFinished ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <h2 className={`text-5xl font-bold mb-2 ${testMode === 'multiplayer' ? (myScore > opponentScore ? 'text-mt-main drop-shadow-[0_0_15px_rgba(var(--mt-main-rgb),0.5)]' : myScore < opponentScore ? 'text-mt-error' : 'text-mt-sub') : 'text-mt-main'}`}>
              {testMode === 'multiplayer' ? (myScore > opponentScore ? "VICTORY!" : myScore < opponentScore ? "DEFEAT" : "DRAW") : testMode === 'time' || testMode === 'daily' ? (timeRemaining <= 0 ? "Time's Up!" : "Passage Completed") : testMode === 'zen' ? "Zen Flow" : "Passage Completed"}
            </h2>
            {testMode === 'multiplayer' && eloChange !== null && (
              <div className={`text-2xl font-bold mb-4 ${eloChange >= 0 ? 'text-mt-main' : 'text-mt-error'}`}>
                {eloChange >= 0 ? '+' : ''}{eloChange} Elo
              </div>
            )}

            {testMode === 'zen' ? (
              <div className="mt-8 text-mt-sub animate-pulse text-xl">Press SPACE to continue to the next passage...</div>
            ) : (
              <>
                <div className="flex gap-12 my-8">
                  <div className="flex flex-col items-center">
                    <span className="text-sm uppercase tracking-widest text-mt-sub font-bold">WPM</span>
                    <span className="text-6xl font-light text-mt-text">{stats.wpm}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm uppercase tracking-widest text-mt-sub font-bold">Accuracy</span>
                    <span className="text-6xl font-light text-mt-text">{stats.acc}%</span>
                  </div>
                </div>

                {testMode !== 'multiplayer' && testMode !== 'daily' && (
                  <div className="flex flex-col items-center mb-8 w-full max-w-sm">
                    {!userProfile ? (
                      <input
                        type="text"
                        placeholder="Enter name for leaderboard..."
                        className="w-full bg-mt-bg/80 border border-mt-sub/30 rounded-lg px-4 py-2 text-mt-text outline-none focus:border-mt-main transition-colors mb-2 text-center"
                        maxLength={20}
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        disabled={scoreSaved || isSaving}
                      />
                    ) : (
                      <div className="text-mt-sub text-sm mb-3">
                        Submit score to global leaderboards?
                      </div>
                    )}
                    <button
                      className={`w-full font-bold py-2 rounded-lg transition-colors ${scoreSaved ? 'bg-mt-main/20 text-mt-main' : 'bg-mt-main text-mt-bg hover:bg-opacity-80'}`}
                      disabled={scoreSaved || isSaving}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const submitName = userProfile ? userProfile.name : playerName.trim();
                        if (!submitName || isSaving || stats.wpm === 0) return;
                        setIsSaving(true);
                        try {
                          await addDoc(collection(db, "scores"), {
                            name: submitName,
                            wpm: stats.wpm,
                            acc: stats.acc,
                            mode: testMode,
                            duration: testMode === 'time' ? timeLimit : null,
                            passage: testMode === 'passage' ? `${selectedAuthor} - ${selectedWork}` : null,
                            date: new Date().toISOString(),
                            timestamp: new Date()
                          });
                          setScoreSaved(true);
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                    >
                      {isSaving ? "Saving..." : (scoreSaved ? "Score Saved!" : (userProfile ? `Submit as ${userProfile.name}` : "Submit Score"))}
                    </button>
                  </div>
                )}

                <div className="flex gap-4">
                  {testMode === 'multiplayer' ? (
                    <button className="px-8 py-3 bg-mt-main text-mt-bg hover:bg-opacity-80 transition-colors duration-200 rounded-lg font-bold text-lg shadow-lg" onClick={(e) => { e.stopPropagation(); handleMultiplayerQueue(); }}>
                      Queue Again
                    </button>
                  ) : (
                    <button className="px-8 py-3 bg-mt-sub-alt text-mt-text hover:bg-mt-main hover:text-mt-bg transition-colors duration-200 rounded-lg font-bold text-lg" onClick={(e) => { e.stopPropagation(); resetTest(); }}>
                      Restart Test
                    </button>
                  )}
                  {testMode === 'time' && (
                    <button className="px-8 py-3 bg-mt-sub-alt text-mt-text hover:bg-mt-main hover:text-mt-bg transition-colors duration-200 rounded-lg font-bold text-lg" onClick={(e) => { e.stopPropagation(); loadRandomTimeAttack(); }}>
                      Next Random
                    </button>
                  )}
                </div>
              </>
            )}
            
            <span className="text-mt-sub text-sm mt-8">Press TAB + ENTER to restart</span>
          </div>

          <div
            className={`absolute top-0 left-0 w-full transition-all duration-500 ease-in-out ${(isFinished || isFetchingAuthor) ? 'blur-sm opacity-30' : ''}`}
            style={{ transform: `translateY(${translateY})`, height: `${lines.length * lineHeightPx}px` }}
          >
            {visibleLines.map((lineObj, relativeIdx) => {
              const lIdx = renderStart + relativeIdx;
              const distance = lIdx - safeActiveLineIndex;

              let lineOpacity = "opacity-0";
              if (distance === -1) lineOpacity = "opacity-30";
              else if (distance === 0) lineOpacity = "opacity-100";
              else if (distance === 1) lineOpacity = "opacity-70";
              else if (distance === 2) lineOpacity = "opacity-30";

              return (
                <div key={lIdx} className={`absolute left-1/2 -translate-x-1/2 w-max flex justify-center items-center flex-nowrap whitespace-nowrap transition-opacity duration-500 ${lineOpacity}`} style={{ top: `${lIdx * lineHeightPx}px`, height: `${lineHeightPx}px` }}>
                  {lineObj.words.map((wObj, wIdx) => {
                    const { word, globalIdx } = wObj;
                    const isCurrentWord = globalIdx === wordIndex;
                    const isPastWord = globalIdx < wordIndex;
                    const userTypedWord = isPastWord ? typedHistory[globalIdx] : (isCurrentWord ? currentInput : '');
                    const wordScansion = lineObj.scansion?.[wIdx] || "";
                    const vowelIndices = getVowelIndices(word, wordScansion);
                    const nextWordScansion = lineObj.scansion?.[wIdx + 1] || "";
                    const doesElideForward = wordScansion.endsWith(' ') || nextWordScansion.startsWith(' ');

                    return (
                      <div 
                        key={globalIdx} 
                        className={`inline-block relative ${testMode === 'zen' ? 'cursor-pointer hover:bg-mt-sub/20 rounded px-1 -mx-1 transition-colors' : ''} ${wIdx !== lineObj.words.length - 1 ? 'mr-4' : ''}`}
                        onClick={testMode === 'zen' ? () => setSelectedWord(word) : undefined}
                        title={testMode === 'zen' ? "Click to look up" : undefined}
                      >
                        {showScansion && doesElideForward && distance === 0 && (
                          <svg className="absolute bottom-[-0.35em] right-[-0.8em] w-[1.2em] h-[0.6em] pointer-events-none text-mt-sub/50 z-0" viewBox="0 0 100 50" preserveAspectRatio="none">
                            <path d="M 10 15 Q 50 45 90 15" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                          </svg>
                        )}
                        {word.split('').map((char, cIdx) => {
                          let charColor = 'text-mt-sub relative z-10';
                          const expectedChar = normalizeChar(char);
                          if (isPastWord || (isCurrentWord && cIdx < userTypedWord.length)) {
                            charColor = userTypedWord[cIdx] === expectedChar ? 'text-mt-text shadow-[0_0_8px_rgba(255,255,255,0.1)] relative z-10' : 'text-mt-error relative z-10';
                          }
                          const vowelSignIdx = vowelIndices.indexOf(cIdx);
                          const symbol = vowelSignIdx !== -1 ? wordScansion[vowelSignIdx] : null;
                          const isDiphthong = symbol ? isDiphthongStart(word, cIdx, vowelIndices) : false;

                          return (
                            <span key={cIdx} className="relative inline-block">
                              {showScansion && distance === 0 && symbol && symbol !== ' ' && (
                                <span 
                                  className="absolute top-[-0.7em] -translate-x-1/2 text-[0.65em] text-mt-main/80 font-bold select-none leading-none"
                                  style={{ left: isDiphthong ? '100%' : '50%' }}
                                >
                                  {symbol}
                                </span>
                              )}
                              <span className={`${charColor} transition-colors duration-100 drop-shadow-md`}>{char}</span>
                            </span>
                          );
                        })}
                        {userTypedWord.length > word.length && (
                          <span className="text-mt-error-extra opacity-80 relative z-10">{userTypedWord.slice(word.length)}</span>
                        )}
                        {isCurrentWord && (() => {
                          const leftPos = `calc(${Math.min(currentInput.length, word.length)}ch + ${Math.min(currentInput.length, word.length) * 0.025}em)`;
                          if (cursorStyle === 'underline') {
                            return <span className="absolute bg-mt-main animate-pulse rounded-sm opacity-90 shadow-[0_0_8px_rgba(226,183,20,0.4)]" style={{ bottom: '-0.1em', width: '1ch', height: '0.15em', left: leftPos, transition: 'left 0.1s ease-out' }} />;
                          } else if (cursorStyle === 'block') {
                            return <span className="absolute bg-mt-main animate-pulse rounded-sm opacity-50 shadow-[0_0_8px_rgba(226,183,20,0.4)]" style={{ bottom: '0.1em', width: '1ch', height: '1.1em', left: leftPos, transition: 'left 0.1s ease-out' }} />;
                          } else {
                            return <span className="absolute bg-mt-main animate-pulse rounded-sm opacity-90 shadow-[0_0_8px_rgba(226,183,20,0.4)]" style={{ bottom: '0.1em', width: '0.15em', height: '1.1em', left: leftPos, transition: 'left 0.1s ease-out' }} />;
                          }
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 text-sm text-mt-sub bg-mt-bg/50 px-4 py-2 rounded-lg backdrop-blur-sm">
          Click anywhere to focus. Press <kbd className="bg-mt-sub-alt text-mt-text px-2 py-1 rounded mx-1">Space</kbd> to advance.
        </div>
      </div>
      
      {userProfile && (() => {
        const xp = userProfile.xp || 0;
        const level = userProfile.level || 1;
        const prevLevelXp = Math.pow(level - 1, 2) * 100;
        const nextLevelXp = Math.pow(level, 2) * 100;
        const progress = Math.max(0, Math.min(100, ((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100));

        return (
          <div 
            onClick={() => setShowProfilePopup(true)}
            className="fixed bottom-4 left-4 z-40 bg-mt-bg/80 backdrop-blur-md border border-mt-sub/20 rounded-2xl px-4 py-3 flex flex-col gap-2 shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:bg-mt-sub-alt transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full bg-mt-main flex-shrink-0 ${DECORATIONS.find(d => d.id === (userProfile.profileDecoration || 'none'))?.class?.replace('ring-4', 'ring-[2px]') || ''}`}></div>
              <div className="flex items-center gap-1.5 group-hover:text-mt-main transition-colors">
                <span className="font-bold text-mt-text text-sm tracking-wide">{userProfile.name}</span>
                {userProfile.crowns > 0 && <span className="text-[0.8rem] leading-none" title={`${userProfile.crowns} Daily Challenge Wins`}>{Array(userProfile.crowns).fill('👑').join('')}</span>}
                {userProfile.activeTitle && BADGES[userProfile.activeTitle] && (
                  <span className="text-[0.8rem] leading-none opacity-80" title={BADGES[userProfile.activeTitle].title}>{BADGES[userProfile.activeTitle].icon}</span>
                )}
              </div>
              <span className="text-mt-main font-mono text-sm">{userProfile.elo}</span>
              <span className="text-mt-sub text-xs font-mono border-l border-mt-sub/30 pl-3">{userProfile.wins}W - {userProfile.losses}L</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-mt-sub text-[0.65rem] font-bold uppercase tracking-widest min-w-[3rem]">Lvl {level}</span>
              <div className="w-full bg-mt-bg border border-mt-sub/10 rounded-full h-1.5 overflow-hidden flex-1">
                <div className="bg-mt-main h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modals */}
      {showUsernamePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-mt-bg/80 backdrop-blur-md">
          <div className="bg-mt-sub-alt p-8 rounded-xl shadow-2xl border border-mt-sub/20 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-mt-main mb-4 uppercase tracking-widest text-center">Create Profile</h2>
            <p className="text-mt-sub text-sm mb-6 text-center">Enter a username to earn XP, collect badges, and compete globally!</p>
            <input 
              type="text" 
              maxLength={15} 
              autoFocus
              className="w-full bg-mt-bg border border-mt-sub/30 rounded-lg px-4 py-3 text-mt-text outline-none focus:border-mt-main transition-colors mb-4 text-center text-lg font-bold"
              placeholder="Username" 
              value={tempUsername} 
              onChange={e => setTempUsername(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSetUsername()}
            />
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <button onClick={() => setShowUsernamePrompt(false)} className="flex-1 py-3 bg-mt-bg text-mt-sub hover:text-mt-text rounded-lg font-bold transition-colors">Cancel</button>
                <button onClick={handleSetUsername} className="flex-1 py-3 bg-mt-main text-mt-bg hover:bg-opacity-80 rounded-lg font-bold shadow-lg transition-colors">Begin</button>
              </div>
              <button 
                onClick={() => { localStorage.setItem('latintype_declined_name', 'true'); setShowUsernamePrompt(false); }} 
                className="text-mt-sub hover:text-mt-text text-xs uppercase tracking-widest transition-colors font-bold mt-2"
              >
                Not Right Now (Play as Guest)
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showProfilePopup && userProfile && (
        <ProfilePopup 
          userProfile={userProfile} 
          isCurrentUser={true}
          cursorStyle={cursorStyle}
          setCursorStyle={setCursorStyle}
          onClose={() => setShowProfilePopup(false)} 
        />
      )}

      <DictionaryPopup 
        word={selectedWord} 
        onClose={() => setSelectedWord(null)} 
      />
    </div>
  );
}