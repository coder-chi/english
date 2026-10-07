import { randomUUID } from "node:crypto";
import { db, transaction } from "./store.js";
import { AppError } from "./services.js";

// 游戏记录独立保存，绝不修改卡片排程或记忆评分。
db.exec(`
  CREATE TABLE IF NOT EXISTS puzzle_sessions (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS puzzle_attempts (
    session_id TEXT NOT NULL, position INTEGER NOT NULL, sentence_id TEXT NOT NULL,
    mode TEXT NOT NULL, outcome TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(session_id, position));
  CREATE INDEX IF NOT EXISTS puzzle_sentence_history ON puzzle_attempts(sentence_id, mode, outcome);
`);
const normalize = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
const escapePattern = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function token(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(value))
    throw new AppError("拼图编号无效。");
  return value;
}
function load(id) {
  const row = db
    .prepare("SELECT payload FROM puzzle_sessions WHERE id=?")
    .get(token(id));
  if (!row) throw new AppError("这轮拼图不存在。", 404);
  return JSON.parse(row.payload);
}
function save(s) {
  db.prepare("INSERT OR REPLACE INTO puzzle_sessions VALUES(?,?,?)").run(
    s.id,
    JSON.stringify(s),
    s.createdAt,
  );
}
function view(s) {
  const item = s.items[s.position];
  const current = item
    ? {
        sentenceId: item.id,
        chinese: item.chinese,
        mode: item.mode,
        prompt: item.mode === "assemble" ? "" : item.masked,
        initial: item.mode === "cloze" ? item.target[0] : "",
        chunks: item.mode === "assemble" ? item.chunks : [],
        hinted: item.hinted,
        solution: item.hinted || item.result ? item.english : null,
        target: item.result ? item.target : null,
        result: item.result,
      }
    : null;
  return {
    id: s.id,
    practiceSessionId: s.practiceSessionId,
    closingAvailable: s.closingAvailable,
    total: s.items.length,
    position: s.position,
    current,
    results: s.items.filter((i) => i.result).map((i) => i.result),
  };
}
export function getPuzzle(input) {
  return view(load(input.id));
}
export function startPuzzle(input) {
  return transaction(() => {
    const id = token(input.token || randomUUID());
    const existing = db
      .prepare("SELECT payload FROM puzzle_sessions WHERE id=?")
      .get(id);
    if (existing) return view(JSON.parse(existing.payload));
    let cardIds = null;
    let closingAvailable = false;
    if (input.practiceSessionId) {
      const row = db
        .prepare("SELECT payload FROM practice_sessions WHERE id=?")
        .get(token(input.practiceSessionId));
      if (!row) throw new AppError("来源练习不存在。", 404);
      const practice = JSON.parse(row.payload);
      if (practice.position !== practice.items.length)
        throw new AppError("先完成这一轮词汇练习。");
      cardIds = new Set(
        practice.results
          .filter((r) => ["again", "hard", "good", "easy"].includes(r.rating))
          .map((r) => r.cardId),
      );
      closingAvailable = Boolean(practice.flow);
    }
    const candidates = db
      .prepare(
        `
      SELECT DISTINCT s.id,s.english,s.chinese,c.id AS card_id,c.term,c.learned_at
      FROM cards c JOIN vocabulary_sources vs ON vs.card_id=c.id
      JOIN sentence_words sw ON sw.word_id=vs.word_id
      JOIN sentences s ON s.id=sw.sentence_id
      WHERE c.archived=0 AND (c.learned_at IS NOT NULL OR c.familiar=1)
      ORDER BY c.learned_at DESC,c.id DESC,s.id
    `,
      )
      .all();
    const items = [];
    const seen = new Set();
    for (const row of candidates) {
      if ((cardIds && !cardIds.has(row.card_id)) || seen.has(row.id)) continue;
      // 只用词形明确匹配且适合短练习的例句，避免猜测词形或截断原句。
      const match = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapePattern(row.term)}(?![\\p{L}\\p{N}])`,
        "iu",
      ).exec(row.english);
      const words = row.english.split(/\s+/);
      if (!match || !row.chinese || words.length < 4 || words.length > 24)
        continue;
      const passed = new Set(
        db
          .prepare(
            "SELECT mode FROM puzzle_attempts WHERE sentence_id=? AND outcome='independent' AND lower(json_extract(payload,'$.term'))=lower(?)",
          )
          .all(row.id, match[0])
          .map((a) => a.mode),
      );
      const mode = !passed.has("assemble")
        ? "assemble"
        : !passed.has("cloze")
          ? "cloze"
          : "recall";
      const before = row.english.slice(0, match.index).trim();
      const after = row.english.slice(match.index + match[0].length).trim();
      const pieces = [];
      const split = (part) => {
        const tokens = part.split(/\s+/).filter(Boolean);
        for (let i = 0; i < tokens.length; i += 2)
          pieces.push(tokens.slice(i, i + 2).join(" "));
      };
      split(before);
      pieces.push(match[0]);
      split(after);
      const chunks = pieces.map((text, index) => ({ id: index, text }));
      for (let i = chunks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
      }
      items.push({
        id: row.id,
        english: row.english,
        chinese: row.chinese,
        target: match[0],
        masked:
          row.english.slice(0, match.index) +
          "____" +
          row.english.slice(match.index + match[0].length),
        mode,
        chunks,
        hinted: false,
        result: null,
      });
      seen.add(row.id);
      if (items.length === 3) break;
    }
    const s = {
      id,
      practiceSessionId: input.practiceSessionId || null,
      closingAvailable,
      createdAt: Date.now(),
      position: 0,
      items,
    };
    save(s);
    return view(s);
  });
}
export function actPuzzle(input) {
  return transaction(() => {
    const s = load(input.id);
    if (
      !Number.isSafeInteger(input.position) ||
      input.position < 0 ||
      input.position > s.position
    )
      throw new AppError("拼图进度已变化，请重新打开。", 409);
    if (!["hint", "check", "next", "skip"].includes(input.action))
      throw new AppError("拼图操作无效。");
    // 旧位置的请求重试只返回当前进度，不得推进下一题或重复记成果。
    if (input.position < s.position) return view(s);
    const item = s.items[s.position];
    if (!item) return view(s);
    if (input.action === "hint" && !item.result) item.hinted = true;
    if (input.action === "check" && !item.result) {
      let answer;
      if (item.mode === "assemble") {
        const ids = input.chunks;
        if (
          !Array.isArray(ids) ||
          ids.length !== item.chunks.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !item.chunks.some((c) => c.id === id))
        )
          throw new AppError("把所有词块放好，再核对。");
        answer = ids
          .map((id) => item.chunks.find((c) => c.id === id).text)
          .join(" ");
      } else {
        if (
          typeof input.answer !== "string" ||
          !input.answer.trim() ||
          input.answer.length > 300
        )
          throw new AppError("请先填入关键词，或看看提示。");
        answer = input.answer;
      }
      const correct =
        normalize(answer) ===
        normalize(item.mode === "assemble" ? item.english : item.target);
      const outcome = correct
        ? item.hinted
          ? "assisted"
          : "independent"
        : "different";
      item.result = {
        english: item.english,
        chinese: item.chinese,
        term: item.target,
        mode: item.mode,
        outcome,
        answer,
        hinted: item.hinted,
        at: Date.now(),
      };
      db.prepare("INSERT INTO puzzle_attempts VALUES(?,?,?,?,?,?,?)").run(
        s.id,
        s.position,
        item.id,
        item.mode,
        outcome,
        JSON.stringify(item.result),
        item.result.at,
      );
    }
    if (input.action === "skip" && !item.result) {
      item.result = {
        english: item.english,
        chinese: item.chinese,
        term: item.target,
        mode: item.mode,
        outcome: "skipped",
        at: Date.now(),
      };
      db.prepare("INSERT INTO puzzle_attempts VALUES(?,?,?,?,?,?,?)").run(
        s.id,
        s.position,
        item.id,
        item.mode,
        "skipped",
        JSON.stringify(item.result),
        item.result.at,
      );
      s.position++;
    } else if (input.action === "next") {
      if (!item.result) throw new AppError("先核对，或跳过这一句。");
      s.position++;
    }
    save(s);
    return view(s);
  });
}
export function learningRecords() {
  const memory = db
    .prepare(
      `SELECT c.id,c.term,c.meaning,c.learned_at AS at,
    (SELECT rating FROM practice_attempts p WHERE p.card_id=c.id ORDER BY p.id DESC LIMIT 1) AS rating
    FROM cards c WHERE c.archived=0 AND c.learned_at IS NOT NULL ORDER BY c.learned_at DESC`,
    )
    .all();
  // 去重维度与明细完全一致；同一句的不同任务保留区别，重复完成不虚增句数。
  const expression = [];
  const seen = new Set();
  for (const row of db
    .prepare(
      "SELECT * FROM puzzle_attempts WHERE outcome IN ('independent','assisted') ORDER BY created_at DESC,rowid DESC",
    )
    .all()) {
    const key = `${row.sentence_id}:${row.mode}:${row.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    expression.push({
      ...JSON.parse(row.payload),
      sentenceId: row.sentence_id,
    });
  }
  const listening = [];
  const episodes = new Set();
  for (const row of db
    .prepare(
      "SELECT l.*,e.title FROM listening_logs l JOIN listening_episodes e ON e.id=l.episode_id ORDER BY l.created_at DESC,l.rowid DESC",
    )
    .all()) {
    const entry = JSON.parse(row.payload);
    if (
      entry.subtitles !== "none" ||
      !["main", "most"].includes(entry.understanding) ||
      episodes.has(row.episode_id)
    )
      continue;
    episodes.add(row.episode_id);
    listening.push({
      id: row.episode_id,
      title: row.title,
      understanding: entry.understanding,
      minutes: entry.minutes,
      at: row.created_at,
    });
  }
  return {
    memory,
    expression,
    listening,
    counts: {
      memory: memory.length,
      expression: new Set(
        expression
          .filter((e) => e.outcome === "independent")
          .map((e) => e.sentenceId),
      ).size,
      assisted: new Set(
        expression
          .filter((e) => e.outcome === "assisted")
          .map((e) => e.sentenceId),
      ).size,
      listening: listening.length,
    },
  };
}
