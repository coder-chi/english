import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { seedLessons } from "./seed.js";
import { wordbooks } from "./wordbook-catalog.js";
import { lookupPartOfSpeech } from "./vocabulary-metadata.js";
import { partsOfSpeech, normalizePartOfSpeech } from "./parts-of-speech.js";
import { syncKnowledge, wordId } from "./knowledge-index.js";
import { summarizeProgress } from "../public/learning-progress.js";
import {
  rebuildMemory,
  memorySummary,
  previewSchedule,
  schedulerInfo,
  sortDueCards,
  hasLearned,
  isDue,
  recoverInitialLearning,
} from "./scheduler.js";

const path =
  process.env.DB_PATH === ":memory:"
    ? ":memory:"
    : resolve(process.env.DB_PATH || "data/english.sqlite");
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER);
  CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY, lesson_id TEXT NOT NULL, term TEXT NOT NULL, meaning TEXT NOT NULL, example TEXT NOT NULL, translation TEXT NOT NULL, due_at INTEGER NOT NULL, interval_days REAL NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0, UNIQUE(lesson_id, term));
  CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, rating TEXT NOT NULL, reviewed_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, payload TEXT NOT NULL, published_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// 增量迁移只补充字段，保留旧卡片的编号、收藏来源和复习时间。
if (db.prepare("PRAGMA user_version").get().user_version < 1) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      ALTER TABLE cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'phrase';
      ALTER TABLE cards ADD COLUMN category_id INTEGER;
      ALTER TABLE cards ADD COLUMN note TEXT NOT NULL DEFAULT '';
      ALTER TABLE cards ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
      INSERT INTO categories(name) VALUES ('生活'), ('职场'), ('旅行'), ('科技');
      UPDATE cards SET kind = CASE WHEN instr(trim(term), ' ') > 0 THEN 'phrase' ELSE 'word' END;
      CREATE TABLE practice_sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE practice_attempts (
        id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, position INTEGER NOT NULL,
        card_id INTEGER NOT NULL, direction TEXT NOT NULL, rating TEXT NOT NULL,
        mode TEXT NOT NULL, practiced_at INTEGER NOT NULL,
        UNIQUE(session_id, position)
      );
      CREATE INDEX practice_card_time ON practice_attempts(card_id, practiced_at);
      PRAGMA user_version = 1;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// 词书来源与个人收藏独立记录；复用卡片时保留个人标记与全部复习进度。
