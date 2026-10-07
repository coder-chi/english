import { wordbooks } from "./wordbook-catalog.js";
import { curatedPartOfSpeech } from "./curated-parts-of-speech.js";

const normalize = (value) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const key = (term, meaning) =>
  JSON.stringify([normalize(term), normalize(meaning)]);
const exact = new Map();
const dictionary = new Map();
for (const book of wordbooks) {
  for (const entry of book.entries) {
    exact.set(key(entry.term, entry.meaning), entry.partOfSpeech || "");
    if (!dictionary.has(normalize(entry.term)))
      dictionary.set(normalize(entry.term), entry.partOfSpeech || "");
  }
}
// 优先匹配相同释义；其他词仅使用词库已有的词性，不按中文释义或英文词尾猜测。
export function lookupPartOfSpeech(term, meaning) {
  return (
    exact.get(key(term, meaning)) ||
    dictionary.get(normalize(term)) ||
    curatedPartOfSpeech(term)
  );
}
