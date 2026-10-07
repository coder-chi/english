// 页面统计、词书筛选共用口径：评分记录表示学过，熟悉只来自手动标记。
export function learningStatus(card) {
  if (card?.archived) return "archived";
  if (card?.familiar) return "familiar";
  return card?.learned_at != null ? "learning" : "unlearned";
}

export function matchesProgress(card, status) {
  if (status === "learned") return !card?.archived && card?.learned_at != null;
  if (status === "covered")
    return ["learning", "familiar"].includes(learningStatus(card));
  return learningStatus(card) === status;
}

export function summarizeProgress(cards) {
  const result = {
    total: cards.length,
    learned: 0,
    learning: 0,
    familiar: 0,
    unlearned: 0,
    archived: 0,
  };
  for (const card of cards) {
    result[learningStatus(card)]++;
    if (matchesProgress(card, "learned")) result.learned++;
  }
  result.covered = result.learning + result.familiar;
  result.percent = result.total ? (result.covered / result.total) * 100 : 0;
  return result;
}
