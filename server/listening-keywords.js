import { db } from "./store.js";
import { normalizeWord } from "./knowledge-index.js";

const stopWords = new Set(
  "about after again also associate because before being cambridge children could english episode example find first from have hear into just learn learning like make many more much need only other over parents phone plan programme psychologist really reason result screen should someone something spend tech technology than that their them then there these they think this time understand university using very vocabulary want well what when where which with would your as a result for example find out".split(
    " ",
  ),
);
const stopTerms = new Set(["as a result", "for example", "find out"]);
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const occurrences = (text, term) =>
  [
    ...text.matchAll(
      new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${escapeRegex(term)}(?=$|[^\\p{L}\\p{N}])`,
        "giu",
      ),
    ),
  ].length;
const sentenceList = (text) =>
  text
    .replace(/\s+/g, " ")
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
function contextFor(sentences, term, includeDefinition = false) {
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegex(term)}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  const index = sentences.findIndex((sentence) => pattern.test(sentence));
  if (index < 0) return "";
  const current = sentences[index];
  const alreadyDefines =
    /\b(?:is|means)\s+(?:to|a|an|the)\b/i.test(current) ||
    /,\s*you\s+\w+/i.test(current);
  const context =
    includeDefinition && !alreadyDefines && sentences[index + 1]
      ? `${current} ${sentences[index + 1]}`
      : current;
  return context.slice(0, 500);
}
function recapTerms(text) {
  const start = text.toLowerCase().lastIndexOf("recap the vocabulary");
  if (start < 0) return [];
  const recap = text.slice(start);
  const terms = [];
  for (const match of recap.matchAll(/(?:^|[\s([:])['‘’]([^'‘’]{2,60})['‘’]/g))
    terms.push(match[1]);
  for (const pattern of [
    /\bTo be ([a-z][a-z-]{2,30}) is\b/gi,
    /\bTo (?!be\b)([a-z][a-z ]{2,50}) is\b/gi,
    /\bA ([a-z][a-z-]{2,30}) is\b/gi,
    /\bIf you (set [a-z][a-z ]{2,60}), you\b/gi,
  ])
    for (const match of recap.matchAll(pattern)) terms.push(match[1]);
  return [
    ...new Set(
      terms
        .map((term) => normalizeWord(term))
        .map((term) =>
          term === "the bar needs to be higher" ? "set the bar higher" : term,
        )
        .filter(
          (term) =>
            term.length >= 3 &&
            term.split(" ").length <= 8 &&
            !stopWords.has(term) &&
            !stopTerms.has(term),
        ),
    ),
  ];
}

export function extractTranscriptKeywords(text, title = "") {
  const sentences = sentenceList(text);
  const normalizedText = normalizeWord(text);
  const recap = recapTerms(text);
  const recapStart = text.toLowerCase().lastIndexOf("recap the vocabulary");
  const recapSentences = sentenceList(
    recapStart < 0 ? "" : text.slice(recapStart),
  );
  const words = db
    .prepare(
      `SELECT w.id,w.term,
      MIN(NULLIF(vs.meaning,'')) AS meaning,
      MAX(CASE WHEN c.personal=1 AND c.archived=0 THEN 1 ELSE 0 END) AS personal
      FROM vocabulary_words w
      LEFT JOIN vocabulary_sources vs ON vs.word_id=w.id
      LEFT JOIN cards c ON c.id=vs.card_id
      GROUP BY w.id,w.term`,
    )
    .all();
  const index = new Map(
    words.map((word) => [word.normalized || normalizeWord(word.term), word]),
  );
  const result = [];
  const seen = new Set();
  function add(term, explicit = false, bonus = 0) {
    const normalized = normalizeWord(term);
    if (!normalized || seen.has(normalized)) return;
    const word = index.get(normalized);
    const context =
      (explicit && contextFor(recapSentences, normalized, true)) ||
      contextFor(sentences, normalized);
    if (!context) return;
    seen.add(normalized);
    result.push({
      term: word?.term || term,
      type: normalized.includes(" ") ? "phrase" : "word",
      meaning: word?.meaning || "",
      context,
      wordId: word?.id || "",
      inNotebook: Boolean(word?.personal),
      explicit,
      score:
        (explicit ? 1000 : 0) +
        bonus +
        Math.min(occurrences(normalizedText, normalized), 10) * 8 +
        Math.min(normalized.length, 30) +
        (normalized.includes(" ") ? 35 : 0),
    });
  }
  recap.forEach((term) => add(term, true));
  const titleWords = normalizeWord(title)
    .replace(/\s*(?:⏲️?|⏱️?).*$/, "")
    .split(" ")
    .filter(Boolean);
  for (let size = 3; size >= 2; size--) {
    for (let index = 0; index <= titleWords.length - size; index++) {
      const term = titleWords.slice(index, index + size).join(" ");
      if (!stopTerms.has(term) && occurrences(normalizedText, term) >= 2)
        add(term, false, 250);
    }
  }
  const ranked = () =>
    result
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, "en"))
      .slice(0, 12)
      .map(({ score, ...item }) => item);
  // BBC 的 recap 已明确给出教学重点时，不再用普通高频词稀释结果。
  if (result.length >= 6) return ranked();
  const tokens = normalizedText.match(/[a-z][a-z'-]{2,}/g) || [];
  const phraseCounts = new Map();
  for (let index = 0; index < tokens.length - 1; index++) {
    const pair = `${tokens[index]} ${tokens[index + 1]}`;
    if (!stopWords.has(tokens[index]) && !stopWords.has(tokens[index + 1]))
      phraseCounts.set(pair, (phraseCounts.get(pair) || 0) + 1);
  }
  [...phraseCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([term, count]) => add(term, false, 100 + count * 10));
  for (const word of words) {
    const term = normalizeWord(word.term);
    if (
      term.length < 4 ||
      term.length > 50 ||
      stopWords.has(term) ||
      stopTerms.has(term) ||
      occurrences(normalizedText, term) === 0
    )
      continue;
    add(term);
  }
  return ranked();
}
