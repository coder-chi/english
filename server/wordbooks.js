import { db, transaction } from "./store.js";
import { wordbooks } from "./wordbook-catalog.js";
import { AppError } from "./services.js";
import { wordId } from "./knowledge-index.js";
import { setCardFamiliar } from "./card-familiar.js";
import {
  learningStatus,
  matchesProgress,
  summarizeProgress,
} from "../public/learning-progress.js";

function bookLinks(bookId) {
  return new Map(
    db
      .prepare(
        "SELECT entry_id, card_id, archived, familiar, learned_at FROM book_entries JOIN cards ON cards.id = book_entries.card_id WHERE book_id = ?",
      )
      .all(bookId)
      .map((link) => [link.entry_id, link]),
  );
}

function findBook(id) {
  const book = wordbooks.find((b) => b.id === id);
  if (!book) throw new AppError("词书不存在。", 404);
  return book;
}
export function previewBook(input) {
  const book = findBook(input.bookId);
  const links = bookLinks(book.id);
  const filtered = filterEntries(book, input, links);
  const pageSize = input.pageSize ?? (book.entries.length > 200 ? 50 : 200);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200)
    throw new AppError("每页数量为 1–200。");
  if (
    input.page !== undefined &&
    (!Number.isSafeInteger(input.page) || input.page < 1)
  )
    throw new AppError("页码必须为正整数。");
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(input.page || 1, pages);
  const sections = new Map();
  for (const entry of book.entries) {
    const name = entry.section || "精选词条";
    const section = sections.get(name) || { name, total: 0, imported: 0 };
    section.total++;
    if (links.has(entry.id)) section.imported++;
    sections.set(name, section);
  }
  return {
    ...book,
    total: book.entries.length,
    partOfSpeechCount: book.entries.filter((entry) => entry.partOfSpeech)
      .length,
    imported: links.size,
    progress: summarizeProgress(
      book.entries.map((entry) => links.get(entry.id)),
    ),
    filtered: filtered.length,
    remaining: filtered.filter((entry) => !links.has(entry.id)).length,
    sections: [...sections.values()],
    page,
    pageSize,
    pages,
    entries: filtered
      .slice((page - 1) * pageSize, page * pageSize)
      .map((entry) => {
        const link = links.get(entry.id);
        return {
          ...entry,
          wordId: wordId(entry.term),
          imported: Boolean(link),
          archived: Boolean(link?.archived),
          familiar: Boolean(link?.familiar),
          learningStatus: learningStatus(link),
          cardId: link?.card_id || null,
        };
      }),
  };
}
const normalize = (value) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
function filterEntries(book, input, links) {
  const { query = "", section = "", status = "all" } = input;
  if (
    typeof query !== "string" ||
    query.length > 160 ||
    typeof section !== "string" ||
    (section &&
      !book.entries.some((e) => (e.section || "精选词条") === section)) ||
    ![
      "all",
      "new",
      "imported",
      "learned",
      "learning",
      "familiar",
      "unlearned",
      "covered",
      "archived",
    ].includes(status)
  )
    throw new AppError("无效的词书筛选条件。");
  const search = normalize(query);
  return book.entries.filter(
    (entry) =>
      (!section || (entry.section || "精选词条") === section) &&
      (status === "all" ||
        (["new", "imported"].includes(status)
          ? links.has(entry.id) === (status === "imported")
          : matchesProgress(links.get(entry.id), status))) &&
      (!search || normalize(`${entry.term} ${entry.meaning}`).includes(search)),
  );
}
function selectedBookEntries(book, entryIds, limit = book.entries.length) {
  const validIds = new Set(book.entries.map((e) => e.id));
  if (
    !Array.isArray(entryIds) ||
    !entryIds.length ||
    entryIds.length > limit ||
    entryIds.some((id) => typeof id !== "string" || !validIds.has(id))
  )
    throw new AppError("请选择词书中的有效词条。");
  const ids = new Set(entryIds);
  return book.entries.filter((e) => ids.has(e.id));
}

export function importBook(input) {
  const book = findBook(input.bookId);
  const mode = input.mode || "selected";
  if (!["selected", "next", "all"].includes(mode))
    throw new AppError("请选择有效的导入方式。");
  let chosen;
  if (mode === "selected") {
    chosen = selectedBookEntries(book, input.entryIds);
  }
  if (
    mode === "next" &&
    (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100)
  )
    throw new AppError("每批导入数量为 1–100。");
  return transaction(() => {
    const existing = new Set(
      db
        .prepare("SELECT entry_id FROM book_entries WHERE book_id = ?")
        .all(book.id)
        .map((m) => m.entry_id),
    );
    const filtered = filterEntries(book, input, bookLinks(book.id));
    if (mode === "all") chosen = filtered;
    if (mode === "next")
      chosen = filtered
        .filter((e) => !existing.has(e.id))
        .slice(0, input.limit);
    return importEntries(book, chosen, existing);
  });
}

