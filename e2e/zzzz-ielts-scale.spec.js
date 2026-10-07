import { test, expect } from "@playwright/test";
import { ieltsWordbook, ieltsCoreEntries } from "../server/ielts-wordbook.js";

test("数千词的分层搜索、整库导入、分页和熟悉进度保护", async ({
  page,
  request,
}) => {
  const bookId = ieltsWordbook.id;
  const entries = ieltsWordbook.entries;
  expect(entries).toHaveLength(6512);
  expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  expect(new Set(entries.map((e) => e.term.toLowerCase())).size).toBe(
    entries.length,
  );
  for (const entry of entries) {
    expect(entry.meaning).toMatch(/[\u4e00-\u9fff]/);
    expect(entry.meaning.length).toBeLessThanOrEqual(800);
  }
  expect(
    entries.slice(0, 120).map(({ section, provenance, ...entry }) => entry),
  ).toEqual(ieltsCoreEntries);
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  await post("books/import", { bookId, mode: "all", section: "主题精练" });
  const first = await post("books/preview", { bookId });
  expect(first.total).toBe(entries.length);
  expect(first.entries).toHaveLength(50);
  expect(first.sections.reduce((n, s) => n + s.total, 0)).toBe(entries.length);
  const last = await post("books/preview", { bookId, page: 999 });
  expect(last.page).toBe(131);
  expect(last.entries).toHaveLength(12);
  await post("books/preview", { bookId, page: -1 }, 400);
  await post("books/preview", { bookId, pageSize: 10000 }, 400);
  await post("books/import", { bookId, mode: "all", section: "不存在" }, 400);
  const search = await post("books/preview", {
    bookId,
    query: "CARBON FOOTPRINT",
  });
  expect(search.filtered).toBe(1);
  const cardId = search.entries[0].cardId;
  await post("notebook/flag", { id: cardId, field: "familiar", value: true });
  const before = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === cardId,
  );

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#books");
  await page
    .getByRole("button", { name: "预览 雅思备考主题精选", exact: true })
    .click();
  await expect(page.locator(".book-entry")).toHaveCount(50);
  await page.getByLabel("学习分层").selectOption("学术阅读");
  await page.getByRole("button", { name: "筛选词条" }).click();
  await expect(page.locator(".collection-pagination").first()).toContainText(
    "共 942 条",
  );
  const firstTerm = await page
    .locator(".book-entry strong")
    .first()
    .textContent();
  await page
    .getByRole("button", { name: "下一页", exact: true })
    .first()
    .click();
  await expect(page.locator(".collection-pagination").first()).toContainText(
    "第 2 /",
  );
  expect(
    await page.locator(".book-entry strong").first().textContent(),
  ).not.toBe(firstTerm);
  await page.getByRole("button", { name: "全选本页未导入" }).click();
  await expect(page.locator("#book-selection-count")).toHaveText("已选 50 个");
  await page.getByLabel("搜索英文或中文").fill("不存在的释义测试");
  await page.getByRole("button", { name: "筛选词条" }).click();
  await expect(page.locator(".book-entry")).toHaveCount(0);
  await expect(page.locator("#book-selection-count")).toHaveText("已选 0 个");
  await expect(
    page.getByRole("button", { name: "导入下一批 10 个" }),
  ).toBeDisabled();
  await page.getByLabel("搜索英文或中文").fill("");
  await page.getByRole("button", { name: "筛选词条" }).click();
  await page.getByRole("button", { name: "导入下一批 10 个" }).click();
  await expect(page.locator(".book-import-bar")).toContainText(
    "已导入 130 / 6512",
  );
  const academic = await post("books/preview", {
    bookId,
    section: "学术阅读",
    status: "imported",
  });
  expect(academic.filtered).toBe(10);
  await page.screenshot({
    path: ".artifacts/ielts-expanded-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/ielts-expanded-mobile.png",
    animations: "disabled",
  });

  const started = Date.now();
  const all = await post("books/import", { bookId, mode: "all" });
  expect(all.imported).toBe(entries.length);
  const repeated = await post("books/import", { bookId, mode: "all" });
  expect(repeated.added).toBe(0);
  expect(repeated.skipped).toBe(entries.length);
  const state = await (await request.get("/api/state")).json();
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(10000);
  console.log(
    `全库导入 + 重复导入 + state: ${elapsed}ms；${entries.length} 条`,
  );
  const saved = state.cards.find((c) => c.id === cardId);
  for (const field of [
    "due_at",
    "familiar",
    "practice_count",
    "repetitions",
    "note",
    "category_id",
  ])
    expect(saved[field]).toEqual(before[field]);
  expect(state.dueCards.some((c) => c.id === cardId)).toBe(false);
  const session = await post("practice/start", {
    source: bookId,
    mode: "learn",
    categoryId: saved.category_id,
    limit: 100,
  });
  expect(session.total).toBe(11);

  await page.goto("/#notebook");
  // 全库通过 API 在页面外导入，刷新后读取最新卡片状态。
  await page.reload();
  await page.getByLabel("词条来源").selectOption(bookId);
  await expect(page.locator(".vocab-row")).toHaveCount(50);
  await expect(page.locator(".collection-pagination")).toContainText(
    "共 6512 条",
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".collection-pagination")).toContainText("第 2 /");
  await page.getByLabel("搜索生词本").fill("carbon footprint");
  await expect(page.locator(".vocab-row")).toHaveCount(1);
  await expect(page.locator(".vocab-state")).toContainText("已熟悉");
  await expect(page.locator(".collection-pagination")).toContainText(
    "第 1 / 1",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator(".vocab-row")).toHaveCount(50);
  expect(errors).toEqual([]);
});
