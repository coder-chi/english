import { test as base, expect } from "@playwright/test";
import { fork } from "node:child_process";
import { once } from "node:events";

// 每个用例使用独立内存库，不污染其他词书测试或用户数据。
const test = base.extend({
  isolatedBookServer: [
    async ({ playwright }, use) => {
      const child = fork("server/index.js", [], {
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: "3107",
          DB_PATH: ":memory:",
          DISABLE_AUTOMATION: "true",
          OPENAI_API_KEY: "",
        },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      const api = await playwright.request.newContext({
        baseURL: "http://127.0.0.1:3107",
      });
      try {
        await expect
          .poll(
            async () => {
              try {
                return (await api.get("/api/state")).status();
              } catch {
                return 0;
              }
            },
            { timeout: 8000 },
          )
          .toBe(200);
        await use();
      } finally {
        await api.dispose();
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    },
    { auto: true },
  ],
});
test.use({ baseURL: "http://127.0.0.1:3107" });

const postFor =
  (request) =>
  async (path, data, status = 200) => {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  };
const stateFor = async (request) => (await request.get("/api/state")).json();

test("批量标熟悉直接导入、幂等校验、跨书复用与归档保护", async ({
  request,
}) => {
  const post = postFor(request);
  const bookId = "bsl-business";
  const before = await stateFor(request);
  const wrongSense = await post("notebook/save", {
    term: "allocation",
    meaning: "另一种释义，不能合并",
    kind: "word",
  });
  const shared = await post("notebook/save", {
    term: "allocation",
    meaning: "分配；配置",
    kind: "word",
    note: "保留个人笔记",
  });
  await post("books/import", {
    bookId: "nawl-academic",
    entryIds: ["allocation"],
  });
  await post(
    "books/familiar",
    { bookId, entryIds: ["allocation", "bad-id"], value: true },
    400,
  );
  expect((await post("books/preview", { bookId })).imported).toBe(0);
  for (const entryIds of [[], Array(201).fill("allocation")])
    await post("books/familiar", { bookId, entryIds, value: true }, 400);
  await post(
    "books/familiar",
    { bookId, entryIds: ["allocation"], value: "true" },
    400,
  );
  const result = await post("books/familiar", {
    bookId,
    entryIds: ["allocation", "allocation", "goods"],
    value: true,
  });
  expect(result).toMatchObject({
    selected: 2,
    changed: 2,
    added: 1,
    reused: 1,
  });
  const marked = await stateFor(request);
  const card = marked.cards.find((c) => c.id === shared.id);
  expect(card).toMatchObject({
    familiar: 1,
    learned_at: null,
    note: "保留个人笔记",
  });
  expect(marked.cards.find((c) => c.id === wrongSense.id).familiar).toBe(0);
  expect(marked.learningProgress.learned).toBe(before.learningProgress.learned);
  expect(marked.dueCards).toEqual(before.dueCards);
  for (const id of [bookId, "nawl-academic"])
    expect(
      (await post("books/preview", { bookId: id })).entries.find(
        (e) => e.id === "allocation",
      ).familiar,
    ).toBe(true);
  expect(
    (
      await post("books/familiar", {
        bookId,
        entryIds: ["allocation", "goods"],
        value: true,
      })
    ).changed,
  ).toBe(0);
  expect((await stateFor(request)).cards).toEqual(marked.cards);
  await post("notebook/flag", {
    id: shared.id,
    field: "archived",
    value: true,
  });
  const archived = (await stateFor(request)).archivedCards.find(
    (c) => c.id === shared.id,
  );
  expect(
    (
      await post("books/familiar", {
        bookId,
        entryIds: ["allocation"],
        value: false,
      })
    ).archived,
  ).toBe(1);
  expect(
    (await stateFor(request)).archivedCards.find((c) => c.id === shared.id),
  ).toEqual(archived);
  await post("books/familiar", { bookId, entryIds: ["goods"], value: false });
  const restored = (await stateFor(request)).cards.find(
    (c) => c.term === "goods",
  );
  expect(restored).toMatchObject({
    familiar: 0,
    learned_at: null,
    fsrs_card: null,
  });
  const preview = await post("books/preview", { bookId });
  const untouched = preview.entries.find((e) => !e.imported);
  await post("books/familiar", {
    bookId,
    entryIds: [untouched.id],
    value: false,
  });
  expect((await post("books/preview", { bookId })).imported).toBe(
    preview.imported,
  );
  const learn = await post("practice/start", { source: bookId, mode: "learn" });
  expect(learn.total).toBe(1);
  expect(learn.current.id).toBe(restored.id);
});

test("批量标记让旧会话跳过熟词，恢复已学词到期且旧评分不能覆盖排程", async ({
  request,
}) => {
  const post = postFor(request);
  const bookId = "ngsl-everyday";
  await post("books/import", { bookId, entryIds: ["know"] });
  const start = () => post("practice/start", { source: bookId, mode: "learn" });
  const first = await start();
  await post("practice/check", { id: first.id, position: 0, reveal: true });
  await post("books/familiar", { bookId, entryIds: ["know"], value: true });
  const skipped = await post("practice/grade", {
    id: first.id,
    position: 0,
    rating: "good",
  });
  expect(skipped.current).toBeNull();
  expect(skipped.results[0]).toMatchObject({
    rating: "familiar",
    scheduled: false,
  });
  await post("books/familiar", { bookId, entryIds: ["know"], value: false });
  const stale = await start();
  await post("practice/check", { id: stale.id, position: 0, reveal: true });
  for (const value of [true, false])
    await post("books/familiar", { bookId, entryIds: ["know"], value });
  const protectedCard = (await stateFor(request)).cards.find(
    (c) => c.id === stale.current.id,
  );
  const staleGrade = await post("practice/grade", {
    id: stale.id,
    position: 0,
    rating: "easy",
  });
  expect(staleGrade.results[0].scheduled).toBe(false);
  const afterStale = (await stateFor(request)).cards.find(
    (c) => c.id === stale.current.id,
  );
  expect(afterStale.due_at).toBe(protectedCard.due_at);
  expect(afterStale.learned_at).toBeNull();
  const fresh = await start();
  await post("practice/check", { id: fresh.id, position: 0, reveal: true });
  await post("practice/grade", { id: fresh.id, position: 0, rating: "good" });
  const learned = (await stateFor(request)).cards.find(
    (c) => c.id === fresh.current.id,
  );
  expect(learned.learned_at).not.toBeNull();
  for (const value of [true, false])
    await post("books/familiar", { bookId, entryIds: ["know"], value });
  const restored = (await stateFor(request)).cards.find(
    (c) => c.id === fresh.current.id,
  );
  expect(restored.learned_at).toBe(learned.learned_at);
  expect(restored.due_at).toBeLessThanOrEqual(Date.now());
  expect(restored.fsrs_card).toBeNull();
  expect(
    (await post("practice/start", { source: bookId, mode: "due" })).current.id,
  ).toBe(restored.id);
});

test("快速扫读勾选混合词条、全选清空、批量恢复并同步进度", async ({
  page,
  request,
}) => {
  const post = postFor(request);
  const bookId = "ngsl-everyday";
  await post("books/import", { bookId, entryIds: ["know", "think"] });
  const initial = await post("books/preview", { bookId });
  await post("notebook/flag", {
    id: initial.entries.find((e) => e.id === "think").cardId,
    field: "archived",
    value: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#books");
  await page
    .getByRole("button", { name: "预览 NGSL 日常核心精选", exact: true })
    .click();
  await page.getByRole("button", { name: "快速标熟悉", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(40);
  await expect(page.locator('[data-familiar-entry="think"]')).toBeDisabled();
  await page.getByRole("button", { name: "全选本页", exact: true }).click();
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 39 个",
  );
  await page.getByRole("button", { name: "清空勾选", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "标为熟悉", exact: true }),
  ).toBeDisabled();
  const fresh = initial.entries.find((e) => !e.imported);
  for (const id of ["know", fresh.id])
    await page.locator(`[data-familiar-entry="${id}"]`).check();
  await page.getByRole("button", { name: "标为熟悉", exact: true }).click();
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 0 个",
  );
  await expect(page.locator(".progress-metric.familiar strong")).toHaveText(
    "2个",
  );
  await expect(page.locator(".progress-metric.learned strong")).toHaveText(
    "0个",
  );
  await page.getByLabel("词条状态").selectOption("familiar");
  await page.getByRole("button", { name: "筛选词条", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(2);
  await page.getByRole("button", { name: "全选本页", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "标为熟悉", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "恢复学习", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(0);
  await expect(page.locator(".progress-metric.familiar strong")).toHaveText(
    "0个",
  );
  const book = await post("books/preview", { bookId });
  expect(book.entries.find((e) => e.id === "know").learningStatus).toBe(
    "unlearned",
  );
  expect(book.entries.find((e) => e.id === fresh.id).learningStatus).toBe(
    "unlearned",
  );
  expect(errors).toEqual([]);
});

test("指定页跳转、末页全选与滚动中的固定操作栏", async ({ page, request }) => {
  const post = postFor(request);
  const book = (await stateFor(request)).wordbooks.find((b) => b.total > 1000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#books");
  await page
    .getByRole("button", { name: `预览 ${book.title}`, exact: true })
    .click();
  // 普通预览也支持从底部跳到指定页，词条必须和后端分页结果一致。
  const bottomJump = page.locator(".book-page-jump").last();
  await bottomJump.getByRole("spinbutton", { name: "跳转页码" }).fill("10");
  await bottomJump.getByRole("button", { name: "跳转", exact: true }).click();
  const tenth = await post("books/preview", { bookId: book.id, page: 10 });
  await expect(page.locator("[data-book-entry]").first()).toHaveAttribute(
    "data-book-entry",
    tenth.entries[0].id,
  );
  await page.getByRole("button", { name: "快速标熟悉", exact: true }).click();
  const bar = page.locator(".book-scan-bar");
  const jump = bar.getByRole("spinbutton", { name: "跳转页码" });
  await expect(jump).toHaveValue("10");
  await page.locator("[data-familiar-entry]").first().check();
  await jump.fill("12");
  await jump.press("Enter");
  await expect(jump).toHaveValue("12");
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 0 个",
  );
  const twelfth = await post("books/preview", { bookId: book.id, page: 12 });
  await expect(page.locator("[data-familiar-entry]").first()).toHaveAttribute(
    "data-familiar-entry",
    twelfth.entries[0].id,
  );
  await page.locator(".book-scan-row").nth(30).scrollIntoViewIfNeeded();
  await bar.getByRole("button", { name: "全选本页", exact: true }).click();
  await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(50);
  await page.locator("[data-familiar-entry]").nth(30).uncheck();
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 49 个",
  );
  await bar.getByRole("button", { name: "全选本页", exact: true }).click();
  await page.screenshot({ path: ".artifacts/book-page-controls-desktop.png", animations: "disabled" });
  const pages = Math.ceil(book.total / 50);
  await jump.fill(String(pages));
  await bar.getByRole("button", { name: "跳转", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(
    book.total % 50 || 50,
  );
  await bar.getByRole("button", { name: "全选本页", exact: true }).click();
  await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(
    book.total % 50 || 50,
  );
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }).first(),
  ).toBeDisabled();
  // 浏览器校验阻止非法页码，不改变当前页或勾选。
  for (const invalid of ["0", String(pages + 1), "1.5"]) {
    await jump.fill(invalid);
    await jump.press("Enter");
    expect(await jump.evaluate((input) => input.validity.valid)).toBe(false);
    await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(
      book.total % 50 || 50,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await jump.fill("2");
  await jump.press("Enter");
  await expect(jump).toHaveValue("2");
  await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(0);
  await page.locator(".book-scan-row").nth(30).scrollIntoViewIfNeeded();
  await bar.getByRole("button", { name: "全选本页", exact: true }).click();
  await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(50);
  const bounds = await bar.boundingBox();
  const header = await page.locator(".sidebar").boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(bounds.y + bounds.height).toBeLessThan(844);
  await page.screenshot({ path: ".artifacts/book-page-controls-mobile.png", animations: "disabled" });
  await bar.getByRole("button", { name: "清空勾选", exact: true }).click();
  await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("搜索英文或中文").fill(tenth.entries[0].term);
  await page.getByRole("button", { name: "筛选词条", exact: true }).click();
  await expect(jump).toHaveValue("1");
  const filtered = await post("books/preview", {
    bookId: book.id,
    query: tenth.entries[0].term,
  });
  await expect(jump).toHaveAttribute("max", String(filtered.pages));
  expect(errors).toEqual([]);
});

test("大词书按页扫读，翻页筛选清空选择，手机无横向溢出", async ({
  page,
  request,
}) => {
  const state = await stateFor(request);
  const book = state.wordbooks.find((b) => b.total > 1000);
  await page.goto("/#books");
  await page
    .getByRole("button", { name: `预览 ${book.title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "快速标熟悉", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(50);
  await page.getByRole("button", { name: "全选本页", exact: true }).click();
  await page
    .getByRole("button", { name: "下一页", exact: true })
    .first()
    .click();
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 0 个",
  );
  await expect(page.locator("[data-familiar-entry]:checked")).toHaveCount(0);
  await page.getByRole("button", { name: "全选本页", exact: true }).click();
  await page.getByLabel("每页词数").selectOption("100");
  await page.getByRole("button", { name: "筛选词条", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(100);
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 0 个",
  );
  await page.locator("[data-familiar-entry]").first().check();
  await page.locator("[data-familiar-entry]").nth(2).check();
  await page.locator(".book-scan-row").nth(10).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".artifacts/book-scan-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".book-scan-row").nth(15).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bar = await page.locator(".book-scan-bar").boundingBox();
  const header = await page.locator(".sidebar").boundingBox();
  expect(bar.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(bar.y + bar.height).toBeLessThan(844);
  await page.screenshot({ path: ".artifacts/book-scan-mobile.png" });
  await page.getByRole("button", { name: "标为熟悉", exact: true }).click();
  await expect(page.locator("#familiar-selection-count")).toHaveText(
    "已选 0 个",
  );
  await expect(page.locator(".book-scan-row em.familiar")).toHaveCount(2);
  await page.getByLabel("每页词数").selectOption("200");
  await page.getByRole("button", { name: "筛选词条", exact: true }).click();
  await expect(page.locator(".book-scan-row")).toHaveCount(200);
  await page.reload();
  await page
    .getByRole("button", { name: `预览 ${book.title}`, exact: true })
    .click();
  await expect(page.locator(".progress-metric.familiar strong")).toHaveText(
    "2个",
  );
});