// 只做导入，由各用例在外层开启事务，确保导入与标记同时成功或回滚。
function importEntries(book, chosen, existing) {
  const cardKey = (c) =>
    JSON.stringify([normalize(c.term), normalize(c.meaning)]);
  const cards = new Map();
  for (const card of db.prepare("SELECT * FROM cards ORDER BY id").all())
    if (!cards.has(cardKey(card))) cards.set(cardKey(card), card);
  const categories = new Map(
    db
      .prepare("SELECT id, name FROM categories")
      .all()
      .map((c) => [c.name, c.id]),
  );
  const insertCategory = db.prepare(
    "INSERT OR IGNORE INTO categories(name) VALUES (?)",
  );
  const findCategory = db.prepare("SELECT id FROM categories WHERE name = ?");
  const insertCard = db.prepare(`INSERT INTO cards
      (lesson_id, term, meaning, example, translation, due_at, kind, category_id, created_at, personal, note, part_of_speech)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`);
  const insertLink = db.prepare("INSERT INTO book_entries VALUES (?, ?, ?, ?)");
  let added = 0,
    reused = 0,
    skipped = 0,
    archived = 0;
  const now = Date.now();
  const category =
    db.prepare("SELECT id FROM categories WHERE name = ?").get(book.category)
      ?.id || null;
  for (const entry of chosen) {
    if (existing.has(entry.id)) {
      skipped++;
      continue;
    }
    // 只有英文、释义均相同才共用卡片，不合并一词多义，不覆盖用户编辑。
    let card = cards.get(cardKey(entry));
    if (card) {
      reused++;
      if (card.archived) archived++;
    } else {
      // 带主题的词书只在实际导入新卡片时建立分类，复用卡片保留用户原分类。
      let entryCategory = category;
      if (entry.category) {
        if (!categories.has(entry.category)) {
          insertCategory.run(entry.category);
          categories.set(entry.category, findCategory.get(entry.category).id);
        }
        entryCategory = categories.get(entry.category);
      }
      const result = insertCard.run(
        `book:${book.id}:${entry.id}`,
        entry.term,
        entry.meaning,
        entry.example,
        entry.translation,
        now,
        entry.kind,
        entryCategory,
        now,
        entry.note || "",
        entry.partOfSpeech || "",
      );
      card = {
        id: Number(result.lastInsertRowid),
        term: entry.term,
        meaning: entry.meaning,
      };
      cards.set(cardKey(card), card);
      added++;
    }
    insertLink.run(book.id, entry.id, card.id, now);
  }
  return {
    bookId: book.id,
    added,
    reused,
    skipped,
    archived,
    imported: existing.size + added + reused,
  };
}

export function markBookFamiliar(input) {
  const book = findBook(input.bookId);
  if (typeof input.value !== "boolean")
    throw new AppError("状态必须为布尔值。");
  const chosen = selectedBookEntries(book, input.entryIds, 200);
  return transaction(() => {
    const existing = new Set(bookLinks(book.id).keys());
    // 恢复学习只处理已有卡片，不把未导入的词带入学习队列。
    const imported = input.value
      ? importEntries(book, chosen, existing)
      : { added: 0, reused: 0 };
    const links = bookLinks(book.id);
    const seen = new Set();
    let changed = 0,
      unchanged = 0,
      archived = 0;
    const findCard = db.prepare("SELECT * FROM cards WHERE id = ?");
    for (const entry of chosen) {
      const link = links.get(entry.id);
      if (!link) {
        unchanged++;
        continue;
      }
      if (link.archived) {
        archived++;
        continue;
      }
      // 同一张卡片在本批次只更新一次排程版本。
      if (seen.has(link.card_id)) continue;
      seen.add(link.card_id);
      if (setCardFamiliar(findCard.get(link.card_id), input.value)) changed++;
      else unchanged++;
    }
    return {
      bookId: book.id,
      value: input.value,
      selected: chosen.length,
      changed,
      unchanged,
      archived,
      added: imported.added,
      reused: imported.reused,
    };
  });
}
