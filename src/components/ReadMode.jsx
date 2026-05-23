import React, { useState, useEffect, useRef } from 'react';
import DictionaryPopup from './DictionaryPopup';
import { lookupWord } from '../lib/DictionaryService';

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

export default function ReadMode() {
  const [libraryIndex, setLibraryIndex] = useState(null);
  const [activeAuthorData, setActiveAuthorData] = useState(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFetchingAuthor, setIsFetchingAuthor] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);

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

  // syntax highlighting
  const [syntaxMode, setSyntaxMode] = useState(false);
  const [syntaxCache, setSyntaxCache] = useState({});

  // annotations
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotateTool, setAnnotateTool] = useState('highlighter'); // 'highlighter', 'pen', 'eraser'
  const [strokeColor, setStrokeColor] = useState('#e2b714'); 
  const [strokeWidth, setStrokeWidth] = useState(15);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  
  // Track strokes for uniform transparency and redraws
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('showScansion', showScansion);
  }, [showScansion]);

  // batch fetch syntax for all visible words
  useEffect(() => {
    if (!syntaxMode || !lines.length) return;
    
    const fetchSyntax = async () => {
      const newCache = { ...syntaxCache };
      let updated = false;
      
      const wordsToLookup = new Set();
      lines.forEach(line => {
        line.words.forEach(word => {
          const clean = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
          if (clean && !newCache[clean]) {
            wordsToLookup.add(clean);
          }
        });
      });
      
      if (wordsToLookup.size === 0) return;

      for (const word of wordsToLookup) {
        try {
          const res = await lookupWord(word);
          if (res && (res.results.length > 0 || res.uniqueResults.length > 0)) {
            const pos = res.results[0]?.partOfSpeech || res.uniqueResults[0]?.partOfSpeech || 'UNKNOWN';
            newCache[word] = pos;
          } else {
            newCache[word] = 'UNKNOWN';
          }
          updated = true;
        } catch (e) {
          console.warn('Syntax lookup failed for', word);
        }
      }
      
      if (updated) {
        setSyntaxCache(newCache);
      }
    };
    
    fetchSyntax();
  }, [syntaxMode, lines]);

  const getSyntaxColor = (word) => {
    if (!syntaxMode) return '';
    const clean = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
    const pos = syntaxCache[clean];
    if (!pos || pos === 'UNKNOWN') return '';
    
    switch(pos) {
      case 'V': return 'text-red-400 font-bold drop-shadow-md'; // Verbs
      case 'N': return 'text-blue-400 font-bold drop-shadow-md'; // Nouns
      case 'ADJ': return 'text-green-400 font-bold drop-shadow-md'; // Adjectives
      case 'ADV': return 'text-yellow-400 font-bold drop-shadow-md'; // Adverbs
      case 'PRON': return 'text-purple-400 font-bold drop-shadow-md'; // Pronouns
      case 'PREP':
      case 'CONJ': return 'text-gray-400'; // Prepositions/Conjunctions
      default: return '';
    }
  };

  // canvas resize observer
  useEffect(() => {
    if (!canvasContainerRef.current || !canvasRef.current) return;
    const resizeCanvas = () => {
      const container = canvasContainerRef.current;
      const canvas = canvasRef.current;
      
      if (!container || !canvas) return; // Prevent crash if unmounted
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let data = null;
      try {
        data = canvas.width > 0 && canvas.height > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      } catch (e) {
        console.warn("Canvas is too large to save image data during resize.", e);
      }
      
      canvas.width = container.scrollWidth;
      canvas.height = container.scrollHeight;
      canvas.style.width = `${container.scrollWidth}px`;
      // Restore drawing data from stroke history instead of image data to maintain high quality on resize
      redrawCanvas();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [lines, fontSize, showScansion, isAnnotating]); // Re-sync when layout might change

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const drawStroke = (stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.width;
      
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = 1.0;
      } else {
        // 'multiply' doesn't look great on dark themes, so we use standard alpha blending
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.4 : 1.0;
      }
      ctx.stroke();
    };

    strokesRef.current.forEach(drawStroke);
    if (currentStrokeRef.current) {
      drawStroke(currentStrokeRef.current);
    }
  };

  // drawing methods
  const startDrawing = (e) => {
    if (!isAnnotating) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    setIsDrawing(true);
    
    currentStrokeRef.current = {
      tool: annotateTool,
      color: strokeColor,
      width: strokeWidth,
      points: [{ x: e.clientX - rect.left, y: e.clientY - rect.top }]
    };
    
    redrawCanvas();
  };

  const draw = (e) => {
    if (!isDrawing || !isAnnotating || !currentStrokeRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    currentStrokeRef.current.points.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    redrawCanvas();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentStrokeRef.current) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = null;
    }
  };

  const handleClearAnnotations = () => {
    if (window.confirm("Are you sure you want to clear all annotations?")) {
      strokesRef.current = [];
      redrawCanvas();
    }
  };

  const handleUndo = () => {
    if (strokesRef.current.length > 0) {
      strokesRef.current.pop();
      redrawCanvas();
    }
  };

  // Keyboard shortcut for Undo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (isAnnotating) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnnotating]);

  const exportPDF = async () => {
    const container = canvasContainerRef.current;
    if (!container) return;
    
    try {
      const html2canvasModule = await import('html2canvas-pro');
      const html2canvas = html2canvasModule.default ? html2canvasModule.default : html2canvasModule;
      
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.jsPDF ? jsPDFModule.jsPDF : jsPDFModule.default;

      // Use a scale of 1 to prevent the internal canvas from exceeding browser size limits on long texts
      const canvas = await html2canvas(container, {
        backgroundColor: '#FFFFFF', 
        scale: 1,
        useCORS: true,
        onclone: (documentClone) => {
          // Inject print-specific styles to force black text and transparent containers
          const style = documentClone.createElement('style');
          style.innerHTML = `
            .text-mt-text { color: #000000 !important; }
            .text-mt-sub { color: #666666 !important; }
            .text-mt-main { color: #000000 !important; }
            .bg-mt-bg\\/80 { 
              background-color: transparent !important; 
              backdrop-filter: none !important;
              box-shadow: none !important;
              border: none !important;
            }
          `;
          documentClone.head.appendChild(style);
        }
      });
      
      // Use JPEG to prevent massive Out-Of-Memory data URIs
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      
      // Initialize standard A4 PDF
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      const ratio = pdfWidth / canvasWidth;
      const scaledHeight = canvasHeight * ratio;
      
      let heightLeft = scaledHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;
      
      // Add new pages until we've covered the whole height
      while (heightLeft > 0) {
        position = heightLeft - scaledHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, scaledHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`latintype_reading_${selectedAuthor}.pdf`);
    } catch (e) {
      console.error("PDF Export failed", e);
      alert("Failed to export PDF. The text selection may be too large.");
    }
  };

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
                onClick={(e) => { e.stopPropagation(); setSyntaxMode(!syntaxMode); }}
                className={`transition-colors duration-200 py-1.5 px-3 rounded-lg text-xs font-bold shadow-lg shrink-0 ${syntaxMode ? 'bg-mt-main text-mt-bg' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'}`}
                title="Color-code by Part of Speech"
              >
                🎨 SYNTAX
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setShowScansion(!showScansion); }}
                className={`transition-colors duration-200 py-1.5 px-3 rounded-lg text-xs font-bold shadow-lg shrink-0 ${showScansion ? 'bg-mt-main text-mt-bg' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'}`}
              >
                SCANSION
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setIsAnnotating(!isAnnotating); }}
                className={`transition-colors duration-200 py-1.5 px-3 rounded-lg text-xs font-bold shadow-lg shrink-0 flex items-center gap-1 ${isAnnotating ? 'bg-mt-main text-mt-bg' : 'bg-mt-sub-alt text-mt-sub hover:text-mt-text'}`}
              >
                ✎ ANNOTATE
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
          <div ref={textContainerRef} className={`overflow-y-auto scroll-smooth w-full h-full p-8 sm:p-12 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-mt-sub/20 [&::-webkit-scrollbar-thumb]:rounded-full ${isAnnotating ? 'cursor-crosshair' : ''}`}>
            <div className="relative w-full" ref={canvasContainerRef}>
              
              <canvas
                ref={canvasRef}
                className={`absolute top-0 left-0 z-20 ${isAnnotating ? 'pointer-events-auto' : 'pointer-events-none'}`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />

              <div className="text-mt-text whitespace-pre-wrap leading-relaxed relative z-0" style={{ fontSize: `${fontSize}px` }}>
              {lines.map((lineObj, i) => {



                return (
                  <p key={i} className={`py-1 flex items-center ${i % 5 === 4 ? 'mb-4' : ''}`}>
                    <span className="inline-block w-8 text-right mr-4 text-mt-sub/40 text-xs font-mono select-none shrink-0" style={{ transform: 'translateY(-0.35em)' }}>{lineRange.start + i}</span>
                    <span className="flex items-center flex-wrap" style={{ lineHeight: '1.8' }}>
                      {lineObj.words.map((word, wIdx) => {
                        const wordScansion = lineObj.scansion ? (lineObj.scansion[wIdx] || "") : "";
                        const vowelIndices = getVowelIndices(word, wordScansion);
                        const nextWordScansion = lineObj.scansion ? (lineObj.scansion[wIdx + 1] || "") : "";
                        const doesElideForward = wordScansion.endsWith(' ') || nextWordScansion.startsWith(' ');

                        return (
                          <span 
                            key={wIdx} 
                            className={`inline-block relative cursor-pointer hover:bg-mt-sub/20 rounded px-1 -mx-1 transition-colors ${wIdx !== lineObj.words.length - 1 ? 'mr-3' : ''} ${getSyntaxColor(word)}`}
                            onClick={() => setSelectedWord(word)}
                            title="Click to look up"
                          >
                            {showScansion && doesElideForward && (
                              <svg className="absolute bottom-[-0.35em] right-[-0.8em] w-[1.2em] h-[0.6em] pointer-events-none text-mt-sub/50 z-0" viewBox="0 0 100 50" preserveAspectRatio="none">
                                <path d="M 10 15 Q 50 45 90 15" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                              </svg>
                            )}
                            {word.split('').map((char, cIdx) => {
                              const vowelSignIdx = vowelIndices.indexOf(cIdx);
                              const symbol = vowelSignIdx !== -1 ? wordScansion[vowelSignIdx] : null;
                              const isDiphthong = symbol ? isDiphthongStart(word, cIdx, vowelIndices) : false;

                              return (
                                <span key={cIdx} className="relative inline-block mt-3">
                                  {showScansion && symbol && symbol !== ' ' && (
                                    <span 
                                      className="absolute top-[-0.7em] -translate-x-1/2 text-[0.65em] text-mt-main/80 font-bold select-none leading-none"
                                      style={{ left: isDiphthong ? '100%' : '50%' }}
                                    >
                                      {symbol}
                                    </span>
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
          </div>
        )}
      </div>

      {/* Annotation Toolbar */}
      {isAnnotating && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-mt-bg/95 backdrop-blur-md border border-mt-sub/20 rounded-2xl px-6 py-4 shadow-2xl flex flex-wrap items-center gap-6 animate-fade-in pointer-events-auto">
          <div className="flex gap-2 bg-mt-sub-alt/50 p-1 rounded-lg">
            <button onClick={handleUndo} className="p-2 rounded text-mt-sub hover:text-mt-text transition-colors" title="Undo (Ctrl+Z)">↩️</button>
            <div className="w-px bg-mt-sub/20 my-1"></div>
            <button onClick={() => setAnnotateTool('highlighter')} className={`p-2 rounded transition-colors ${annotateTool === 'highlighter' ? 'bg-mt-bg shadow text-mt-main' : 'text-mt-sub hover:text-mt-text'}`} title="Highlighter">🖌️</button>
            <button onClick={() => setAnnotateTool('pen')} className={`p-2 rounded transition-colors ${annotateTool === 'pen' ? 'bg-mt-bg shadow text-mt-main' : 'text-mt-sub hover:text-mt-text'}`} title="Pen">🖊️</button>
            <button onClick={() => setAnnotateTool('eraser')} className={`p-2 rounded transition-colors ${annotateTool === 'eraser' ? 'bg-mt-bg shadow text-mt-main' : 'text-mt-sub hover:text-mt-text'}`} title="Eraser">🧽</button>
          </div>

          <div className="h-8 w-px bg-mt-sub/20 hidden sm:block"></div>

          <div className="flex items-center gap-2">
            {['#e2b714', '#e25822', '#228be6', '#40c057', '#dcdcaa', '#cdd6f4'].map(color => (
              <button
                key={color}
                onClick={() => setStrokeColor(color)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${strokeColor === color ? 'scale-125 border-mt-text' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: color }}
                title="Color Picker"
              />
            ))}
          </div>

          <div className="h-8 w-px bg-mt-sub/20 hidden sm:block"></div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-mt-sub uppercase tracking-widest hidden sm:inline">Size</span>
            <input type="range" min="2" max="40" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-20 sm:w-24 accent-mt-main" title="Thickness" />
          </div>

          <div className="h-8 w-px bg-mt-sub/20 hidden sm:block"></div>

          <button onClick={handleClearAnnotations} className="text-mt-error hover:text-red-400 font-bold text-xs uppercase tracking-widest px-2 transition-colors">Clear</button>
          
          <button onClick={exportPDF} className="bg-mt-main text-mt-bg hover:bg-mt-text font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-lg transition-colors shadow-lg flex items-center gap-2">
            <span>💾</span> Save PDF
          </button>
        </div>
      )}

      <DictionaryPopup 
        word={selectedWord} 
        onClose={() => setSelectedWord(null)} 
      />
    </div>
  );
}
