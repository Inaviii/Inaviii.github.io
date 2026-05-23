import React, { useState, useEffect } from 'react';
import { lookupWord } from '../lib/DictionaryService';
import { formatWordAnalysis } from 'whitakers-words';

export default function DictionaryPopup({ word, onClose }) {
  const [loading, setLoading] = useState(false);
  const [definition, setDefinition] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!word) return;

    const fetchDefinition = async () => {
      setLoading(true);
      setError('');
      try {
        // Strip macrons and punctuation for the API lookup
        const cleanWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
        
        if (!cleanWord) {
          setError('Invalid word');
          setLoading(false);
          return;
        }

        const result = await lookupWord(cleanWord);
        
        if (result && (result.results.length > 0 || result.uniqueResults.length > 0 || result.trickResults.length > 0 || (result.addonResults && result.addonResults.length > 0))) {
           setDefinition(formatWordAnalysis(result));
        } else {
           setError('Word not found in dictionary.');
        }
      } catch (err) {
        console.error(err);
        setError('Error loading or parsing dictionary data.');
      }
      setLoading(false);
    };

    fetchDefinition();

    // Add escape key listener to close
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [word, onClose]);

  if (!word) return null;

  // Clean the display word to keep macrons but remove punctuation
  const displayWord = word.replace(/[^a-zA-ZāēīōūȳĀĒĪŌŪȲ]/g, '');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div 
        className="bg-mt-bg/95 border border-mt-sub/30 rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto relative cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-mt-sub hover:text-mt-error transition-colors"
          title="Close (Esc)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-mt-main mb-4 border-b border-mt-sub/20 pb-2 capitalize">
          {displayWord}
        </h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-mt-sub/30 border-t-mt-main rounded-full animate-spin"></div>
            <p className="text-mt-sub mt-4 font-mono text-sm animate-pulse tracking-wider">Consulting the oracles...</p>
          </div>
        ) : error ? (
          <div className="text-mt-error text-center py-8 font-mono">{error}</div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-mt-text p-4 bg-black/20 rounded-lg overflow-x-auto shadow-inner">
            {definition}
          </pre>
        )}
      </div>
    </div>
  );
}
