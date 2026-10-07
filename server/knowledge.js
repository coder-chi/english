import { randomUUID } from "node:crypto";
import { db, transaction } from "./store.js";
import { AppError } from "./services.js";
import { wordbooks } from "./wordbook-catalog.js";
import { isDue, memorySummary } from "./scheduler.js";
import { normalizeWord, sentenceId, wordId } from "./knowledge-index.js";
import { getAssociations } from "./associations.js";

function word(id) {
  if (typeof id !== "string") throw new AppError("请选择有效词条。");
  const row = db.prepare("SELECT * FROM vocabulary_words WHERE id=?").get(id);
  if (!row) throw new AppError("词条不存在。", 404);
  return row;
}
function pageInput(input) {
  const query = input.query ?? "";
  if (typeof query !== "string" || query.length > 160)
    throw new AppError("关键词最多160字。");
  const page = input.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1)
    throw new AppError("页码必须为正整数。");
  const bookId = input.bookId || "";
  if (bookId && !wordbooks.some((b) => b.id === bookId))
    throw new AppError("词书不存在。");
  return { query: query.trim().toLowerCase(), page, bookId };
}
function paginate(rows, page, size = 30) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  page = Math.min(page, pages);
  return {
    total: rows.length,
    pages,
    page,
    items: rows.slice((page - 1) * size, page * size),
  };
}
function sourceIndex() {
  const words = new Map(
    db
      .prepare("SELECT * FROM vocabulary_words")
      .all()
      .map((w) => [w.id, { ...w, sources: [] }]),
  );
  for (const source of db
    .prepare("SELECT * FROM vocabulary_sources ORDER BY source_id")
    .all())
    words.get(source.word_id)?.sources.push(source);
  return words;
}
export function listWords(input) {
  const { query, page, bookId } = pageInput(input);
  const words = [...sourceIndex().values()].filter(
    (w) =>
      w.sources.length &&
      (!bookId || w.sources.some((s) => s.book_id === bookId)) &&
      (!query ||
        `${w.term} ${w.sources.map((s) => s.meaning).join(" ")}`
          .toLowerCase()
          .includes(query)),
  );
  words.sort((a, b) => a.term.localeCompare(b.term, "en"));
  const counts = new Map(
    db
      .prepare(
        "SELECT word_id, COUNT(DISTINCT sentence_id) AS n FROM sentence_words GROUP BY word_id",
      )
      .all()
      .map((r) => [r.word_id, r.n]),
  );
  const result = paginate(words, page);
  return {
    ...result,
    associationExample: ["conservation", "preservation"].map((term) => ({
      id: wordId(term),
      term,
    })),
    items: result.items.map((w) => ({
      id: w.id,
      term: w.term,
      meanings: [...new Set(w.sources.map((s) => s.meaning))],
      bookIds: [...new Set(w.sources.map((s) => s.book_id).filter(Boolean))],
      sentenceCount: counts.get(w.id) || 0,
    })),
  };
}
function sentenceView(row) {
  return {
    ...row,
    listening: db
      .prepare(
        `SELECT DISTINCT e.id,e.title FROM sentence_sources ss
      JOIN listening_episodes e ON ss.source_id LIKE 'listening:' || e.id || ':%'
      WHERE ss.sentence_id=?`,
      )
      .all(row.id),
    sources: db
      .prepare(
        "SELECT DISTINCT label FROM sentence_sources WHERE sentence_id=?",
      )
      .all(row.id)
      .map((s) => s.label),
    words: db
      .prepare(
        `SELECT DISTINCT w.id, w.term FROM sentence_words sw
      JOIN vocabulary_words w ON w.id=sw.word_id WHERE sw.sentence_id=? ORDER BY w.term`,
      )
      .all(row.id),
  };
}
export function getWord(input) {
  const w = word(input.wordId);
  const sources = db
    .prepare("SELECT * FROM vocabulary_sources WHERE word_id=?")
    .all(w.id);
  const cards = db
    .prepare(
      `SELECT cards.* FROM cards JOIN vocabulary_sources s ON s.card_id=cards.id
    WHERE s.word_id=?`,
    )
    .all(w.id);
  const examples = db
    .prepare(
      `SELECT DISTINCT s.* FROM sentences s JOIN sentence_words sw
    ON sw.sentence_id=s.id WHERE sw.word_id=? ORDER BY s.saved DESC, s.id LIMIT 100`,
    )
    .all(w.id);
  return {
    id: w.id,
    term: w.term,
    associations: getAssociations(w.id),
    sources: sources.filter((s) => !s.card_id),
    cards: cards.map((c) => ({ ...c, wordId: w.id, memory: memorySummary(c) })),
    sentences: examples.map(sentenceView),
    listening: db
      .prepare(
        `SELECT e.id,e.title,e.channel FROM listening_words lw
      JOIN listening_episodes e ON e.id=lw.episode_id WHERE lw.word_id=? ORDER BY e.created_at DESC`,
      )
      .all(w.id),
    books: wordbooks
      .filter((b) => sources.some((s) => s.book_id === b.id))
      .map((b) => ({ id: b.id, title: b.title })),
  };
}
function matchingSentences(input) {
  const { query, page, bookId } = pageInput(input);
  const scope = input.scope || "all";
  if (!["all", "saved", "due", "unseen"].includes(scope))
    throw new AppError("例句范围无效。");
  if (input.wordId) word(input.wordId);
  const rows = db
    .prepare(
      `SELECT s.* FROM sentences s WHERE EXISTS
    (SELECT 1 FROM sentence_sources ss WHERE ss.sentence_id=s.id)
    ORDER BY s.last_reviewed_at IS NOT NULL, s.last_reviewed_at, s.id`,
    )
    .all();
  const linkedWords = new Map();
  for (const link of db
    .prepare("SELECT DISTINCT sentence_id, word_id FROM sentence_words")
    .all()) {
    if (!linkedWords.has(link.sentence_id))
      linkedWords.set(link.sentence_id, new Set());
    linkedWords.get(link.sentence_id).add(link.word_id);
  }
  const index = sourceIndex();
  const dueWords = new Set();
  for (const card of db
    .prepare(
      `SELECT c.*, vs.word_id FROM cards c JOIN vocabulary_sources vs ON vs.card_id=c.id`,
    )
    .all())
    if (isDue(card)) dueWords.add(card.word_id);
  return {
    page,
    rows: rows.filter((row) => {
      const ids = [...(linkedWords.get(row.id) || [])];
      return (
        (!input.wordId || ids.includes(input.wordId)) &&
        (!bookId ||
          ids.some((id) =>
            index.get(id)?.sources.some((s) => s.book_id === bookId),
          )) &&
        (scope !== "saved" || row.saved) &&
        (scope !== "unseen" || row.reviews === 0) &&
        (scope !== "due" || ids.some((id) => dueWords.has(id))) &&
        (!query ||
          `${row.english} ${row.chinese} ${ids.map((id) => index.get(id)?.term || "").join(" ")}`
            .toLowerCase()
            .includes(query))
      );
    }),
  };
}
export function listSentences(input) {
  const { rows, page } = matchingSentences(input);
  const result = paginate(rows, page, 12);
  return { ...result, items: result.items.map(sentenceView) };
}
export function saveSentence(input) {
  const { english, chinese, wordIds } = input;
  if (
    typeof english !== "string" ||
    !english.trim() ||
    english.length > 2000 ||
    typeof chinese !== "string" ||
    !chinese.trim() ||
    chinese.length > 2000 ||
    !Array.isArray(wordIds) ||
    !wordIds.length ||
    wordIds.length > 12
  )
    throw new AppError("请填写中英文例句，并关联1–12个词条。");
  const extra = input.linkedTerms || [];
  if (
    !Array.isArray(extra) ||
    extra.length > 11 ||
    extra.some((t) => typeof t !== "string" || t.length > 160)
  )
    throw new AppError("关联词填写无效。");
  const extraIds = extra.map((term) => {
    const row = db
      .prepare("SELECT id FROM vocabulary_words WHERE normalized=?")
      .get(normalizeWord(term));
    if (!row) throw new AppError(`词库中没有“${term}”，请先添加该词。`);
    return row.id;
  });
  const ids = [...new Set([...wordIds, ...extraIds])];
  if (ids.length > 12) throw new AppError("一条例句最多关联12个词。");
  ids.forEach(word);
  return transaction(() => {
    const existing = db
      .prepare("SELECT id FROM sentences WHERE english=? AND chinese=?")
      .get(english.trim(), chinese.trim());
    const id = existing?.id || sentenceId(english, chinese);
    if (!existing)
      db.prepare(
        "INSERT INTO sentences(id,english,chinese,saved) VALUES(?,?,?,1)",
      ).run(id, english.trim(), chinese.trim());
    const source = `user:${id}`;
    db.prepare("INSERT OR REPLACE INTO sentence_sources VALUES(?,?,?)").run(
      source,
      id,
      "个人整理",
    );
    db.prepare("DELETE FROM sentence_words WHERE source_id=?").run(source);
    for (const wid of ids)
      db.prepare("INSERT OR IGNORE INTO sentence_words VALUES(?,?,?)").run(
        id,
        wid,
        source,
      );
    db.prepare("UPDATE sentences SET saved=1 WHERE id=?").run(id);
    return sentenceView(
      db.prepare("SELECT * FROM sentences WHERE id=?").get(id),
    );
  });
}
export function flagSentence(input) {
  if (typeof input.saved !== "boolean" || typeof input.id !== "string")
    throw new AppError("收藏参数无效。");
  if (!db.prepare("SELECT id FROM sentences WHERE id=?").get(input.id))
    throw new AppError("例句不存在。", 404);
  db.prepare("UPDATE sentences SET saved=? WHERE id=?").run(
    Number(input.saved),
    input.id,
  );
  return { ok: true };
}
export function startRecall(input) {
  const { rows } = matchingSentences(input);
  if (!rows.length) throw new AppError("当前条件下没有例句，请调整筛选。");
  const row = rows[0];
  const token = randomUUID();
  db.prepare(
    "INSERT INTO sentence_recalls(token,sentence_id,created_at) VALUES(?,?,?)",
  ).run(token, row.id, Date.now());
  return { token, id: row.id, question: row.chinese, total: rows.length };
}
export function revealRecall(input) {
  if (typeof input.token !== "string") throw new AppError("回顾编号无效。");
  const recall = db
    .prepare("SELECT * FROM sentence_recalls WHERE token=?")
    .get(input.token);
  if (!recall) throw new AppError("回顾记录不存在。", 404);
  db.prepare("UPDATE sentence_recalls SET revealed=1 WHERE token=?").run(
    input.token,
  );
  return sentenceView(
    db.prepare("SELECT * FROM sentences WHERE id=?").get(recall.sentence_id),
  );
}
export function gradeRecall(input) {
  if (
    typeof input.token !== "string" ||
    !["again", "good"].includes(input.rating)
  )
    throw new AppError("回顾评分无效。");
  return transaction(() => {
    const recall = db
      .prepare("SELECT * FROM sentence_recalls WHERE token=?")
      .get(input.token);
    if (!recall || !recall.revealed) throw new AppError("请先核对例句。");
    if (recall.completed_at) return { ok: true };
    const now = Date.now();
    db.prepare(
      "UPDATE sentence_recalls SET rating=?,completed_at=? WHERE token=?",
    ).run(input.rating, now, input.token);
    db.prepare(
      "UPDATE sentences SET reviews=reviews+1,last_reviewed_at=? WHERE id=?",
    ).run(now, recall.sentence_id);
    // 句子回顾只记录句子表现，不能据此将关联词全部标成记住或改写它们的 FSRS。
    if (input.rating === "again")
      db.prepare("UPDATE sentences SET saved=1 WHERE id=?").run(
        recall.sentence_id,
      );
    return { ok: true };
  });
}
