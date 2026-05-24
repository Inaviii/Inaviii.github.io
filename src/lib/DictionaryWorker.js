import { WordsEngine } from 'whitakers-words';

let engineInstance = null;
let enginePromise = null;

async function initEngine(baseUrl) {
  if (engineInstance) return engineInstance;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    try {
      const [dictline, inflects, addons, uniques] = await Promise.all([
        fetch(`${baseUrl}whitakers/DICTLINE.GEN`).then(r => r.text()),
        fetch(`${baseUrl}whitakers/INFLECTS.LAT`).then(r => r.text()),
        fetch(`${baseUrl}whitakers/ADDONS.LAT`).then(r => r.text()),
        fetch(`${baseUrl}whitakers/UNIQUES.LAT`).then(r => r.text()),
      ]);

      engineInstance = WordsEngine.create({
        dictline,
        inflects,
        addons,
        uniques
      });
      
      postMessage({ type: 'READY' });
      return engineInstance;
    } catch (e) {
      console.error("Worker failed to initialize WordsEngine", e);
      enginePromise = null;
      throw e;
    }
  })();

  return enginePromise;
}

self.onmessage = async (e) => {
  const { type, payload, id, baseUrl } = e.data;

  if (type === 'INIT') {
    await initEngine(baseUrl);
  } else if (type === 'LOOKUP') {
    try {
      const engine = await initEngine(baseUrl);
      const result = engine.parseWord(payload);
      postMessage({ type: 'LOOKUP_RESULT', id, payload: result });
    } catch (error) {
      postMessage({ type: 'LOOKUP_ERROR', id, payload: error.message });
    }
  }
};