if (db.prepare("PRAGMA user_version").get().user_version < 2) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      ALTER TABLE cards ADD COLUMN personal INTEGER NOT NULL DEFAULT 1;
      CREATE TABLE book_entries (
        book_id TEXT NOT NULL, entry_id TEXT NOT NULL, card_id INTEGER NOT NULL,
        imported_at INTEGER NOT NULL, PRIMARY KEY(book_id, entry_id)
      );
      CREATE INDEX book_entries_card ON book_entries(card_id);
      PRAGMA user_version = 2;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (db.prepare("PRAGMA user_version").get().user_version < 3) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      ALTER TABLE cards ADD COLUMN familiar INTEGER NOT NULL DEFAULT 0;
      PRAGMA user_version = 3;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (db.prepare("PRAGMA user_version").get().user_version < 4) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      ALTER TABLE cards ADD COLUMN fsrs_card TEXT;
      ALTER TABLE cards ADD COLUMN schedule_revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE reviews ADD COLUMN fsrs_log TEXT;
    `);
    const histories = new Map();
    for (const row of db
      .prepare("SELECT * FROM reviews ORDER BY reviewed_at, id")
      .all()) {
      if (!histories.has(row.card_id)) histories.set(row.card_id, []);
      histories.get(row.card_id).push(row);
    }
    const update = db.prepare("UPDATE cards SET fsrs_card=? WHERE id=?");
    for (const card of db
      .prepare("SELECT * FROM cards WHERE repetitions > 0")
      .all())
      update.run(rebuildMemory(card, histories.get(card.id) || []), card.id);
    // 仅补充模型状态，不重排已有到期时间，也不改变熟悉、归档、累计次数与笔记。
    db.exec("PRAGMA user_version = 4; COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (db.prepare("PRAGMA user_version").get().user_version < 5) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "ALTER TABLE cards ADD COLUMN part_of_speech TEXT NOT NULL DEFAULT ''",
    );
    const update = db.prepare("UPDATE cards SET part_of_speech=? WHERE id=?");
    for (const card of db.prepare("SELECT id, term, meaning FROM cards").all())
      update.run(lookupPartOfSpeech(card.term, card.meaning), card.id);
    // 仅补充词性；不触碰复习时间、FSRS 模型、熟悉状态与已有学习会话。
    db.exec("PRAGMA user_version=5; COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (db.prepare("PRAGMA user_version").get().user_version < 6) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("ALTER TABLE cards ADD COLUMN learned_at INTEGER");
    // 仅实际提交过评分才算学过；导入、收藏、打开练习和翻卡均不是学习完成证据。
    const history = db
      .prepare(
        `
      SELECT card_id, MIN(studied_at) AS learned_at FROM (
        SELECT card_id, reviewed_at AS studied_at FROM reviews
          WHERE rating IN ('again', 'hard', 'good', 'easy')
        UNION ALL
        SELECT card_id, practiced_at AS studied_at FROM practice_attempts
          WHERE rating IN ('again', 'hard', 'good', 'easy')
      ) GROUP BY card_id
    `,
      )
      .all();
    const update = db.prepare("UPDATE cards SET learned_at=? WHERE id=?");
    for (const row of history) update.run(row.learned_at, row.card_id);
    // 旧自由练习保留实际学过的事实；不伪造 FSRS 历史，不改已有复习时间。
    db.exec("PRAGMA user_version=6; COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (db.prepare("PRAGMA user_version").get().user_version < 7) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const firstAttempts = new Map();
    for (const row of db
      .prepare("SELECT * FROM practice_attempts ORDER BY practiced_at, id")
      .all())
      if (!firstAttempts.has(row.card_id)) firstAttempts.set(row.card_id, row);
    const histories = new Map();
    for (const row of db
      .prepare("SELECT * FROM reviews ORDER BY reviewed_at, id")
      .all()) {
      if (!histories.has(row.card_id)) histories.set(row.card_id, []);
      histories.get(row.card_id).push(row);
    }
    const update = db.prepare("UPDATE cards SET fsrs_card=? WHERE id=?");
    for (const card of db
      .prepare("SELECT * FROM cards WHERE learned_at IS NOT NULL")
      .all()) {
      const memory = recoverInitialLearning(
        card,
        firstAttempts.get(card.id),
        histories.get(card.id) || [],
      );
      if (memory) update.run(memory, card.id);
    }
    // 仅补全遗漏的初次学习证据；不改到期时间、累计评分、用户标记及原始记录。
    db.exec("PRAGMA user_version=7; COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (db.prepare("PRAGMA user_version").get().user_version < 8) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_readings (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_count INTEGER NOT NULL DEFAULT 0,
        last_completed_at INTEGER
      );
      PRAGMA user_version=8;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}
export function setSetting(key, value) {
  db.prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)").run(
    key,
    JSON.stringify(value),
  );
}
let knowledgeReady = false;
export function saveLesson(lesson) {
  db.prepare(
    "INSERT OR IGNORE INTO lessons (id, payload, created_at) VALUES (?, ?, ?)",
  ).run(lesson.id, JSON.stringify(lesson), Date.now());
  if (knowledgeReady) syncKnowledge(db, lessons());
  return lesson;
}
export function lessons() {
  return db
    .prepare("SELECT * FROM lessons ORDER BY created_at DESC, rowid DESC")
    .all()
    .map((row) => {
      const lesson = JSON.parse(row.payload);
      return {
        ...lesson,
        phrases: lesson.phrases.map((phrase) => ({
          ...phrase,
          partOfSpeech:
            normalizePartOfSpeech(phrase.partOfSpeech) ??
            lookupPartOfSpeech(phrase.term, phrase.meaning),
        })),
        createdAt: row.created_at,
        completedAt: row.completed_at,
      };
    });
}
export function lessonById(id) {
  return lessons().find((lesson) => lesson.id === id);
}
for (const lesson of [...seedLessons].reverse()) saveLesson(lesson);
syncKnowledge(db, lessons());
knowledgeReady = true;

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function state() {
  const memberships = db.prepare("SELECT * FROM book_entries").all();
  const booksByCard = new Map();
  for (const link of memberships) {
    if (!booksByCard.has(link.card_id))
      booksByCard.set(link.card_id, new Set());
    booksByCard.get(link.card_id).add(link.book_id);
  }
  // 一次汇总练习记录和来源，避免词库扩大后逐卡扫描全部关联。
  const storedCards = db
    .prepare(
      `SELECT cards.*, latest.rating AS last_practice_rating,
      COALESCE(summary.n, 0) AS practice_count
      FROM cards
      LEFT JOIN (SELECT card_id, COUNT(*) AS n, MAX(id) AS last_id FROM practice_attempts GROUP BY card_id) summary
        ON summary.card_id = cards.id
      LEFT JOIN practice_attempts latest ON latest.id = summary.last_id
      ORDER BY cards.due_at, cards.id`,
    )
    .all()
    .map((card) => ({
      ...card,
      wordId: wordId(card.term),
      memory: memorySummary(card),
      bookIds: [...(booksByCard.get(card.id) || [])],
    }));
  const allCards = storedCards.filter((card) => !card.archived);
  const cardsById = new Map(storedCards.map((card) => [card.id, card]));
  const now = Date.now();
  const dueCards = sortDueCards(allCards.filter((card) => isDue(card, now)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    lessons: lessons(),
    cards: allCards,
    learningProgress: summarizeProgress(allCards),
    partsOfSpeech,
    scheduler: schedulerInfo,
    reviewPreview: dueCards.length ? previewSchedule(dueCards[0], now) : null,
    wordbooks: wordbooks.map(({ entries, ...book }) => {
      const links = memberships.filter((m) => m.book_id === book.id);
      const ids = new Set(links.map((m) => m.card_id));
      const active = allCards.filter((c) => ids.has(c.id));
      const entryCards = new Map(
        links.map((link) => [link.entry_id, cardsById.get(link.card_id)]),
      );
      return {
        ...book,
        total: entries.length,
        partOfSpeechCount: entries.filter((entry) => entry.partOfSpeech).length,
        imported: links.length,
        // 分母和分子均按词书条目计数；跨书复用卡片时沿用同一学习记录。
        progress: summarizeProgress(
          entries.map((entry) => entryCards.get(entry.id)),
        ),
        active: active.length,
        learning: active.filter((c) => hasLearned(c) && !c.familiar).length,
        unlearned: active.filter((c) => !hasLearned(c) && !c.familiar).length,
        familiar: active.filter((c) => c.familiar).length,
        due: active.filter((c) => isDue(c, now)).length,
        practiced: active.filter((c) => c.practice_count > 0).length,
      };
    }),
    archivedCards: storedCards.filter((card) => card.archived),
    categories: db.prepare("SELECT * FROM categories ORDER BY id").all(),
    reminders: getSetting("reminders", { enabled: false, time: "20:00" }),
    recentSessions: db
      .prepare(
        "SELECT id, payload FROM practice_sessions ORDER BY created_at DESC LIMIT 10",
      )
      .all()
      .map((row) => {
        const s = JSON.parse(row.payload);
        return {
          id: row.id,
          mode: s.mode,
          direction: s.direction,
          total: s.items.length,
          done: s.position,
          reviewCount: s.items.filter((item) => item.queue === "review").length,
          newCount: s.items.filter((item) => item.queue === "new").length,
          createdAt: s.createdAt,
        };
      }),
    dueCards,
    sources: db
      .prepare(
        "SELECT payload FROM sources ORDER BY published_at DESC LIMIT 60",
      )
      .all()
      .map((row) => JSON.parse(row.payload)),
    preferences: getSetting("preferences", { level: "B1", topic: "生活" }),
    discovery: getSetting("discovery", { syncedAt: null, error: null }),
    automation: getSetting("automation", { generatedAt: null, error: null }),
    stats: {
      reviewedToday: db
        .prepare("SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at >= ?")
        .get(today.getTime()).n,
      completed: db
        .prepare(
          "SELECT COUNT(*) AS n FROM lessons WHERE completed_at IS NOT NULL",
        )
        .get().n,
      totalCards: allCards.length,
      learnedCards: allCards.filter(
        (card) => hasLearned(card) && !card.familiar,
      ).length,
      unlearnedCards: allCards.filter(
        (card) => !hasLearned(card) && !card.familiar,
      ).length,
      familiarCards: allCards.filter((card) => card.familiar).length,
      practicedToday: db
        .prepare(
          "SELECT COUNT(*) AS n FROM practice_attempts WHERE practiced_at >= ?",
        )
        .get(today.getTime()).n,
    },
    aiEnabled: Boolean(process.env.OPENAI_API_KEY),
    autoGenerate: process.env.AUTO_GENERATE === "true",
  };
}
