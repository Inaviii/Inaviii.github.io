import React, { useState, useEffect, useRef } from 'react';

const fonts = [
  { name: "Cutive Mono", value: '"Cutive Mono", monospace' },
  { name: "Courier Prime", value: '"Courier Prime", monospace' },
  { name: "Syne Mono", value: '"Syne Mono", monospace' },
  { name: "Courier New", value: '"Courier New", Courier, monospace' },
  { name: "Consolas", value: 'Consolas, monospace' },
  { name: "Lucida Console", value: '"Lucida Console", Monaco, monospace' },
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

export default function ReadMode() {
  const [libraryIndex, setLibraryIndex] = useState(null);
  const [activeAuthorData, setActiveAuthorData] = useState(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFetchingAuthor, setIsFetchingAuthor] = useState(false);

  // cascades
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [selectedWork, setSelectedWork] = useState('');
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [lineRange, setLineRange] = useState({ start: 1, end: 1, max: 1 });
  const [loadedPieceId, setLoadedPieceId] = useState(null);

  // content
  const [lines, setLines] = useState([]);
  const textContainerRef = useRef(null);

  // styling
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('bgImage') || 'none');
  const [bgOpacity, setBgOpacity] = useState(() => parseFloat(localStorage.getItem('bgOpacity')) || 1);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('fontFamily') || '"Cutive Mono", monospace');
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('fontSize')) || 24);
  const [showScansion, setShowScansion] = useState(() => localStorage.getItem('showScansion') === 'true');

  useEffect(() => {
    localStorage.setItem('showScansion', showScansion);
  }, [showScansion]);

  // fetch index on mount
  useEffect(() => {
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

  useEffect(() => {
    if (loadedPieceId) {
      localStorage.setItem(`read_start_${loadedPieceId}`, lineRange.start);
      localStorage.setItem(`read_end_${loadedPieceId}`, lineRange.end);
    }
  }, [lineRange.start, lineRange.end, loadedPieceId]);

  const fetchAuthorData = (authorName) => {
    setIsFetchingAuthor(true);
    const safeFilename = authorName.toLowerCase().replace(/ /g, "_") + ".json";

    fetch(`/library/${safeFilename}?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(data => {
        setActiveAuthorData(data);
        setIsFetchingAuthor(false);
        setIsAppLoading(false);
      });
  };

  const handleAuthorChange = (e) => {
    const newAuthor = e.target.value;
    setSelectedAuthor(newAuthor);
    const firstWork = Object.keys(libraryIndex[newAuthor])[0];
    setSelectedWork(firstWork);
    setSelectedPieceId(libraryIndex[newAuthor][firstWork][0].id);
    fetchAuthorData(newAuthor);
  };

  const handleWorkChange = (e) => {
    const newWork = e.target.value;
    setSelectedWork(newWork);
    setSelectedPieceId(libraryIndex[selectedAuthor][newWork][0].id);
  };

  // Build the text whenever the selection changes
  useEffect(() => {
    if (!libraryIndex || !activeAuthorData || !selectedAuthor || !selectedWork || !selectedPieceId || isFetchingAuthor) return;

    const piece = activeAuthorData.find(p => p.id === selectedPieceId);
    if (!piece) return;

    const rawLines = piece.text.split('\n');
    const rawScansion = piece.scansion || [];
    const totalLines = rawLines.length;

    if (loadedPieceId !== selectedPieceId) {
      setLoadedPieceId(selectedPieceId);
      const savedStart = parseInt(localStorage.getItem(`read_start_${selectedPieceId}`));
      const savedEnd = parseInt(localStorage.getItem(`read_end_${selectedPieceId}`));
      setLineRange({ 
        start: savedStart || 1, 
        end: savedEnd || totalLines, 
        max: totalLines 
      });
      if (textContainerRef.current) textContainerRef.current.scrollTop = 0;
      return; // wait for next render with updated lineRange
    }

    const startIdx = Math.max(0, lineRange.start - 1);
    const endIdx = Math.min(totalLines, lineRange.end);

    const activeLines = rawLines.slice(startIdx, endIdx);
    const activeScansion = rawScansion.length ? rawScansion.slice(startIdx, endIdx) : [];

    setLines(activeLines.map((lineStr, lIdx) => ({
      text: lineStr,
      words: lineStr.trim().split(' ').filter(w => w.length > 0),
      scansion: activeScansion[lIdx] || null
    })));
  }, [libraryIndex, activeAuthorData, selectedPieceId, lineRange.start, lineRange.end, isFetchingAuthor, selectedAuthor, selectedWork, loadedPieceId]);


  if (isAppLoading || !libraryIndex) {
    return <div className="min-h-screen bg-mt-bg text-mt-main flex items-center justify-center font-bold text-2xl animate-pulse">Loading Library Index...</div>;
  }

  const uniqueAuthors = Object.keys(libraryIndex);
  const availableWorks = Object.keys(libraryIndex[selectedAuthor]);
  const availablePieces = libraryIndex[selectedAuthor][selectedWork];

  return (
    <div
      className="h-screen bg-mt-bg text-mt-text flex flex-col items-center justify-start p-4 sm:p-8 tracking-wide relative overflow-hidden"
      style={{ fontFamily: fontFamily }}
    >
      {bgImage !== 'none' && (
        <div
          className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center transition-all duration-500"
          style={{ backgroundImage: `url(${bgImage})`, opacity: bgOpacity }}
        />
      )}

      {/* Header */}
      <div className="w-full z-20 flex justify-center shrink-0 mb-8 sm:mb-12 mt-16 sm:mt-0">
        <div className="w-full max-w-[1200px] flex flex-col sm:flex-row sm:justify-between items-start gap-4 sm:gap-0 pointer-events-auto">

          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-mt-text tracking-tighter mt-1">
              latin<span className="text-mt-main">type</span> <span className="text-mt-sub text-sm uppercase tracking-widest font-normal ml-2 opacity-50">/ Read</span>
            </h1>
          </div>

          <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
            <div className="flex gap-3 bg-mt-bg/80 backdrop-blur-md p-1 rounded-lg shadow-lg justify-end w-full sm:w-auto overflow-x-auto">
              <select
                className="bg-transparent text-mt-main hover:text-mt-text transition-colors duration-200 py-2 px-3 outline-none cursor-pointer text-sm font-bold max-w-[100px] sm:max-w-35 truncate"
                value={selectedAuthor}
                onChange={handleAuthorChange}
              >
                {uniqueAuthors.map((author) => <option key={author} value={author} className="bg-mt-bg text-mt-text">{author}</option>)}
              </select>

              <span className="text-mt-sub/30 py-2 select-none shrink-0">/</span>

              <select
                className="bg-transparent text-mt-text hover:text-mt-sub transition-colors duration-200 py-2 px-3 outline-none cursor-pointer text-sm font-bold max-w-[120px] sm:max-w-45 truncate"
                value={selectedWork}
                onChange={handleWorkChange}
              >
                {availableWorks.map((work) => <option key={work} value={work} className="bg-mt-bg text-mt-text">{work}</option>)}
              </select>

              {availablePieces.length > 1 && (
                <>
                  <span className="text-mt-sub/30 py-2 select-none shrink-0">/</span>
                  <select
                    className="bg-mt-sub-alt text-mt-text hover:text-mt-main transition-colors duration-200 py-2 px-4 rounded-md outline-none cursor-pointer text-sm max-w-[140px] sm:max-w-50 truncate"
                    value={selectedPieceId}
                    onChange={(e) => setSelectedPieceId(e.target.value)}
                  >
                    {availablePieces.map((piece) => <option key={piece.id} value={piece.id} className="bg-mt-bg text-mt-text">{piece.piece}</option>)}
                  </select>
                </>
              )}
            </div>

            <div className="flex gap-3 items-center w-full sm:w-auto justify-end">
              <div className="flex items-center gap-2 bg-mt-sub-alt rounded-md px-3 py-1 shrink-0 shadow-lg">
                <span className="text-mt-sub text-[0.65rem] font-bold uppercase tracking-widest hidden sm:inline">Lines</span>
                <input
                  type="number" min="1" max={lineRange.max} value={lineRange.start}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setLineRange(prev => ({ ...prev, start: Math.min(val, prev.end) }));
                  }}
                  className="bg-transparent text-mt-text text-sm font-bold w-12 text-center outline-none"
                />
                <span className="text-mt-sub/50">-</span>
                <input
                  type="number" min="1" max={lineRange.max} value={lineRange.end}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || lineRange.max;
                    setLineRange(prev => ({ ...prev, end: Math.max(val, prev.start) }));
                  }}
                  className="bg-transparent text-mt-text text-sm font-bold w-12 text-center outline-none"
                />
              </div>

              <select
                className="bg-mt-sub-alt text-mt-sub hover:text-mt-text transition-colors duration-200 py-1.5 px-3 rounded-lg outline-none cursor-pointer text-xs shadow-lg"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              >
                {fonts.map((f) => <option key={f.name} value={f.value}>{f.name}</option>)}
              </select>

              <button
                onClick={(e) => { e.stopPropagation(); setShowScansion(!showScansion); }}
                className={`transition-colors duration-200 py-1.5 px-3 rounded-lg text-xs font-bold shadow-lg shrink-0 ${showScansion ? 'bg-mt-main text-mt-bg' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'}`}
              >
                SCANSION
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reader Container */}
      <div className="relative z-10 w-fit max-w-full lg:max-w-[1200px] flex flex-col flex-grow min-h-0 bg-mt-bg/80 backdrop-blur-md rounded-xl shadow-2xl border border-mt-sub/10 mb-4 sm:mb-8 overflow-hidden">
        {isFetchingAuthor ? (
          <div className="text-center text-mt-sub animate-pulse py-12 px-8 sm:px-12">Fetching Text...</div>
        ) : (
          <div ref={textContainerRef} className="overflow-y-auto scroll-smooth w-full h-full p-8 sm:p-12 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-mt-sub/20 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="text-mt-text whitespace-pre-wrap leading-relaxed" style={{ fontSize: `${fontSize}px` }}>
              {lines.map((lineObj, i) => {
                if (!showScansion || !lineObj.scansion) {
                  return (
                    <p key={i} className={`py-1 ${i % 5 === 4 ? 'mb-4' : ''}`}>
                      <span className="inline-block w-8 text-right mr-4 text-mt-sub/40 text-xs font-mono select-none">{lineRange.start + i}</span>
                      {lineObj.text}
                    </p>
                  );
                }

                return (
                  <p key={i} className={`py-1 flex items-center ${i % 5 === 4 ? 'mb-4' : ''}`}>
                    <span className="inline-block w-8 text-right mr-4 text-mt-sub/40 text-xs font-mono select-none shrink-0" style={{ transform: 'translateY(-0.35em)' }}>{lineRange.start + i}</span>
                    <span className="flex items-center flex-wrap" style={{ lineHeight: '1.8' }}>
                      {lineObj.words.map((word, wIdx) => {
                        const wordScansion = lineObj.scansion[wIdx] || "";
                        const vowelIndices = getVowelIndices(word, wordScansion);
                        const nextWordScansion = lineObj.scansion[wIdx + 1] || "";
                        const doesElideForward = wordScansion.endsWith(' ') || nextWordScansion.startsWith(' ');

                        return (
                          <span key={wIdx} className={`inline-block relative ${wIdx !== lineObj.words.length - 1 ? 'mr-3' : ''}`}>
                            {doesElideForward && (
                              <svg className="absolute bottom-[-0.35em] right-[-0.8em] w-[1.2em] h-[0.6em] pointer-events-none text-mt-sub/50 z-0" viewBox="0 0 100 50" preserveAspectRatio="none">
                                <path d="M 10 15 Q 50 45 90 15" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                              </svg>
                            )}
                            {word.split('').map((char, cIdx) => {
                              const vowelSignIdx = vowelIndices.indexOf(cIdx);
                              const symbol = vowelSignIdx !== -1 ? wordScansion[vowelSignIdx] : null;

                              return (
                                <span key={cIdx} className="relative inline-block mt-3">
                                  {symbol && symbol !== ' ' && (
                                    <span className="absolute top-[-0.7em] left-1/2 -translate-x-1/2 text-[0.65em] text-mt-main/80 font-bold select-none leading-none">{symbol}</span>
                                  )}
                                  <span>{char}</span>
                                </span>
                              );
                            })}
                          </span>
                        );
                      })}
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
