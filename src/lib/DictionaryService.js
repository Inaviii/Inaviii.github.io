let worker = null;
let initPromise = null;
const resolvers = new Map();
let nextId = 1;

export async function initDictionaryWorker() {
  if (worker) return worker;
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      worker = new Worker(new URL('./DictionaryWorker.js', import.meta.url), { type: 'module' });
      
      worker.onmessage = (e) => {
        const { type, id, payload } = e.data;
        if (type === 'READY') {
          resolve(worker);
        } else if (type === 'LOOKUP_RESULT') {
          if (resolvers.has(id)) {
            resolvers.get(id).resolve(payload);
            resolvers.delete(id);
          }
        } else if (type === 'LOOKUP_ERROR') {
          if (resolvers.has(id)) {
            resolvers.get(id).reject(new Error(payload));
            resolvers.delete(id);
          }
        }
      };

      worker.onerror = (e) => {
        console.error("Worker error", e);
        reject(e);
      };

      worker.postMessage({ type: 'INIT', baseUrl });
    } catch (e) {
      console.error("Failed to initialize Dictionary Worker", e);
      initPromise = null;
      reject(e);
    }
  });

  return initPromise;
}

export async function lookupWord(word) {
  const activeWorker = await initDictionaryWorker();
  
  return new Promise((resolve, reject) => {
    const id = nextId++;
    resolvers.set(id, { resolve, reject });
    activeWorker.postMessage({ type: 'LOOKUP', payload: word, id });
  });
}
