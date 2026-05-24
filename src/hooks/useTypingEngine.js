import { useReducer, useEffect, useCallback } from 'react';

const normalizeChar = (char) => char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function typingReducer(state, action) {
  switch (action.type) {
    case 'START_ENGINE':
      return { ...state, startTime: Date.now() };
    case 'SET_INPUT': {
      const { lines, wordIndex, startTime } = state;
      const flatWords = lines.flatMap(l => l.words);
      const activeWordObj = flatWords.find(w => w.globalIdx === wordIndex);
      
      let nextState = { ...state, currentInput: action.payload };
      if (!startTime && action.payload.length > 0) nextState.startTime = Date.now();

      if (activeWordObj) {
        const expectedWord = activeWordObj.word;
        const normalizedExpected = expectedWord.split('').map(normalizeChar).join('');
        if (wordIndex === flatWords.length - 1 && nextState.currentInput === normalizedExpected) {
          nextState.isFinished = true;
        }
      }
      return nextState;
    }
    case 'SPACE_PRESSED': {
      const { lines, currentInput, wordIndex, typedHistory } = state;
      if (currentInput.trim().length === 0) return state;

      const flatWords = lines.flatMap(l => l.words);
      const isLastWord = wordIndex === flatWords.length - 1;

      return {
        ...state,
        typedHistory: [...typedHistory, currentInput.trim()],
        wordIndex: wordIndex + 1,
        currentInput: '',
        isFinished: isLastWord ? true : state.isFinished
      };
    }
    case 'BACKSPACE_PRESSED': {
      const { currentInput, wordIndex, typedHistory } = state;
      if (currentInput === '' && wordIndex > 0) {
        const newHistory = [...typedHistory];
        const previousInput = newHistory.pop();
        return {
          ...state,
          typedHistory: newHistory,
          wordIndex: wordIndex - 1,
          currentInput: previousInput
        };
      }
      return state;
    }
    case 'CHAR_TYPED': {
      if (!state.startTime) return { ...state, startTime: Date.now() };
      return state;
    }
    case 'COMPUTE_STATS': {
      const { timeElapsedMs } = action.payload;
      const timeElapsedMin = timeElapsedMs / 60000;
      const { lines, typedHistory, currentInput } = state;
      
      const flatWords = lines.flatMap(l => l.words);
      let totalKeys = 0;
      let correctKeys = 0;

      // Calculate from history
      for (let i = 0; i < typedHistory.length; i++) {
        const typed = typedHistory[i];
        const expected = flatWords[i]?.word || '';
        const normalizedExpected = expected.split('').map(normalizeChar).join('');
        
        if (i > 0) {
          totalKeys++; // Space
          correctKeys++;
        }
        totalKeys += typed.length;
        for (let c = 0; c < typed.length; c++) {
          if (typed[c] === normalizedExpected[c]) correctKeys++;
        }
      }

      // Calculate from current input
      if (currentInput.length > 0) {
        if (typedHistory.length > 0) {
          totalKeys++; // Space
          correctKeys++;
        }
        const expected = flatWords[typedHistory.length]?.word || '';
        const normalizedExpected = expected.split('').map(normalizeChar).join('');
        
        totalKeys += currentInput.length;
        for (let c = 0; c < currentInput.length; c++) {
          if (currentInput[c] === normalizedExpected[c]) correctKeys++;
        }
      }

      const wpm = timeElapsedMin > 0 ? Math.max(0, Math.round((correctKeys / 5) / timeElapsedMin)) : 0;
      const acc = totalKeys > 0 ? Math.round((correctKeys / totalKeys) * 100) : 100;

      return { ...state, stats: { wpm, acc, totalKeys, correctKeys } };
    }
    case 'FINISH':
      return { ...state, isFinished: true };
    case 'RESET':
      return {
        ...state,
        lines: action.payload.lines || [],
        wordIndex: 0,
        currentInput: '',
        typedHistory: [],
        startTime: null,
        isFinished: false,
        stats: { wpm: 0, acc: 100, totalKeys: 0, correctKeys: 0 }
      };
    default:
      return state;
  }
}

export function useTypingEngine(initialLines = []) {
  const [state, dispatch] = useReducer(typingReducer, {
    lines: initialLines,
    wordIndex: 0,
    currentInput: '',
    typedHistory: [],
    startTime: null,
    isFinished: false,
    stats: { wpm: 0, acc: 100, totalKeys: 0, correctKeys: 0 }
  });

  const resetEngine = useCallback((lines) => {
    dispatch({ type: 'RESET', payload: { lines } });
  }, []);

  const handleKeyDown = useCallback((e, handlers = {}) => {
    const { onSpace, onChar, onBackspace, isBlocked } = handlers;
    
    if (isBlocked) return;
    
    if (e.key === ' ') {
      e.preventDefault();
      dispatch({ type: 'SPACE_PRESSED' });
      if (onSpace) onSpace();
    } else if (e.key === 'Backspace') {
      dispatch({ type: 'BACKSPACE_PRESSED' });
      if (onBackspace) onBackspace();
    } else if (e.key.length === 1) {
      dispatch({ type: 'CHAR_TYPED', payload: e.key });
      if (onChar) onChar(e.key);
    }
  }, []);

  return {
    state,
    dispatch,
    resetEngine,
    handleKeyDown
  };
}
