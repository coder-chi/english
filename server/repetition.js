import { db } from "./store.js";
import { scheduleCard, schedulerInfo } from "./scheduler.js";

// 两个复习入口共用同一排程与日志写入，调用者必须已开启事务并校验卡片最新状态。
export function recordScheduledReview(card, rating, now) {
  const result = scheduleCard(card, rating, now);
  const dueAt = result.card.due.getTime();
  const interval = (dueAt - now) / 86400000;
  db.prepare(
    `UPDATE cards SET fsrs_card=?, interval_days=?, due_at=?, learned_at=COALESCE(learned_at, ?),
    repetitions=repetitions+1, schedule_revision=schedule_revision+1, updated_at=? WHERE id=?`,
  ).run(
    JSON.stringify(result.card),
    interval,
    dueAt,
    now,
    Math.max(now, card.updated_at + 1),
    card.id,
  );
  db.prepare(
    "INSERT INTO reviews(card_id, rating, reviewed_at, fsrs_log) VALUES (?, ?, ?, ?)",
  ).run(
    card.id,
    rating,
    now,
    JSON.stringify({ ...result.log, scheduler: schedulerInfo }),
  );
  return { interval, dueAt };
}
