import { db } from "./store.js";
import { AppError } from "./services.js";
import { normalizeWord, wordId } from "./knowledge-index.js";
import { associationCatalog } from "./association-catalog.js";

// 联想关系独立于学习卡片；跨词书共享，重建词库来源时也不会丢失个人笔记。
db.exec(`
  CREATE TABLE IF NOT EXISTS word_associations (
    id TEXT PRIMARY KEY, left_id TEXT NOT NULL, right_id TEXT NOT NULL,
    kind TEXT NOT NULL, note TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS association_left ON word_associations(left_id);
  CREATE INDEX IF NOT EXISTS association_right ON word_associations(right_id);
`);
const kinds = ["meaning", "spelling", "family"];
function existingWord(id) {
  if (typeof id !== "string") throw new AppError("请选择有效词条。");
  const w = db.prepare("SELECT * FROM vocabulary_words WHERE id=?").get(id);
  if (!w) throw new AppError("词条不存在。", 404);
  return w;
}
function personalWord(id) {
  const w = existingWord(id);
  const meanings = db
    .prepare(
      "SELECT DISTINCT meaning FROM vocabulary_sources WHERE word_id=? LIMIT 2",
    )
    .all(id);
  return {
    id: w.id,
    term: w.term,
    meaning: meanings.map((m) => m.meaning).join("；"),
    usage: [],
  };
}
export function getAssociations(id) {
  const w = existingWord(id);
  const curated = associationCatalog
    .filter((group) =>
      group.words.some((entry) => normalizeWord(entry.term) === w.normalized),
    )
    .map((group) => ({
      ...group,
      origin: "curated",
      words: group.words.map((entry) => ({ ...entry, id: wordId(entry.term) })),
    }));
  const personal = db
    .prepare(
      "SELECT * FROM word_associations WHERE left_id=? OR right_id=? ORDER BY updated_at DESC,id",
    )
    .all(id, id)
    .map((row) => ({
      id: row.id,
      type: row.kind,
      origin: "personal",
      common: "我的联想笔记",
      contrast: row.note,
      updatedAt: row.updated_at,
      words: [personalWord(row.left_id), personalWord(row.right_id)],
    }));
  return { curated, personal };
}
export function saveAssociation(input) {
  const current = existingWord(input.wordId);
  if (
    typeof input.relatedTerm !== "string" ||
    !input.relatedTerm.trim() ||
    input.relatedTerm.length > 160
  )
    throw new AppError("请填写要联想的英文词或短语，最多160字。");
  const target = db
    .prepare("SELECT * FROM vocabulary_words WHERE normalized=?")
    .get(normalizeWord(input.relatedTerm));
  if (!target)
    throw new AppError(
      "统一词库中没有这个词，请先在生词本添加，再建立联想。",
      404,
    );
  if (target.id === current.id)
    throw new AppError("请选择另一个词，不能与自己建立联想。");
  if (!kinds.includes(input.type))
    throw new AppError("请选择近义辨析、形近易混或同词族。");
  if (
    typeof input.note !== "string" ||
    !input.note.trim() ||
    input.note.length > 1600
  )
    throw new AppError("请写下联想或区别，最多1600字。");
  // 无向关系使用排序后的词条编号；从任一方向重复保存都更新同一条，不双倍计数。
  const [left, right] = [current.id, target.id].sort();
  const id = `personal:${left}:${right}:${input.type}`;
  db.prepare(
    `INSERT INTO word_associations VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`,
  ).run(id, left, right, input.type, input.note.trim(), Date.now());
  return getAssociations(current.id);
}
export function removeAssociation(input) {
  const w = existingWord(input.wordId);
  if (
    typeof input.id !== "string" ||
    !input.id.startsWith("personal:") ||
    input.id.length > 120
  )
    throw new AppError("只能移除自己保存的联想。");
  db.prepare(
    "DELETE FROM word_associations WHERE id=? AND (left_id=? OR right_id=?)",
  ).run(input.id, w.id, w.id);
  return getAssociations(w.id);
}
