import { randomUUID } from "node:crypto";
import { db, transaction, setSetting } from "./store.js";
import { AppError } from "./services.js";
import { recordScheduledReview } from "./repetition.js";
import { setCardFamiliar } from "./card-familiar.js";
import {
  memorySummary,
  previewSchedule,
  sortDueCards,
  hasLearned,
  isDue,
} from "./scheduler.js";
import { wordbooks } from "./wordbook-catalog.js";
import { lookupPartOfSpeech } from "./vocabulary-metadata.js";
import { normalizePartOfSpeech } from "./parts-of-speech.js";
import { wordId } from "./knowledge-index.js";
import { getAssociations } from "./associations.js";
import {
  recentRatings,
  newWordBudget,
  budgetNotice,
  applyBudget,
  manualPaceUntil,
  lighten,
  selectClosing,
} from "./practice-flow.js";

function text(value, label, max, required = true) {
  if (value === undefined && !required) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new AppError(
      `${label}${required ? "不能为空，且" : ""}最多 ${max} 字。`,
    );
  return value.trim();
}
function choice(value, values, label) {
  if (!values.includes(value)) throw new AppError(`${label}无效。`);
  return value;
}
function cardById(id) {
  if (!Number.isSafeInteger(id)) throw new AppError("无效的词条编号。");
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(id);
  if (!card) throw new AppError("词条不存在。", 404);
  return card;
}
function categoryId(value) {
  if (value === null || value === undefined || value === "") return null;
  if (
    !Number.isSafeInteger(value) ||
    !db.prepare("SELECT id FROM categories WHERE id = ?").get(value)
  )
    throw new AppError("分类不存在。");
  return value;
}
function normalize(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[。.!！?？]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sortNewCards(cards) {
  // 用户主动记录或收藏的内容优先；纯词书导入项留在后面，组内保持原有入库顺序。
  return [...cards].sort(
    (a, b) =>
      Number(a.lesson_id.startsWith("book:")) -
        Number(b.lesson_id.startsWith("book:")) || a.id - b.id,
  );
}

export function saveCard(input) {
  const original = input.id === undefined ? null : cardById(input.id);
  const term = text(input.term, "英文", 160).replace(/\s+/g, " ");
  const meaning = text(input.meaning, "中文释义", 800);
  const kind = choice(input.kind, ["word", "phrase"], "词条类型");
  const category = categoryId(input.categoryId);
  const example = text(input.example, "英文例句", 2000, false);
  const translation = text(input.translation, "例句翻译", 2000, false);
  const note = text(input.note, "笔记", 2000, false);
  const partOfSpeech =
    input.partOfSpeech === undefined
      ? original && original.term === term && original.meaning === meaning
        ? original.part_of_speech
        : lookupPartOfSpeech(term, meaning)
      : normalizePartOfSpeech(input.partOfSpeech);
  if (partOfSpeech === null)
    throw new AppError(
      "词性无效，请填写 n.、v.、adj. 等缩写或中文名称，多项用 / 分隔。",
    );
  // 允许一词多义，只拦截手动词条中英文和释义都相同的重复项。
  const duplicate = db
    .prepare(
      "SELECT id, term, meaning FROM cards WHERE lesson_id LIKE 'manual:%'",
    )
    .all()
    .find(
      (c) =>
        c.id !== original?.id &&
        normalize(c.term) === normalize(term) &&
        normalize(c.meaning) === normalize(meaning),
    );
  if (duplicate)
    throw new AppError(
      "已有相同词条与释义，请编辑原词条；已归档的词条可在归档中恢复。",
      409,
    );
  const now = Date.now();
  if (original) {
    const collision = db
      .prepare(
        "SELECT id FROM cards WHERE lesson_id = ? AND term = ? AND id != ?",
      )
      .get(original.lesson_id, term, original.id);
    if (collision) throw new AppError("同一来源已有这个英文词条。", 409);
    db.prepare(
      "UPDATE cards SET term=?, meaning=?, kind=?, category_id=?, example=?, translation=?, note=?, part_of_speech=?, updated_at=?, schedule_revision=schedule_revision+1 WHERE id=?",
    ).run(
      term,
      meaning,
      kind,
      category,
      example,
      translation,
      note,
      partOfSpeech,
      Math.max(now, original.updated_at + 1),
      original.id,
    );
    return cardById(original.id);
  }
  // 手动条目使用唯一来源值，允许同一个英文拥有不同释义。
  const result = db
    .prepare(
      "INSERT INTO cards (lesson_id, term, meaning, kind, category_id, example, translation, note, part_of_speech, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      `manual:${randomUUID()}`,
      term,
      meaning,
      kind,
      category,
      example,
      translation,
      note,
      partOfSpeech,
      now,
      now,
      now,
    );
  return cardById(Number(result.lastInsertRowid));
}

export function updateCardFlag(input) {
  const card = cardById(input.id);
  choice(input.field, ["starred", "archived", "personal", "familiar"], "操作");
  if (typeof input.value !== "boolean")
    throw new AppError("状态必须为布尔值。");
  if (input.field === "familiar") {
    setCardFamiliar(card, input.value);
  } else if (input.field === "starred")
    db.prepare("UPDATE cards SET starred = ? WHERE id = ?").run(
      Number(input.value),
      card.id,
    );
  else if (input.field === "personal")
    db.prepare("UPDATE cards SET personal = ? WHERE id = ?").run(
      Number(input.value),
      card.id,
    );
  else
    db.prepare(
      "UPDATE cards SET archived = ?, schedule_revision=schedule_revision+1 WHERE id = ?",
    ).run(Number(input.value), card.id);
  return { ok: true };
}

export function saveCategory(input) {
  const name = text(input.name, "分类名称", 30);
  if (input.id !== undefined) categoryId(input.id);
  const duplicate = db
    .prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE")
    .get(name);
  if (duplicate && duplicate.id !== input.id)
    throw new AppError("这个分类已经存在。", 409);
  if (input.id !== undefined)
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(
      name,
      input.id,
    );
  else db.prepare("INSERT INTO categories(name) VALUES (?)").run(name);
  return { ok: true };
}
export function removeCategory(input) {
  const id = categoryId(input.id);
  if (id === null) throw new AppError("请选择分类。");
  return transaction(() => {
    db.prepare("UPDATE cards SET category_id = NULL WHERE category_id = ?").run(
      id,
    );
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    return { ok: true };
  });
}
export function saveReminders(input) {
  if (
    typeof input.enabled !== "boolean" ||
    typeof input.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)
  )
    throw new AppError("请选择有效的提醒时间。");
  setSetting("reminders", { enabled: input.enabled, time: input.time });
  return { ok: true };
}

