import {
  fsrs,
  createEmptyCard,
  Rating,
  State,
  StrategyMode,
  BasicLearningStepsStrategy,
} from "ts-fsrs";

export const schedulerInfo = {
  algorithm: "FSRS-6",
  implementation: "ts-fsrs 5.4.2",
  retention: 0.9,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
  policy: "首次轻松想起仍在30分钟后巩固；默认参数，未做个人参数训练。",
};
const ratings = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};
const scheduler = fsrs({
  request_retention: schedulerInfo.retention,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: schedulerInfo.learningSteps,
  relearning_steps: schedulerInfo.relearningSteps,
});
// 沿用库的学习步骤扩展点：保留真实 Easy 反馈及记忆更新，但不让首次自评跳过巩固。
scheduler.useStrategy(StrategyMode.LEARNING_STEPS, (params, state, step) => {
  const steps = BasicLearningStepsStrategy(params, state, step);
  if (state === State.New || (state === State.Learning && step === 0))
    steps[Rating.Easy] = { scheduled_minutes: 30, next_step: 1 };
  return steps;
});

function memoryCard(card) {
  const memory = card.fsrs_card
    ? JSON.parse(card.fsrs_card)
    : createEmptyCard(new Date(card.due_at));
  // 数据库到期时间是唯一权威值；迁移保留旧排程，恢复学习会清空模型。
  return { ...memory, due: new Date(card.due_at) };
}
export function scheduleCard(card, rating, now = Date.now()) {
  if (!Object.hasOwn(ratings, rating)) throw new Error("无效的复习评分。");
  return scheduler.next(memoryCard(card), new Date(now), ratings[rating]);
}
function intervalText(milliseconds) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天`;
}
function scheduleLabel(next, now) {
  const interval = intervalText(next.due.getTime() - now);
  return next.state === State.Learning || next.state === State.Relearning
    ? `${interval}后短期巩固`
    : `预计 ${interval}后间隔复习`;
}
export function previewSchedule(card, now = Date.now()) {
  return {
    cardId: card.id,
    revision: card.schedule_revision,
    options: Object.fromEntries(
      Object.keys(ratings).map((rating) => {
        const next = scheduleCard(card, rating, now).card;
        return [
          rating,
          {
            dueAt: next.due.getTime(),
            label: scheduleLabel(next, now),
          },
        ];
      }),
    ),
  };
}
export function memorySummary(card) {
  const memory = memoryCard(card);
  return {
    phase: ["new", "learning", "review", "relearning"][memory.state],
    label: [
      hasLearned(card) ? "待巩固" : "待初学",
      "短期巩固",
      "间隔复习",
      "遗忘重学",
    ][memory.state],
    stability: memory.stability,
    difficulty: memory.difficulty,
    lapses: memory.lapses,
    reviews: memory.reps,
    lastReview: memory.last_review
      ? new Date(memory.last_review).getTime()
      : null,
  };
}
export function hasLearned(card) {
  return card.learned_at !== null && card.learned_at !== undefined;
}
export function isDue(card, now = Date.now()) {
  return (
    hasLearned(card) && !card.archived && !card.familiar && card.due_at <= now
  );
}
export function sortDueCards(cards) {
  // 输入只允许已学到期词；分钟级巩固优先，其次日级复习及旧记录待巩固词。
  const priority = { learning: 0, relearning: 0, review: 1, new: 1 };
  return cards
    .map((card) => ({ card, rank: priority[memorySummary(card).phase] }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.card.due_at - b.card.due_at ||
        a.card.id - b.card.id,
    )
    .map((item) => item.card);
}
export function rebuildMemory(card, reviews) {
  // 自由练习并非标准间隔回忆，不用它伪造学习历史；已主动恢复学习的卡片重新开始。
  if (!reviews.length || card.interval_days === 0) return null;
  let memory = createEmptyCard(new Date(reviews[0].reviewed_at));
  for (const review of reviews) {
    if (!Object.hasOwn(ratings, review.rating)) continue;
    memory = scheduler.next(
      memory,
      new Date(review.reviewed_at),
      ratings[review.rating],
    ).card;
  }
  memory.due = new Date(card.due_at);
  return JSON.stringify(memory);
}

export function recoverInitialLearning(card, firstAttempt, reviews) {
  // 旧版自由练习没有建立模型。只补入真正的首次评分，不回放反复自由练习来夸大记忆。
  if (
    !firstAttempt ||
    firstAttempt.mode !== "free" ||
    firstAttempt.practiced_at !== card.learned_at ||
    !Object.hasOwn(ratings, firstAttempt.rating) ||
    (reviews.length && firstAttempt.practiced_at >= reviews[0].reviewed_at)
  )
    return null;
  // 编辑、主动恢复学习等操作可能有意重置模型；无法确认时保留用户当前状态。
  if (card.schedule_revision !== card.repetitions) return null;
  const current = card.fsrs_card ? JSON.parse(card.fsrs_card) : null;
  if (current ? current.reps !== reviews.length : reviews.length > 0)
    return null;
  let memory = scheduler.next(
    createEmptyCard(new Date(firstAttempt.practiced_at)),
    new Date(firstAttempt.practiced_at),
    ratings[firstAttempt.rating],
  ).card;
  for (const review of reviews) {
    if (!Object.hasOwn(ratings, review.rating)) return null;
    memory = scheduler.next(
      memory,
      new Date(review.reviewed_at),
      ratings[review.rating],
    ).card;
  }
  // 修复模型用于计算下一次间隔，不突然挪动已经承诺的复习时间。
  memory.due = new Date(card.due_at);
  return JSON.stringify(memory);
}
