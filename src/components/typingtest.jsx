import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

const backgrounds = [
  { name: "None (Solid Dark)", url: "none" },
  { name: "Marble Statue", url: "/bg-statue.jpg" },
  { name: "Roman Forum", url: "/bg-forum.jpg" },
  { name: "Old Manuscript", url: "/bg-manuscript.jpg" },
  { name: "Candlelit Library", url: "/bg-library.jpg" }
];

const fonts = [
  { name: "Cutive Mono", value: '"Cutive Mono", monospace' },
  { name: "Courier Prime", value: '"Courier Prime", monospace' },
  { name: "Syne Mono", value: '"Syne Mono", monospace' },
  { name: "Courier New", value: '"Courier New", Courier, monospace' },
  { name: "Consolas", value: 'Consolas, monospace' },
  { name: "Lucida Console", value: '"Lucida Console", Monaco, monospace' },
];

const normalizeChar = (char) => char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const getVowelIndices = (word) => {
  const normalized = word.toLowerCase();
  const vowels = ['a', 'e', 'i', 'o', 'u', 'y', 'ā', 'ē', 'ī', 'ō', 'ū'];
  const indices = [];

  for (let i = 0; i < normalized.length; i++) {
    if (vowels.includes(normalized[i])) {
      if ((normalized[i] === 'u' || normalized[i] === 'ū') && i > 0 && normalized[i - 1] === 'q') continue;
      if (i > 0 && indices.includes(i - 1)) {
        const pair = normalized[i - 1] + normalized[i];
        if (['ae', 'au', 'oe', 'ei', 'eu', 'ui'].includes(pair)) continue;
      }
      indices.push(i);
    }
  }
  return indices;
};

