import { test, expect } from "@playwright/test";

test("词书可预览、选择导入并分别练习词书与个人收藏", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#books");
  await expect(page.locator(".wordbook-card")).toHaveCount(5);
  await page.screenshot({
    path: ".artifacts/wordbooks-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "预览 NGSL 日常核心精选", exact: true })
    .click();
  await expect(page.locator(".book-entry")).toHaveCount(40);
  await expect(page.locator(".book-source-panel")).toContainText("非官方译本");
  await expect(page.getByRole("link", { name: "官方来源" })).toHaveAttribute(
    "href",
    "https://www.newgeneralservicelist.com/new-general-service-list",
  );
  await expect(
    page.getByRole("button", { name: "导入所选", exact: true }),
  ).toBeDisabled();
  await page.locator('[data-book-entry="know"]').check();
  await page.locator('[data-book-entry="think"]').check();
  await page.getByRole("button", { name: "导入所选", exact: true }).click();
  await expect(page.locator(".book-import-bar")).toContainText("已导入 2 / 40");
  await expect(page.locator('[data-book-entry="know"]')).toBeDisabled();
  await page.getByRole("button", { name: "练习本书已导入词条" }).click();
  await expect(page.locator('[name="source"]')).toHaveValue("ngsl-everyday");
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-progress")).toContainText("1 / 2");
  const sessionId = await page.evaluate(() =>
    sessionStorage.getItem("english.practice"),
  );
  const session = await (
    await request.post("/api/practice/get", { data: { id: sessionId } })
  ).json();
  const state = await (await request.get("/api/state")).json();
  expect(
    state.cards.find((c) => c.id === session.current.id).bookIds,
  ).toContain("ngsl-everyday");
  await page.getByRole("button", { name: "生词本", exact: true }).click();
  await page.getByLabel("词条来源").selectOption("ngsl-everyday");
  await expect(page.locator(".vocab-row")).toHaveCount(2);
  await page.getByRole("button", { name: "know", exact: true }).click();
  await page
    .getByRole("button", { name: "加入个人生词本", exact: true })
    .click();
  await expect(page.locator("#notebook-dialog")).not.toBeVisible();
  await page.getByLabel("词条来源").selectOption("personal");
  await expect(
    page.getByRole("button", { name: "know", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "think", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "词书", exact: true }).click();
  await page.getByRole("button", { name: "返回词书" }).click();
  await page.getByRole("button", { name: "练我的生词本" }).click();
  await expect(page.locator('[name="source"]')).toHaveValue("personal");
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-progress")).toBeVisible();
  const personalId = await page.evaluate(() =>
    sessionStorage.getItem("english.practice"),
  );
  const personal = await (
    await request.post("/api/practice/get", { data: { id: personalId } })
  ).json();
  const after = await (await request.get("/api/state")).json();
  expect(after.cards.find((c) => c.id === personal.current.id).personal).toBe(
    1,
  );
  await page.getByRole("button", { name: "词书", exact: true }).click();
  await page
    .getByRole("button", { name: "预览 NGSL 日常核心精选", exact: true })
    .click();
  await page
    .getByRole("button", { name: "导入下一批 10 个", exact: true })
    .click();
  await expect(page.locator(".book-import-bar")).toContainText(
    "已导入 12 / 40",
  );
  await page
    .getByRole("button", { name: "导入全部未导入词条", exact: true })
    .click();
  await expect(page.locator(".book-import-bar")).toContainText(
    "已导入 40 / 40",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "预览 NGSL 日常核心精选", exact: true })
    .click();
  await expect(page.locator(".book-import-bar")).toContainText(
    "已导入 40 / 40",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/wordbook-detail-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "返回词书" }).click();
  await page.screenshot({
    path: ".artifacts/wordbooks-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("整本导入幂等、跨书复用、归档与个人编辑受到保护", async ({ request }) => {
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  const existing = await post("notebook/save", {
    term: "allocation",
    meaning: "分配；配置",
    kind: "word",
    note: "保留我的笔记",
  });
  await post("books/import", {
    bookId: "bsl-business",
    mode: "selected",
    entryIds: ["allocation"],
  });
  const firstLearning = await post("practice/start", {
    source: "bsl-business",
    mode: "learn",
  });
  await post("practice/check", {
    id: firstLearning.id,
    position: 0,
    reveal: true,
  });
  await post("practice/grade", {
    id: firstLearning.id,
    position: 0,
    rating: "good",
  });
  const before = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === existing.id,
  );
  await post("books/import", {
    bookId: "bsl-business",
    mode: "selected",
    entryIds: ["allocation"],
  });
  const second = await post("books/import", {
    bookId: "nawl-academic",
    mode: "selected",
    entryIds: ["allocation"],
  });
  expect(second.reused).toBe(1);
  let current = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === existing.id,
  );
  expect(current.bookIds.sort()).toEqual(["bsl-business", "nawl-academic"]);
  expect(current.personal).toBe(1);
  expect(current.note).toBe(before.note);
  expect(current.due_at).toBe(before.due_at);
  await post("notebook/flag", {
    id: current.id,
    field: "archived",
    value: true,
  });
  const repeated = await post("books/import", {
    bookId: "bsl-business",
    mode: "selected",
    entryIds: ["allocation"],
  });
  expect(repeated.skipped).toBe(1);
  await post(
    "books/import",
    {
      bookId: "nawl-academic",
      mode: "selected",
      entryIds: ["absorb", "bad-id"],
    },
    400,
  );
  const book = await post("books/preview", { bookId: "nawl-academic" });
  expect(book.entries.find((e) => e.id === "absorb").imported).toBe(false);
  expect(book.entries.find((e) => e.id === "allocation").archived).toBe(true);
  const all = await post("books/import", {
    bookId: "nawl-academic",
    mode: "all",
  });
  expect(all.imported).toBe(40);
  const again = await post("books/import", {
    bookId: "nawl-academic",
    mode: "all",
  });
  expect(again.added).toBe(0);
  expect(again.reused).toBe(0);
  expect(again.skipped).toBe(40);
  const saved = (
    await (await request.get("/api/state")).json()
  ).archivedCards.find((c) => c.id === existing.id);
  expect(saved.due_at).toBe(before.due_at);
  const practice = await post("practice/start", {
    source: "nawl-academic",
    mode: "free",
    limit: 100,
  });
  expect(practice.total).toBe(39);
  await post("practice/start", { source: "unknown-book" }, 400);
  await post("books/preview", { bookId: "unknown-book" }, 404);
});
