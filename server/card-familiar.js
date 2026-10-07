import { db } from "./store.js";

// 单条与批量标记共用排程规则；调用方负责事务，避免嵌套事务。
export function setCardFamiliar(card, value) {
  if (Boolean(card.familiar) === value) return false;
  const now = Date.now();
  const updated = Math.max(now, card.updated_at + 1);
  if (value)
    db.prepare(
      "UPDATE cards SET familiar=1, updated_at=?, schedule_revision=schedule_revision+1 WHERE id=?",
    ).run(updated, card.id);
  else
    // 保留学习历史；未学词仍为新词，已学词立即进入待复习。
    db.prepare(
      "UPDATE cards SET familiar=0, due_at=?, interval_days=0, fsrs_card=NULL, updated_at=?, schedule_revision=schedule_revision+1 WHERE id=?",
    ).run(now, updated, card.id);
  return true;
}
