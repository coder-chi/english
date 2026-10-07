import { test, expect } from "@playwright/test";
import { ieltsWordbook, ieltsCoreEntries } from "../server/ielts-wordbook.js";

test("雅思词书按主题导入，双语例句保留且重复导入不重置进度", async ({
  page,
  request,
}) => {
  expect(ieltsCoreEntries).toHaveLength(120);
  expect(new Set(ieltsCoreEntries.map((e) => e.id)).size).toBe(120);
  expect(ieltsCoreEntries.filter((e) => e.kind === "word")).toHaveLength(80);
  expect(ieltsCoreEntries.filter((e) => e.kind === "phrase")).toHaveLength(40);
  const categories = [...new Set(ieltsCoreEntries.map((e) => e.category))];
  expect(categories).toHaveLength(10);
  for (const category of categories)
    expect(
      ieltsCoreEntries.filter((e) => e.category === category),
    ).toHaveLength(12);
  for (const entry of ieltsCoreEntries) {
    expect(entry.example.length).toBeGreaterThan(20);
    expect(entry.translation).toMatch(/[\u4e00-\u9fff]/);
    expect(entry.meaning).toMatch(/[\u4e00-\u9fff]/);
  }
  await page.goto("/#books");
  await page
    .getByRole("button", { name: "预览 雅思备考主题精选", exact: true })
    .click();
  await expect(page.locator(".book-entry")).toHaveCount(50);
  await expect(page.locator(".book-source-panel")).toContainText(
    "并非官方 IELTS",
  );
  await page.locator('[data-book-entry="carbon-footprint"]').check();
  await page.getByRole("button", { name: "导入所选", exact: true }).click();
  await expect(page.locator(".book-import-bar")).toContainText(
    `已导入 1 / ${ieltsWordbook.entries.length}`,
  );
  let state = await (await request.get("/api/state")).json();
  const card = state.cards.find((c) => c.term === "carbon footprint");
  const environment = state.categories.find(
    (c) => c.name === "雅思·环境与能源",
  );
  expect(card.category_id).toBe(environment.id);
  expect(card.personal).toBe(0);
  expect(card.note).toContain("环境与能源");
  expect(card.example).toContain("carbon footprint");
  await page.getByRole("button", { name: "练习本书已导入词条" }).click();
  await expect(page.locator('[name="source"]')).toHaveValue(ieltsWordbook.id);
  await page.locator('#practice-setup [name="mode"]').selectOption("free");
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-card>h2")).toHaveText("碳足迹");
  await expect(page.locator(".practice-card")).not.toContainText(
    "carbon footprint",
  );
  await page.getByRole("button", { name: "暂时想不起来，翻卡看看" }).click();
  await expect(page.locator(".answer-example")).toHaveText(card.example);
  await expect(page.locator(".practice-answer")).toContainText(
    card.translation,
  );
  await page.locator('[data-nb="grade"][data-rating="good"]').click();
  await expect(
    page.getByRole("heading", { name: "这一组，完成了。" }),
  ).toBeVisible();
  const learnedCard = (
    await (await request.get("/api/state")).json()
  ).cards.find((c) => c.id === card.id);
  const imported = await request.post("/api/books/import", {
    data: { bookId: ieltsWordbook.id, mode: "all", section: "主题精练" },
  });
  expect(imported.ok()).toBe(true);
  expect((await imported.json()).imported).toBe(120);
  const repeated = await request.post("/api/books/import", {
    data: { bookId: ieltsWordbook.id, mode: "all", section: "主题精练" },
  });
  expect((await repeated.json()).skipped).toBe(120);
  state = await (await request.get("/api/state")).json();
  const saved = state.cards.find((c) => c.id === card.id);
  expect(saved.practice_count).toBe(1);
  expect(saved.due_at).toBe(learnedCard.due_at);
  expect(saved.learned_at).toBe(learnedCard.learned_at);
  expect(
    state.categories.filter((c) => c.name.startsWith("雅思·")),
  ).toHaveLength(10);
  const session = await request.post("/api/practice/start", {
    data: {
      source: ieltsWordbook.id,
      mode: "free",
      categoryId: environment.id,
      direction: "mixed",
      limit: 100,
    },
  });
  expect(session.ok()).toBe(true);
  expect((await session.json()).total).toBe(12);
});
