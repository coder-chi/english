import { db } from "./store.js";
import { wordId } from "./knowledge-index.js";
import { flowReadings } from "./flow-readings.js";

const windowMs = 30 * 60 * 1000;
const weak = (rating) => ["again", "hard"].includes(rating);

// 只用同一选词范围最近半小时的真实评分，不把翻卡、朗读或耗时当作失败。
export function recentRatings(config, now = Date.now()) {
  return db
    .prepare(
      `
    SELECT a.rating FROM practice_attempts a
    JOIN practice_sessions s ON s.id = a.session_id
    WHERE a.practiced_at >= ?
      AND COALESCE(json_extract(s.payload, '$.config.source'), 'all') = ?
      AND COALESCE(json_extract(s.payload, '$.config.categoryId'), '') = ?
      AND COALESCE(json_extract(s.payload, '$.config.kind'), 'all') = ?
      AND COALESCE(json_extract(s.payload, '$.config.scope'), 'all') = ?
    ORDER BY a.id DESC LIMIT 5
  `,
    )
    .all(
      now - windowMs,
      config.source,
      config.categoryId ?? "",
      config.kind,
      config.scope,
    )
    .map((row) => row.rating);
}

export function newWordBudget(ratings) {
  if (
    ratings.slice(0, 3).filter((r) => r === "again").length >= 2 ||
    ratings.slice(0, 5).filter(weak).length >= 3
  )
    return 0;
  if (ratings.slice(0, 5).filter(weak).length >= 2) return 1;
  return 3;
}

export function budgetNotice(cap) {
  return cap === 0
    ? "先缓一缓：本轮暂停后续新词。"
    : cap === 1
      ? "最近回想有些吃力，本轮新词预算降为 1 个。"
      : "最多 10 个词，新词最多 3 个；吃力时会自动减少。";
}

export function applyBudget(session, cap, keepCurrent = false) {
  session.flow.newCap = Math.min(session.flow.newCap, cap);
  let used = session.items
    .slice(0, session.position)
    .filter((item) => item.queue === "new").length;
  const before = session.items.length;
  session.items = session.items.filter((item, index) => {
    if (index < session.position || item.queue !== "new") return true;
    used++;
    // 手动减负不能让眼前的题目或已翻开的答案消失。
    return (
      (keepCurrent && index === session.position) || used <= session.flow.newCap
    );
  });
  session.flow.deferredNewCount += before - session.items.length;
  session.flow.notice = budgetNotice(session.flow.newCap);
}

export function manualPaceUntil(config, now = Date.now()) {
  const row = db
    .prepare(
      `
    SELECT MAX(json_extract(payload, '$.flow.paceUntil')) AS until
    FROM practice_sessions
    WHERE json_extract(payload, '$.flow.paceUntil') > ?
      AND json_extract(payload, '$.config.source') = ?
      AND COALESCE(json_extract(payload, '$.config.categoryId'), '') = ?
      AND json_extract(payload, '$.config.kind') = ?
      AND json_extract(payload, '$.config.scope') = ?
  `,
    )
    .get(
      now,
      config.source,
      config.categoryId ?? "",
      config.kind,
      config.scope,
    );
  return row.until || null;
}

export function lighten(session) {
  session.flow.paceUntil = Date.now() + windowMs;
  applyBudget(session, 0, true);
}

export function selectClosing(session) {
  const successful = new Set(
    session.results
      .filter((r) => ["good", "easy"].includes(r.rating))
      .map((r) => r.cardId),
  );
  const failedTerms = new Set(
    session.results
      .filter((r) => weak(r.rating))
      .map((r) => r.term.toLowerCase()),
  );
  const learned = db
    .prepare(
      "SELECT * FROM cards WHERE archived = 0 AND (learned_at IS NOT NULL OR familiar = 1)",
    )
    .all()
    .filter((card) => !failedTerms.has(card.term.toLowerCase()));
  const known = new Set(learned.map((card) => card.term.toLowerCase()));
  const roundTerms = new Set(
    learned
      .filter((card) => successful.has(card.id))
      .map((card) => card.term.toLowerCase()),
  );
  // 只保证重点词来自实际已学词；不宣称整篇文本的所有词都已掌握。
  const stories = flowReadings.filter(
    (story) =>
      story.focusTerms.every((term) => known.has(term)) &&
      story.focusTerms.some((term) => roundTerms.has(term)),
  );
  const story = stories[session.createdAt % (stories.length || 1)];
  if (story) return { kind: "story", ...story };
  const sentences = [];
  const seen = new Set();
  for (const card of learned.filter((c) => successful.has(c.id))) {
    const rows = db
      .prepare(
        `
      SELECT DISTINCT s.id, s.english, s.chinese FROM sentences s
      JOIN sentence_words w ON w.sentence_id = s.id
      WHERE w.word_id = ? AND s.chinese != ''
      ORDER BY s.id LIMIT 2
    `,
      )
      .all(wordId(card.term));
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      sentences.push({ ...row, focusTerms: [card.term.toLowerCase()] });
      if (sentences.length === 2)
        return { kind: "sentences", title: "在句子里，再遇见熟词", sentences };
    }
  }
  return sentences.length
    ? { kind: "sentences", title: "在句子里，再遇见熟词", sentences }
    : {
        kind: "empty",
        title: "今天的积累，可以停在这里",
        message:
          "暂时没有匹配本轮已学词的轻量短文或双语例句。休息一下，也很好。",
      };
}
