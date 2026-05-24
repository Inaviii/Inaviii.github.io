import React, { createContext, useContext, useState, useEffect } from 'react';

export const backgrounds = [
  { name: "None (Solid Dark)", url: "none" },
  { name: "Marble", url: "/bg-statue.jpg" },
  { name: "Colliseum", url: "/bg-forum.jpg" },
  { name: "Papyrus", url: "/bg-manuscript.jpg" },
  { name: "Library", url: "/bg-library.jpg" }
];

export const fonts = [
  { name: "Cutive Mono", value: '"Cutive Mono", monospace' },
  { name: "Courier Prime", value: '"Courier Prime", monospace' },
  { name: "Syne Mono", value: '"Syne Mono", monospace' },
  { name: "Courier New", value: '"Courier New", Courier, monospace' },
  { name: "Consolas", value: 'Consolas, monospace' },
  { name: "Lucida Console", value: '"Lucida Console", Monaco, monospace' },
  { name: "OpenDyslexic", value: '"OpenDyslexic", sans-serif' },
];

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('bgImage') || backgrounds[1].url);
  const [bgOpacity, setBgOpacity] = useState(() => { const v = localStorage.getItem('bgOpacity'); return v !== null ? parseFloat(v) : 0.15; });
  const [volume, setVolume] = useState(() => { const v = localStorage.getItem('volume'); return v !== null ? parseFloat(v) : 0.2; });
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('fontFamily') || fonts.find(f => f.name === 'Syne Mono')?.value || fonts[0].value);
  const [fontSize, setFontSize] = useState(() => { const v = localStorage.getItem('fontSize'); return v !== null ? parseInt(v) : 36; });
  const [showScansion, setShowScansion] = useState(() => { const v = localStorage.getItem('showScansion'); return v !== null ? v === 'true' : true; });
  const [cursorStyle, setCursorStyle] = useState(() => localStorage.getItem('cursorStyle') || 'line');

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('bgImage', bgImage);
    localStorage.setItem('bgOpacity', bgOpacity);
    localStorage.setItem('volume', volume);
    localStorage.setItem('fontFamily', fontFamily);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('showScansion', showScansion);
    localStorage.setItem('cursorStyle', cursorStyle);
  }, [bgImage, bgOpacity, volume, fontFamily, fontSize, showScansion, cursorStyle]);

  return (
    <SettingsContext.Provider value={{
      bgImage, setBgImage,
      bgOpacity, setBgOpacity,
      volume, setVolume,
      fontFamily, setFontFamily,
      fontSize, setFontSize,
      showScansion, setShowScansion,
      cursorStyle, setCursorStyle,
      backgrounds, fonts
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
