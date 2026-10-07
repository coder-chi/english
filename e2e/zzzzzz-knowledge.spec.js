import { test, expect } from "@playwright/test";

test("统一词条跨词书复用，例句多词关联与独立回顾", async ({
  page,
  request,
}) => {
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  const state = async () => (await request.get("/api/state")).json();
  await post("books/import", {
    bookId: "ielts-topic-essentials",
    mode: "selected",
    entryIds: ["algorithm"],
  });
  const words = await post("words/list", { query: "allocation" });
  const allocation = words.items.find((w) => w.term === "allocation");
  expect(allocation.bookIds).toContain("bsl-business");
  expect(allocation.bookIds).toContain("nawl-academic");
  const books = await post("books/preview", { bookId: "bsl-business" });
  expect(books.entries.find((e) => e.term === "allocation").wordId).toBe(
    allocation.id,
  );
  const otherBook = await post("books/preview", { bookId: "nawl-academic" });
  expect(otherBook.entries.find((e) => e.term === "allocation").wordId).toBe(
    allocation.id,
  );
  const existing = await post("words/get", { wordId: allocation.id });
  expect(existing.books.length).toBeGreaterThanOrEqual(2);
  const algorithm = (
    await post("words/list", { query: "algorithm" })
  ).items.find((w) => w.term === "algorithm");
  const before = (await state()).cards.find((c) => c.term === "algorithm");
  const sentence = await post("sentences/save", {
    english: "The algorithm improves the allocation of resources.",
    chinese: "这个算法改善了资源分配。",
    wordIds: [allocation.id],
    linkedTerms: ["algorithm"],
  });
  expect(new Set(sentence.words.map((w) => w.id))).toEqual(
    new Set([allocation.id, algorithm.id]),
  );
  const repeated = await post("sentences/save", {
    english: sentence.english,
    chinese: sentence.chinese,
    wordIds: [allocation.id, algorithm.id],
  });
  expect(repeated.id).toBe(sentence.id);
  for (const id of [allocation.id, algorithm.id])
    expect(
      (await post("words/get", { wordId: id })).sentences.some(
        (s) => s.id === sentence.id,
      ),
    ).toBe(true);
  await post(
    "sentences/save",
    { english: "bad", chinese: "错误", wordIds: ["unknown"] },
    404,
  );
  await post("sentences/list", { scope: "unknown" }, 400);
  await page.goto("/#words");
  await page.getByLabel("搜索词条或例句").fill("allocation");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page
    .locator(".unified-word-list")
    .getByRole("button", { name: "allocation ↗", exact: true })
    .click();
  await expect(page.locator(".word-identity")).toContainText(
    "BSL 商务表达精选",
  );
  await expect(page.locator(".sentence-grid")).toContainText(sentence.english);
  await page
    .locator(".sentence-grid")
    .getByRole("button", { name: "algorithm ↗", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "algorithm", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "例句回顾", exact: true }).click();
  await page.getByLabel("搜索词条或例句").fill(sentence.english);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await expect(page.locator(".sentence-card")).toHaveCount(1);
  await page.getByRole("button", { name: "开始例句回顾", exact: true }).click();
  await expect(page.locator(".sentence-recall")).toContainText(
    sentence.chinese,
  );
  await expect(page.locator(".sentence-recall")).not.toContainText(
    sentence.english,
  );
  await page
    .getByRole("button", { name: "揭晓英文与关联词", exact: true })
    .click();
  await expect(page.locator(".sentence-recall")).toContainText(
    sentence.english,
  );
  await page.screenshot({
    path: ".artifacts/sentence-recall.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "本次能表达", exact: true }).click();
  await expect(page.locator(".sentence-card")).toContainText("已回顾 1 次");
  const after = (await state()).cards.find((c) => c.id === before.id);
  expect(after).toEqual(before);
  const recall = await post("sentences/start", { query: sentence.english });
  await post("sentences/grade", { token: recall.token, rating: "good" }, 400);
  await post("sentences/reveal", { token: recall.token });
  await post("sentences/grade", { token: recall.token, rating: "again" });
  await post("sentences/grade", { token: recall.token, rating: "again" });
  const final = (await post("sentences/list", { query: sentence.english }))
    .items[0];
  expect(final.reviews).toBe(2);
  expect(final.saved).toBe(1);
  // 修改卡片后索引同步，统一编号保持稳定；例句回顾记录不会随重建丢失。
  await post("notebook/save", {
    ...after,
    categoryId: after.category_id,
    partOfSpeech: after.part_of_speech,
    note: after.note,
  });
  expect(
    (await post("sentences/list", { query: sentence.english })).items[0]
      .reviews,
  ).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "统一词库", exact: true }).click();
  await expect(page.locator(".unified-word-list")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/unified-words-mobile.png",
    animations: "disabled",
  });
  await page.getByLabel("搜索词条或例句").fill("as soon as possible");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page
    .getByRole("button", { name: "as soon as possible ↗", exact: true })
    .click();
  await page.getByRole("button", { name: "从 日常实用短语 加入" }).click();
  await page.getByRole("button", { name: "编辑学习卡片", exact: true }).click();
  await expect(page.getByLabel("英文单词或短语")).toHaveValue(
    "as soon as possible",
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.locator(".sentence-editor summary").click();
  await page
    .locator('#sentence-form [name="english"]')
    .fill("Please reply as soon as possible.");
  await page.locator('#sentence-form [name="chinese"]').fill("请尽快回复。");
  await page.locator('#sentence-form [name="linkedTerms"]').fill("reply");
  await page.getByRole("button", { name: "保存关联例句" }).click();
  await expect(page.locator(".sentence-grid")).toContainText(
    "Please reply as soon as possible.",
  );
  await expect(page.locator(".sentence-grid")).toContainText("reply ↗");
});