function readSession(id) {
  if (typeof id !== "string") throw new AppError("练习编号无效。");
  const row = db
    .prepare("SELECT payload FROM practice_sessions WHERE id = ?")
    .get(id);
  if (!row) throw new AppError("练习不存在。", 404);
  const session = JSON.parse(row.payload);
  let changed = false;
  // 升级前的到期会话可能混入未学词；恢复或评分时跳过，不能借旧快照把新词混入复习。
  while (session.items[session.position]) {
    const item = session.items[session.position];
    const card = cardById(item.card.id);
    const skipped = card.familiar
      ? "familiar"
      : session.mode === "due" && !hasLearned(card)
        ? "unlearned"
        : null;
    if (!skipped) break;
    session.results.push({
      cardId: item.card.id,
      term: item.card.term,
      meaning: item.card.meaning,
      direction: item.direction,
      rating: skipped,
      scheduled: false,
    });
    session.position++;
    session.pending = null;
    changed = true;
  }
  if (changed) storeSession(session);
  return session;
}
function storeSession(session) {
  db.prepare("INSERT OR REPLACE INTO practice_sessions VALUES (?, ?, ?)").run(
    session.id,
    JSON.stringify(session),
    session.createdAt,
  );
}
function schedulingNotice(session, card, schedulable) {
  if (session.mode === "free" && hasLearned(card))
    return "自由练习：已学词只记录本次表现，不更新复习时间。";
  if (!schedulable)
    return "词条状态已变化，本次仅记录表现，不覆盖新的复习计划。";
  const phase = memorySummary(card).phase;
  if (phase === "new")
    return "当前是新词首轮学习，分钟数表示短期巩固步骤，不是“想起来了”的固定复习间隔；进入间隔复习后会按记忆历史动态计算。";
  if (phase === "learning" || phase === "relearning")
    return "当前仍在短期巩固阶段；完成后会进入按记忆历史动态计算的间隔复习。";
  return "当前是间隔复习，四个时间均由 FSRS 根据这张卡片的记忆历史计算。";
}
function viewSession(s) {
  const item = s.items[s.position];
  const live = item ? cardById(item.card.id) : null;
  const schedulable = live && canSchedule(s, item, live, Date.now());
  const current = item
    ? {
        id: item.card.id,
        direction: item.direction,
        question:
          item.direction === "en-zh" ? item.card.term : item.card.meaning,
        kind: item.card.kind,
        queue: item.queue || (hasLearned(live) ? "review" : "new"),
        memory: memorySummary(live),
        schedule: s.pending && schedulable ? previewSchedule(live) : null,
        scheduleNotice: schedulingNotice(s, live, schedulable),
        // 翻卡之前不向页面发送答案和可能泄露答案的例句。
        answer: s.pending
          ? {
              term: item.card.term,
              wordId: wordId(item.card.term),
              associations: getAssociations(wordId(item.card.term)),
              meaning: item.card.meaning,
              // 旧会话缺少词性时按原快照补全，不修改原题目或学习进度。
              partOfSpeech:
                item.card.part_of_speech ??
                lookupPartOfSpeech(item.card.term, item.card.meaning),
              example: item.card.example,
              translation: item.card.translation,
              note: item.card.note,
              input: s.pending.input,
              matched: s.pending.matched,
              revealed: s.pending.revealed,
            }
          : null,
      }
    : null;
  return {
    id: s.id,
    mode: s.mode,
    direction: s.direction,
    exercise: s.exercise,
    config: s.config,
    flow: s.flow || null,
    total: s.items.length,
    reviewCount: s.items.filter((item) => item.queue === "review").length,
    newCount: s.items.filter((item) => item.queue === "new").length,
    position: s.position,
    current,
    results: s.results,
    correct: s.results.filter((r) => ["good", "easy"].includes(r.rating))
      .length,
    skipped: s.results.filter((r) =>
      ["familiar", "unlearned"].includes(r.rating),
    ).length,
    skippedFamiliar: s.results.filter((r) => r.rating === "familiar").length,
    skippedUnlearned: s.results.filter((r) => r.rating === "unlearned").length,
  };
}
export function getSession(input) {
  return viewSession(readSession(input.id));
}
function smartMix(cards, limit, now, newCap = limit) {
  const reviews = sortDueCards(cards.filter((card) => isDue(card, now)));
  const fresh = sortNewCards(cards.filter((card) => !hasLearned(card))).slice(
    0,
    newCap,
  );
  if (!reviews.length)
    return fresh.slice(0, limit).map((card) => ({ card, queue: "new" }));
  if (!fresh.length)
    return reviews.slice(0, limit).map((card) => ({ card, queue: "review" }));
  if (limit === 1) return [{ card: reviews[0], queue: "review" }];

  // 到期词约占七成；两类都有时至少各取一个，再由另一类补足空位。
  const reviewTarget = Math.min(
    reviews.length,
    Math.max(1, Math.min(limit - 1, Math.ceil(limit * 0.7))),
  );
  const selectedReviews = reviews.slice(0, reviewTarget);
  const selectedFresh = fresh.slice(
    0,
    Math.min(fresh.length, limit - reviewTarget),
  );
  let remaining = limit - selectedReviews.length - selectedFresh.length;
  if (remaining > 0) {
    const extraReviews = reviews.slice(
      selectedReviews.length,
      selectedReviews.length + remaining,
    );
    selectedReviews.push(...extraReviews);
    remaining -= extraReviews.length;
  }
  if (remaining > 0)
    selectedFresh.push(
      ...fresh.slice(selectedFresh.length, selectedFresh.length + remaining),
    );

  // 从旧词开始并均匀穿插新词，避免用户中途结束时只做了其中一类。
  const mixed = [];
  let reviewIndex = 0;
  let freshIndex = 0;
  const total = selectedReviews.length + selectedFresh.length;
  for (let position = 0; position < total; position++) {
    const expectedFresh = Math.round(
      ((position + 1) * selectedFresh.length) / total,
    );
    if (position > 0 && freshIndex < expectedFresh)
      mixed.push({ card: selectedFresh[freshIndex++], queue: "new" });
    else if (reviewIndex < selectedReviews.length)
      mixed.push({ card: selectedReviews[reviewIndex++], queue: "review" });
    else mixed.push({ card: selectedFresh[freshIndex++], queue: "new" });
  }
  return mixed;
}
export function startSession(input) {
  const source = input.source || "all";
  if (
    !["all", "personal"].includes(source) &&
    !wordbooks.some((b) => b.id === source)
  )
    throw new AppError("练习词书不存在。");
  const bookCardIds = new Set(
    db
      .prepare("SELECT card_id FROM book_entries WHERE book_id = ?")
      .all(source)
      .map((row) => row.card_id),
  );
  const mode = choice(
    input.mode || "smart",
    ["smart", "free", "due", "learn"],
    "练习范围",
  );
  if (input.adaptive !== undefined && typeof input.adaptive !== "boolean")
    throw new AppError("自适应状态必须为布尔值。");
  const adaptive = input.adaptive === true;
  if (adaptive && mode !== "smart")
    throw new AppError("轻量练习仅支持智能混合。");
  const direction = choice(
    input.direction || "en-zh",
    ["en-zh", "zh-en", "mixed"],
    "练习方向",
  );
  const exercise = choice(
    input.exercise || (adaptive ? "flashcard" : "typing"),
    ["typing", "flashcard"],
    "练习方式",
  );
  const scope = choice(
    input.scope || "all",
    ["all", "starred", "weak"],
    "筛选",
  );
  const kind = choice(
    input.kind || "all",
    ["all", "word", "phrase"],
    "词条类型",
  );
  const category =
    input.categoryId === "uncategorized"
      ? "uncategorized"
      : categoryId(input.categoryId);
  const limit = adaptive ? 10 : (input.limit ?? 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new AppError("每组练习为 1–100 个词条。");
  const now = Date.now();
  const config = {
    source,
    mode,
    direction,
    exercise,
    scope,
    kind,
    categoryId: category,
    limit,
    adaptive,
  };
  const paceUntil = adaptive ? manualPaceUntil(config, now) : null;
  const newCap = adaptive
    ? paceUntil
      ? 0
      : newWordBudget(recentRatings(config, now))
    : limit;
  let cards = db
    .prepare(
      `SELECT cards.*,
    (SELECT rating FROM practice_attempts WHERE card_id = cards.id ORDER BY id DESC LIMIT 1) AS last_rating
    FROM cards WHERE archived = 0 AND familiar = 0`,
    )
    .all();
  cards = cards.filter(
    (card) =>
      (source === "all" ||
        (source === "personal" ? card.personal : bookCardIds.has(card.id))) &&
      (mode !== "due" || isDue(card, now)) &&
      (mode !== "learn" || !hasLearned(card)) &&
      (mode !== "smart" || isDue(card, now) || !hasLearned(card)) &&
      (category === null ||
        (category === "uncategorized"
          ? card.category_id === null
          : card.category_id === category)) &&
      (kind === "all" || card.kind === kind) &&
      (scope !== "starred" || card.starred) &&
      (scope !== "weak" || ["again", "hard"].includes(card.last_rating)),
  );
  if (input.retrySessionId) {
    const previous = readSession(input.retrySessionId);
    if (previous.position !== previous.items.length)
      throw new AppError("请先完成本组练习。");
    const weak = new Set(
      previous.results
        .filter((r) => ["again", "hard"].includes(r.rating))
        .map((r) => r.cardId),
    );
    cards = cards.filter((card) => weak.has(card.id));
  }
  if (!cards.length && !adaptive)
    throw new AppError(
      mode === "due"
        ? "当前没有已学且到期的词条。新词请切换“学新词”。"
        : mode === "learn"
          ? "当前没有未学的新词，可切换到期复习或自由练习。"
          : mode === "smart"
            ? "当前没有到期旧词或未学新词，可选择自由练习。"
            : "当前条件下没有可练习的词条，试试其他分类或范围。",
    );
  let selectedCards;
  if (mode === "smart") selectedCards = smartMix(cards, limit, now, newCap);
  else if (mode === "due")
    selectedCards = sortDueCards(cards)
      .slice(0, limit)
      .map((card) => ({ card, queue: "review" }));
  else if (mode === "learn")
    selectedCards = sortNewCards(cards)
      .slice(0, limit)
      .map((card) => ({ card, queue: "new" }));
  else {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    selectedCards = cards.slice(0, limit).map((card) => ({
      card,
      queue: hasLearned(card) ? "review" : "new",
    }));
  }
  const session = {
    config,
    flow: adaptive
      ? {
          newCap,
          paceUntil,
          deferredNewCount: 0,
          notice: budgetNotice(newCap),
          closing: null,
        }
      : null,
    id: randomUUID(),
    mode,
    direction,
    exercise,
    position: 0,
    pending: null,
    results: [],
    createdAt: now,
    items: selectedCards.map(({ card, queue }, i) => ({
      card,
      queue,
      direction:
        direction === "mixed" ? (i % 2 === 0 ? "en-zh" : "zh-en") : direction,
    })),
  };
  storeSession(session);
  return viewSession(session);
}

function assertPosition(input, s) {
  if (
    !Number.isSafeInteger(input.position) ||
    input.position !== s.position ||
    !s.items[s.position]
  )
    throw new AppError("练习进度已更新，请重新打开本组练习。", 409);
}
export function checkAnswer(input) {
  return transaction(() => {
    const s = readSession(input.id);
    if (
      Number.isSafeInteger(input.position) &&
      input.position >= 0 &&
      input.position < s.position &&
      ["familiar", "unlearned"].includes(s.results[input.position]?.rating)
    )
      return viewSession(s);
    assertPosition(input, s);
    if (s.pending) return viewSession(s);
    const value = text(input.answer ?? "", "答案", 1200, false);
    if (!input.reveal && !value)
      throw new AppError("先输入你的答案，或选择直接翻卡。");
    const item = s.items[s.position];
    const expected =
      item.direction === "en-zh" ? item.card.meaning : item.card.term;
    // 只比较明确列出的参考答案；同义改写由学习者核对后评分，不做语义判错。
    const alternatives = [expected, ...expected.split(/[;；/、]/)];
    s.pending = {
      input: value,
      revealed: Boolean(input.reveal),
      matched:
        !input.reveal &&
        alternatives.some((v) => normalize(v) === normalize(value)),
    };
    storeSession(s);
    return viewSession(s);
  });
}
function canSchedule(session, item, current, now) {
  return (
    (session.mode === "due"
      ? isDue(current, now)
      : session.mode === "smart"
        ? item.queue === "review"
          ? isDue(current, now)
          : item.queue === "new" && !hasLearned(current)
        : ["learn", "free"].includes(session.mode) && !hasLearned(current)) &&
    !current.archived &&
    !current.familiar &&
    current.due_at === item.card.due_at &&
    current.repetitions === item.card.repetitions &&
    current.updated_at === item.card.updated_at &&
    current.schedule_revision === (item.card.schedule_revision ?? 0)
  );
}
export function gradeAnswer(input) {
  return transaction(() => {
    const s = readSession(input.id);
    // 网络重试和双击均返回已经保存的进度，不能重复计次或推进下一题。
    if (Number.isSafeInteger(input.position) && input.position < s.position)
      return viewSession(s);
    assertPosition(input, s);
    if (!s.pending) throw new AppError("请先核对答案。");
    const rating = choice(
      input.rating,
      ["again", "hard", "good", "easy"],
      "掌握程度",
    );
    const item = s.items[s.position];
    const current = cardById(item.card.id);
    const now = Date.now();
    let scheduled = false;
    let dueAt = null;
    // 首次学习（含自由练习中首次作答）建立排程；已学词只有到期复习更新模型。
    if (canSchedule(s, item, current, now)) {
      dueAt = recordScheduledReview(current, rating, now).dueAt;
      scheduled = true;
    }
    db.prepare(
      "INSERT INTO practice_attempts(session_id, position, card_id, direction, rating, mode, practiced_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(s.id, s.position, current.id, item.direction, rating, s.mode, now);
    s.results.push({
      cardId: current.id,
      term: item.card.term,
      meaning: item.card.meaning,
      direction: item.direction,
      rating,
      scheduled,
      dueAt,
    });
    s.position++;
    s.pending = null;
    if (s.flow) applyBudget(s, newWordBudget(recentRatings(s.config, now)));
    storeSession(s);
    return viewSession(s);
  });
}

export function lightenSession(input) {
  return transaction(() => {
    const s = readSession(input.id);
    if (!s.flow) throw new AppError("这组不是轻量练习。");
    assertPosition(input, s);
    lighten(s);
    storeSession(s);
    return viewSession(s);
  });
}

function completedFlow(id) {
  const s = readSession(id);
  if (!s.flow || s.position !== s.items.length)
    throw new AppError("请先完成这一轮轻量练习。");
  return s;
}

export function continueSession(input) {
  return transaction(() => {
    const s = completedFlow(input.id);
    // 重试同一个“继续”请求始终返回同一轮，不创建多份队列。
    if (s.flow.nextSessionId)
      return viewSession(readSession(s.flow.nextSessionId));
    const next = startSession(s.config);
    s.flow.nextSessionId = next.id;
    storeSession(s);
    return next;
  });
}

export function closingSession(input) {
  return transaction(() => {
    const s = completedFlow(input.id);
    if (!s.flow.closing) s.flow.closing = selectClosing(s);
    if (input.complete === true && !s.flow.closing.completedAt)
      s.flow.closing.completedAt = Date.now();
    storeSession(s);
    return viewSession(s);
  });
}
