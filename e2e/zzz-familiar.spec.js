import { test, expect } from "@playwright/test";

test("熟悉词退出队列，旧会话跳过且恢复学习保留历史", async ({ request }) => {
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  await post("categories/save", { name: "熟悉词接口验证" });
  let state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find(
    (c) => c.name === "熟悉词接口验证",
  ).id;
  const card = await post("notebook/save", {
    term: "consolidate",
    meaning: "巩固",
    kind: "word",
    categoryId,
  });
  const session = await post("practice/start", { categoryId, mode: "learn" });
  await post("practice/check", { id: session.id, position: 0, reveal: true });
  await post("notebook/flag", { id: card.id, field: "familiar", value: true });
  const staleGrade = await post("practice/grade", {
    id: session.id,
    position: 0,
    rating: "easy",
  });
  expect(staleGrade.current).toBeNull();
  expect(staleGrade.skipped).toBe(1);
  expect(staleGrade.correct).toBe(0);
  expect(staleGrade.results[0].scheduled).toBe(false);
  await post("review", { cardId: card.id, rating: "good" }, 409);
  await post("practice/start", { categoryId, mode: "free" }, 400);
  await post("practice/start", { categoryId, mode: "due" }, 400);
  state = await (await request.get("/api/state")).json();
  expect(state.dueCards.some((c) => c.id === card.id)).toBe(false);
  const familiar = state.cards.find((c) => c.id === card.id);
  expect(familiar.familiar).toBe(1);
  expect(familiar.archived).toBe(0);
  expect(familiar.due_at).toBe(card.due_at);
  expect(familiar.practice_count).toBe(0);
  await post("notebook/flag", { id: card.id, field: "familiar", value: false });
  state = await (await request.get("/api/state")).json();
  const restored = state.cards.find((c) => c.id === card.id);
  expect(state.dueCards.some((c) => c.id === card.id)).toBe(false);
  expect(restored.learned_at).toBeNull();
  expect(restored.repetitions).toBe(card.repetitions);
  await post("notebook/flag", { id: card.id, field: "familiar", value: false });
  state = await (await request.get("/api/state")).json();
  expect(state.cards.find((c) => c.id === card.id).due_at).toBe(
    restored.due_at,
  );
  const newSession = await post("practice/start", {
    categoryId,
    mode: "learn",
  });
  expect(newSession.total).toBe(1);
  await post("notebook/flag", { id: card.id, field: "familiar", value: true });
  const checked = await post("practice/check", {
    id: newSession.id,
    position: 0,
    answer: "巩固",
  });
  expect(checked.current).toBeNull();
  expect(checked.skipped).toBe(1);
  // 同一词书重复导入也不能撤销用户的熟悉标记。
  await post("books/import", {
    bookId: "ngsl-everyday",
    mode: "selected",
    entryIds: ["know"],
  });
  const book = await post("books/preview", { bookId: "ngsl-everyday" });
  const known = book.entries.find((e) => e.id === "know").cardId;
  await post("notebook/flag", { id: known, field: "familiar", value: true });
  await post("books/import", {
    bookId: "ngsl-everyday",
    mode: "selected",
    entryIds: ["know"],
  });
  expect(
    (await post("books/preview", { bookId: "ngsl-everyday" })).entries.find(
      (e) => e.id === "know",
    ).familiar,
  ).toBe(true);
  await post("notebook/flag", { id: known, field: "familiar", value: false });
});

test("列表、练习中和结果页可标记熟悉，手机可恢复学习", async ({
  page,
  request,
}) => {
  await request.post("/api/categories/save", {
    data: { name: "熟悉词页面验证" },
  });
  const state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find(
    (c) => c.name === "熟悉词页面验证",
  ).id;
  const response = await request.post("/api/notebook/save", {
    data: {
      term: "versatile",
      meaning: "多才多艺的",
      kind: "word",
      categoryId,
    },
  });
  const card = await response.json();
  await page.goto("/#notebook");
  await page
    .locator(".category-strip button")
    .filter({ hasText: "熟悉词页面验证" })
    .click();
  const row = page.locator(".vocab-row").filter({ hasText: "versatile" });
  await row.getByRole("button", { name: "标记熟悉", exact: true }).click();
  await expect(row.locator(".vocab-state")).toContainText("已熟悉");
  await page.getByRole("button", { name: "待复习", exact: true }).click();
  await expect(page.locator(".vocab-row")).toHaveCount(0);
  await page.getByRole("button", { name: "已熟悉", exact: true }).click();
  await expect(page.locator(".vocab-row")).toHaveCount(1);
  await row.getByRole("button", { name: "恢复学习", exact: true }).click();
  await expect(page.locator(".vocab-row")).toHaveCount(0);
  await page.getByRole("button", { name: "未学习", exact: true }).click();
  await page.locator('[data-nb="quick"][data-direction="zh-en"]').click();
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-card")).toContainText("多才多艺的");
  await page.getByRole("button", { name: "标记熟悉", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "这一组，完成了。" }),
  ).toBeVisible();
  await expect(page.locator(".practice-result")).toContainText(
    "1 个已熟悉词条自动跳过",
  );
  await page
    .locator(".result-list")
    .getByRole("button", { name: "恢复学习", exact: true })
    .click();
  await expect(
    page
      .locator(".result-list")
      .getByRole("button", { name: "标记熟悉", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "再选一组", exact: true }).click();
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await page.getByRole("button", { name: "暂时想不起来，翻卡看看" }).click();
  await expect(page.locator(".practice-ratings button")).toHaveCount(4);
  await page.locator('[data-nb="grade"][data-rating="easy"]').click();
  await expect(page.locator(".practice-result")).toBeVisible();
  const before = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === card.id,
  );
  expect(before.familiar).toBe(0);
  await page
    .locator(".result-list")
    .getByRole("button", { name: "标记熟悉", exact: true })
    .click();
  await expect(
    page.locator(".result-list").getByRole("button", { name: "恢复学习" }),
  ).toBeVisible();
  await page.goto("/#notebook");
  await page.getByRole("button", { name: "已熟悉", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".artifacts/familiar-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".vocab-row")
    .filter({ hasText: "versatile" })
    .getByRole("button", { name: "恢复学习", exact: true })
    .click();
  await expect(
    page.locator(".vocab-row").filter({ hasText: "versatile" }),
  ).toHaveCount(0);
  const after = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === card.id,
  );
  expect(after.familiar).toBe(0);
  expect(after.practice_count).toBe(before.practice_count);
});
