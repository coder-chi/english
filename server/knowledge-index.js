import { createHash } from "node:crypto";
import { wordbooks } from "./wordbook-catalog.js";

export const normalizeWord = (value) =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
// 编号只由英文词头决定，与词书、释义文字及用户学习状态无关。
export const wordId = (term) =>
  `w_${createHash("sha256").update(normalizeWord(term)).digest("hex").slice(0, 24)}`;
export const sentenceId = (en, zh) =>
  `s_${createHash("sha256")
    .update(JSON.stringify([en.trim(), zh.trim()]))
    .digest("hex")
    .slice(0, 24)}`;

export function syncKnowledge(db, lessons) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocabulary_words (id TEXT PRIMARY KEY, normalized TEXT UNIQUE NOT NULL, term TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vocabulary_sources (
        source_id TEXT PRIMARY KEY, word_id TEXT NOT NULL, book_id TEXT, entry_id TEXT, card_id INTEGER,
        meaning TEXT NOT NULL, pos TEXT NOT NULL, label TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS vocabulary_source_word ON vocabulary_sources(word_id);
      CREATE TABLE IF NOT EXISTS sentences (
        id TEXT PRIMARY KEY, english TEXT NOT NULL, chinese TEXT NOT NULL,
        saved INTEGER NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0, last_reviewed_at INTEGER);
      CREATE TABLE IF NOT EXISTS sentence_sources (
        source_id TEXT PRIMARY KEY, sentence_id TEXT NOT NULL, label TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sentence_words (
        sentence_id TEXT NOT NULL, word_id TEXT NOT NULL, source_id TEXT NOT NULL,
        PRIMARY KEY(sentence_id, word_id, source_id));
      CREATE INDEX IF NOT EXISTS sentence_word_lookup ON sentence_words(word_id, sentence_id);
      CREATE TABLE IF NOT EXISTS sentence_recalls (
        token TEXT PRIMARY KEY, sentence_id TEXT NOT NULL, revealed INTEGER NOT NULL DEFAULT 0,
        rating TEXT, created_at INTEGER NOT NULL, completed_at INTEGER);
    `);
    const putWord = db.prepare(
      "INSERT OR IGNORE INTO vocabulary_words VALUES (?, ?, ?)",
    );
    const putSource = db.prepare(
      "INSERT INTO vocabulary_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const putSentence = db.prepare(
      "INSERT OR IGNORE INTO sentences(id, english, chinese) VALUES (?, ?, ?)",
    );
    const putSentenceSource = db.prepare(
      "INSERT INTO sentence_sources VALUES (?, ?, ?)",
    );
    const putLink = db.prepare(
      "INSERT OR IGNORE INTO sentence_words VALUES (?, ?, ?)",
    );
    // 索引可从词书和卡片重建，例句收藏、回顾次数与回顾会话独立持久化。
    db.exec(
      "DELETE FROM vocabulary_sources; DELETE FROM sentence_sources WHERE source_id NOT LIKE 'user:%' AND source_id NOT LIKE 'listening:%'; DELETE FROM sentence_words WHERE source_id NOT LIKE 'user:%' AND source_id NOT LIKE 'listening:%';",
    );
    function word(term) {
      const id = wordId(term);
      putWord.run(id, normalizeWord(term), term);
      return id;
    }
    function example(entry, source, label, linkedId) {
      if (!entry.example?.trim() || !entry.translation?.trim()) return;
      const id = sentenceId(entry.example, entry.translation);
      putSentence.run(id, entry.example.trim(), entry.translation.trim());
      putSentenceSource.run(source, id, label);
      // 原词条例句是明确关联，保留词形变化及短语，不靠模糊子串自动猜测。
      putLink.run(id, linkedId, source);
    }
    for (const book of wordbooks) {
      for (const entry of book.entries) {
        const id = word(entry.term);
        const source = `book:${book.id}:${entry.id}`;
        const label = `${book.title} · ${entry.section || "精选"} · ${entry.provenance || "Small Steps"}`;
        putSource.run(
          source,
          id,
          book.id,
          entry.id,
          null,
          entry.meaning,
          entry.partOfSpeech || "",
          label,
        );
        example(entry, source, label, id);
      }
    }
    for (const lesson of lessons) {
      for (const [i, entry] of lesson.phrases.entries()) {
        const id = word(entry.term);
        const source = `lesson:${lesson.id}:${i}`;
        const label = `${lesson.title} · ${lesson.kind || "阅读材料"}`;
        putSource.run(
          source,
          id,
          null,
          null,
          null,
          entry.meaning,
          entry.partOfSpeech || "",
          label,
        );
        example(entry, source, label, id);
      }
    }
    for (const card of db.prepare("SELECT * FROM cards").all()) {
      const id = word(card.term);
      const source = `card:${card.id}`;
      putSource.run(
        source,
        id,
        null,
        null,
        card.id,
        card.meaning,
        card.part_of_speech,
        "我的学习卡片",
      );
      // 卡片中自编或编辑的例句也进入统一例句库；与原文完全相同的句子自动共用。
      example(card, source, "我的学习卡片", id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