export default function TypingTest() {
  // lazy loading architecture state
  const [libraryIndex, setLibraryIndex] = useState(null);
  const [activeAuthorData, setActiveAuthorData] = useState([]);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFetchingAuthor, setIsFetchingAuthor] = useState(false);

  // time attack mode state
  const [testMode, setTestMode] = useState('passage'); // 'passage' or 'time'
  const [timeLimit, setTimeLimit] = useState(60);
  const [timeRemaining, setTimeRemaining] = useState(null);

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

  // options &analytics state
  const [bgImage, setBgImage] = useState(backgrounds[0].url);
  const [bgOpacity, setBgOpacity] = useState(0.15);
  const [volume, setVolume] = useState(0.2);
  const [lofiEnabled, setLofiEnabled] = useState(false);
  const [lofiVolume, setLofiVolume] = useState(0.5);
  const audioRef = useRef(null);
  const [fontFamily, setFontFamily] = useState(fonts[0].value);
  const [fontSize, setFontSize] = useState(24);
  const [showScansion, setShowScansion] = useState(true);
  const [startTime, setStartTime] = useState(null);
  const [stats, setStats] = useState({ wpm: 0, acc: 100, totalKeys: 0, correctKeys: 0 });

  // Leaderboard State
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

        const firstAuthor = Object.keys(indexData)[0];
        const firstWork = Object.keys(indexData[firstAuthor])[0];
        const firstPieceId = indexData[firstAuthor][firstWork][0].id;

        setSelectedAuthor(firstAuthor);
        setSelectedWork(firstWork);
        setSelectedPieceId(firstPieceId);

        // trigger the fetch for the first author
        fetchAuthorData(firstAuthor);
      });
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

  // reset engine helper
  const resetTest = () => {
    setWordIndex(0);
    setCurrentInput('');
    setTypedHistory([]);
    setStartTime(null);
    setStats({ wpm: 0, acc: 100, totalKeys: 0, correctKeys: 0 });
    setIsFinished(false);
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

    // Detect piece change
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

      setStats(prev => ({
        ...prev,
        wpm: Math.max(0, Math.round((prev.correctKeys / 5) / timeElapsedMin)),
        acc: prev.totalKeys > 0 ? Math.round((prev.correctKeys / prev.totalKeys) * 100) : 100
      }));

      if (testMode === 'time') {
        const remaining = Math.max(0, timeLimit - Math.floor(timeElapsedMs / 1000));
        setTimeRemaining(remaining);
        if (remaining <= 0) {
          setIsFinished(true);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [startTime, isFinished, testMode, timeLimit]);

  // Lofi Audio Control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = lofiVolume;
      if (lofiEnabled) {
        audioRef.current.play().catch(e => console.error("Audio play failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [lofiEnabled, lofiVolume]);

  const playClickSound = () => {
    if (volume === 0) return;
    const click = new Audio('/click.mp3');
    click.volume = volume;
    click.playbackRate = 0.95 + Math.random() * 0.1;
    click.preservesPitch = false;
    click.play().catch(() => { });
  };

  const handleKeyDown = (e) => {
    if (isFinished || isFetchingAuthor || isAppLoading) return;

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
      className="min-h-screen bg-mt-bg text-mt-text flex flex-col items-center justify-center p-8 tracking-wide relative"
      onClick={focusInput}
      style={{ fontFamily: fontFamily }}
    >
      {bgImage !== 'none' && (
        <div
          className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center transition-opacity duration-300"
          style={{ backgroundImage: `url(${bgImage})`, opacity: bgOpacity }}
        />
      )}

      <audio ref={audioRef} src="/lofi.mp3" loop />

      {/* absolute header so viewport can perfectly center */}
      <div className="absolute top-0 left-0 right-0 pt-4 sm:pt-8 px-4 sm:px-8 z-20 w-full flex justify-center pointer-events-none">
        <div className="w-full max-w-[1600px] flex justify-between items-start pointer-events-auto">

          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-mt-text tracking-tighter mt-1">
              latin<span className="text-mt-main">type</span>
            </h1>

            <div className={`flex gap-6 mt-6 transition-opacity duration-500 ${startTime ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex flex-col">
                <span className="text-[0.65rem] uppercase tracking-widest text-mt-sub/70 font-bold mb-1">wpm</span>
                <span className="text-4xl font-light text-mt-text leading-none">{stats.wpm}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[0.65rem] uppercase tracking-widest text-mt-sub/70 font-bold mb-1">acc</span>
                <span className="text-4xl font-light text-mt-text leading-none">{stats.acc}%</span>
              </div>
              {testMode === 'time' && (
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
                onClick={(e) => { e.stopPropagation(); setTestMode('passage'); }}
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
            </div>

            {/*navigation*/}
            <div className="flex gap-3 bg-mt-bg/80 backdrop-blur-md p-1 rounded-lg shadow-lg justify-end w-full">
              {testMode === 'passage' ? (
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
              ) : (
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
                onClick={(e) => { e.stopPropagation(); setLofiEnabled(!lofiEnabled); }}
                onWheel={(e) => {
                  e.stopPropagation();
                  if (!lofiEnabled) return;
                  const delta = e.deltaY > 0 ? -0.01 : 0.01;
                  setLofiVolume(prev => Math.max(0, Math.min(1, prev + delta)));
                }}
                className={`relative overflow-hidden py-1 px-4 rounded-lg text-xs font-bold transition-colors duration-200 select-none ${lofiEnabled ? 'text-mt-bg' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'}`}
              >
                {lofiEnabled && (
                  <div 
                    className="absolute inset-y-0 left-0 bg-mt-main z-0" 
                    style={{ width: `${lofiVolume * 100}%` }}
                  />
                )}
                {lofiEnabled && (
                  <div className="absolute inset-0 bg-mt-main/30 z-0" />
                )}
                <span className="relative z-10 whitespace-nowrap">
                  🎵 Lofi: {lofiEnabled ? `${Math.round(lofiVolume * 100)}%` : 'OFF'}
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
      <div className="relative z-10 w-full max-w-[1600px] flex flex-col items-center px-4 justify-center flex-grow mt-32 sm:mt-0">

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
            <h2 className="text-3xl font-bold text-mt-main mb-2">
              {testMode === 'time' ? (timeRemaining <= 0 ? "Time's Up!" : "Passage Completed") : "Passage Completed"}
            </h2>
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
            
            <div className="flex flex-col items-center mb-8 w-full max-w-sm">
              <input 
                type="text" 
                placeholder="Enter name for leaderboard..." 
                className="w-full bg-mt-bg/80 border border-mt-sub/30 rounded-lg px-4 py-2 text-mt-text outline-none focus:border-mt-main transition-colors mb-2 text-center" 
                maxLength={20}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                disabled={scoreSaved || isSaving}
              />
              <button 
                className={`w-full font-bold py-2 rounded-lg transition-colors ${scoreSaved ? 'bg-mt-main/20 text-mt-main' : 'bg-mt-main text-mt-bg hover:bg-opacity-80'}`}
                disabled={scoreSaved || isSaving}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (stats.wpm === 0) return;
                  setIsSaving(true);
                  try {
                    await addDoc(collection(db, "scores"), {
                      name: (playerName || "Anonymous").trim().substring(0, 20),
                      wpm: stats.wpm,
                      acc: stats.acc,
                      mode: testMode,
                      duration: testMode === 'time' ? timeLimit : null,
                      passage: testMode === 'passage' ? `${selectedAuthor} - ${selectedWork}` : null,
                      date: new Date().toISOString()
                    });
                    setScoreSaved(true);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {isSaving ? "Saving..." : (scoreSaved ? "Score Saved!" : "Submit Score")}
              </button>
            </div>

            <div className="flex gap-4">
              <button className="px-8 py-3 bg-mt-sub-alt text-mt-text hover:bg-mt-main hover:text-mt-bg transition-colors duration-200 rounded-lg font-bold text-lg" onClick={(e) => { e.stopPropagation(); resetTest(); }}>
                Restart Test
              </button>
              {testMode === 'time' && (
                <button className="px-8 py-3 bg-mt-sub-alt text-mt-text hover:bg-mt-main hover:text-mt-bg transition-colors duration-200 rounded-lg font-bold text-lg" onClick={(e) => { e.stopPropagation(); loadRandomTimeAttack(); }}>
                  Next Random
                </button>
              )}
            </div>
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
                <div key={lIdx} className={`absolute left-0 w-full flex items-center flex-nowrap whitespace-nowrap transition-opacity duration-500 ${lineOpacity}`} style={{ top: `${lIdx * lineHeightPx}px`, height: `${lineHeightPx}px` }}>
                  {lineObj.words.map((wObj, wIdx) => {
                    const { word, globalIdx } = wObj;
                    const isCurrentWord = globalIdx === wordIndex;
                    const isPastWord = globalIdx < wordIndex;
                    const userTypedWord = isPastWord ? typedHistory[globalIdx] : (isCurrentWord ? currentInput : '');
                    const vowelIndices = getVowelIndices(word);
                    const wordScansion = lineObj.scansion?.[wIdx] || "";
                    const nextWordScansion = lineObj.scansion?.[wIdx + 1] || "";
                    const doesElideForward = wordScansion.endsWith(' ') || nextWordScansion.startsWith(' ');

                    return (
                      <div key={globalIdx} className="inline-block mr-4 relative">
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

                          return (
                            <span key={cIdx} className="relative inline-block">
                              {showScansion && distance === 0 && symbol && symbol !== ' ' && (
                                <span className="absolute top-[-0.7em] left-1/2 -translate-x-1/2 text-[0.65em] text-mt-main/80 font-bold select-none leading-none">{symbol}</span>
                              )}
                              <span className={`${charColor} transition-colors duration-100 drop-shadow-md`}>{char}</span>
                            </span>
                          );
                        })}
                        {userTypedWord.length > word.length && (
                          <span className="text-mt-error-extra opacity-80 relative z-10">{userTypedWord.slice(word.length)}</span>
                        )}
                        {isCurrentWord && (
                          <span className="absolute bg-mt-main animate-pulse rounded-sm opacity-90 shadow-[0_0_8px_rgba(226,183,20,0.4)]" style={{ bottom: '0.1em', width: '0.15em', height: '1.1em', left: `calc(${Math.min(currentInput.length, word.length)}ch + ${Math.min(currentInput.length, word.length) * 0.025}em)`, transition: 'left 0.1s ease-out' }} />
                        )}
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
    </div>
  );
}