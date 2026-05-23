import { WordsEngine } from 'whitakers-words';

let enginePromise = null;
let engineInstance = null;

export async function getDictionaryEngine() {
  if (engineInstance) return engineInstance;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
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
      return engineInstance;
    } catch (e) {
      console.error("Failed to initialize WordsEngine", e);
      enginePromise = null;
      throw e;
    }
  })();

  return enginePromise;
}

export async function lookupWord(word) {
  const engine = await getDictionaryEngine();
  const result = engine.parseWord(word);
  return result;
}
