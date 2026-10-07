import { test, expect } from "@playwright/test";

async function post(request, path, data) {
  const response = await request.post(`/api/${path}`, { data });
  expect(response.status()).toBe(200);
  return response.json();
}
const getState = async (request) => (await request.get("/api/state")).json();
const flag = (request, id, field, value) =>
  post(request, "notebook/flag", { id, field, value });

test("学习积累区分首次评分与熟悉，点击清除旧条件并跟随来源", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const baseline = (await getState(request)).learningProgress;
  await post(request, "categories/save", { name: "进度验证" });
  const categoryId = (await getState(request)).categories.find(
    (c) => c.name === "进度验证",
  ).id;
  const cards = [];
  try {
    for (const [term, meaning] of [
      ["progress-sprout", "正在学的词"],
      ["progress-bloom", "学过后熟悉的词"],
    ]) {
      cards.push(
        await post(request, "notebook/save", {
          term,
          meaning,
          kind: "word",
          categoryId,
        }),
      );
    }
    let session = await post(request, "practice/start", {
      mode: "learn",
      categoryId,
      limit: 5,
    });
    await post(request, "practice/check", {
      id: session.id,
      position: 0,
      reveal: true,
    });
    // 翻卡不增加学过计数。
    expect((await getState(request)).learningProgress.learned).toBe(
      baseline.learned,
    );
    while (session.current) {
      await post(request, "practice/check", {
        id: session.id,
        position: session.position,
        reveal: true,
      });
      session = await post(request, "practice/grade", {
        id: session.id,
        position: session.position,
        rating: "good",
      });
    }
    await flag(request, cards[1].id, "familiar", true);
    cards.push(
      await post(request, "notebook/save", {
        term: "progress-familiar",
        meaning: "无需学习的熟悉词",
        kind: "word",
        categoryId,
      }),
    );
    await flag(request, cards[2].id, "familiar", true);
    cards.push(
      await post(request, "notebook/save", {
        term: "progress-sprout",
        meaning: "同词不同义的新词",
        kind: "word",
        categoryId,
      }),
    );
    const state = await getState(request);
    for (const [key, increment] of Object.entries({
      total: 4,
      learned: 2,
      learning: 1,
      familiar: 2,
      unlearned: 1,
      covered: 3,
    }))
      expect(state.learningProgress[key]).toBe(baseline[key] + increment);
    expect(state.learningProgress.total).toBe(
      state.learningProgress.learning +
        state.learningProgress.familiar +
        state.learningProgress.unlearned,
    );
    await page.goto("/");
    await expect(page.locator(".progress-metric.learned strong")).toHaveText(
      `${baseline.learned + 2}个`,
    );
    await page.locator('.progress-metric[data-status="learned"]').click();
    await expect(
      page.locator('[data-nb="scope"][data-value="learned"]'),
    ).toHaveClass("selected");
    await expect(
      page.locator(".vocab-row").filter({ hasText: "学过后熟悉的词" }),
    ).toHaveCount(1);
    await expect(
      page.locator(".vocab-row").filter({ hasText: "无需学习的熟悉词" }),
    ).toHaveCount(0);

    // 从旧分类、类型、搜索条件点击统计，列表必须和数字使用同一范围。
    await page
      .locator(".category-strip button")
      .filter({ hasText: "进度验证" })
      .click();
    await page.locator("#vocab-kind").selectOption("phrase");
    await page.getByLabel("搜索生词本").fill("不存在的查询");
    await page.locator('.progress-metric[data-status="familiar"]').click();
    await expect(page.getByLabel("搜索生词本")).toHaveValue("");
    await expect(page.locator("#vocab-kind")).toHaveValue("all");
    await expect(
      page.locator('.category-strip [data-value="all"]'),
    ).toHaveClass("selected");
    await expect(
      page.locator(".vocab-row").filter({ hasText: "无需学习的熟悉词" }),
    ).toHaveCount(1);
    await expect(
      page.locator(".vocab-row").filter({ hasText: "学过后熟悉的词" }),
    ).toHaveCount(1);

    await page.getByLabel("词条来源").selectOption("personal");
    const personal = state.cards.filter((c) => c.personal);
    await expect(page.locator(".progress-metric.learned strong")).toHaveText(
      `${personal.filter((c) => c.learned_at != null).length}个`,
    );
    await page
      .locator(".learning-progress-panel")
      .screenshot({ path: ".artifacts/learning-progress-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".learning-progress-panel")
      .screenshot({ path: ".artifacts/learning-progress-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await flag(request, cards[1].id, "familiar", false);
    const restored = (await getState(request)).learningProgress;
    expect(restored.learned).toBe(baseline.learned + 2);
    expect(restored.learning).toBe(baseline.learning + 2);
    expect(restored.covered).toBe(baseline.covered + 3);
    await flag(request, cards[0].id, "archived", true);
    const archived = (await getState(request)).learningProgress;
    expect(archived.learned).toBe(baseline.learned + 1);
    expect(archived.total).toBe(baseline.total + 3);
    expect(errors).toEqual([]);
  } finally {
    for (const card of cards) await flag(request, card.id, "archived", true);
  }
});

test("词书百分比使用全书分母，跨书共享记录且状态列表与数字一致", async ({
  page,
  request,
}) => {
  for (const bookId of ["bsl-business", "nawl-academic"])
    await post(request, "books/import", {
      bookId,
      mode: "selected",
      entryIds: ["allocation"],
    });
  const before = await getState(request);
  const allocation = [...before.cards, ...before.archivedCards].find(
    (c) => c.term === "allocation" && c.meaning === "分配；配置",
  );
  expect(allocation.bookIds).toEqual(
    expect.arrayContaining(["bsl-business", "nawl-academic"]),
  );
  try {
    await flag(request, allocation.id, "archived", false);
    await flag(request, allocation.id, "familiar", false);
    const baseline = await getState(request);
    await flag(request, allocation.id, "familiar", true);
    const state = await getState(request);
    expect(state.learningProgress.familiar).toBe(
      baseline.learningProgress.familiar + 1,
    );
    expect(state.learningProgress.total).toBe(baseline.learningProgress.total);
    for (const id of ["bsl-business", "nawl-academic"]) {
      const b = state.wordbooks.find((book) => book.id === id);
      const old = baseline.wordbooks.find((book) => book.id === id);
      expect(b.progress.familiar).toBe(old.progress.familiar + 1);
      expect(b.progress.total).toBe(b.total);
      expect(b.progress.percent).toBeCloseTo(
        (b.progress.covered / b.total) * 100,
      );
      expect(
        b.progress.learning +
          b.progress.familiar +
          b.progress.unlearned +
          b.progress.archived,
      ).toBe(b.total);
      for (const status of [
        "learned",
        "learning",
        "familiar",
        "unlearned",
        "covered",
        "archived",
      ]) {
        const filtered = await post(request, "books/preview", {
          bookId: id,
          status,
        });
        expect(filtered.filtered).toBe(b.progress[status]);
        expect(filtered.progress).toEqual(b.progress);
      }
    }
    await page.goto("/#books");
    const cover = page.locator('.book-learning-link[data-book="bsl-business"]');
    const bsl = state.wordbooks.find((book) => book.id === "bsl-business");
    await expect(cover.locator("progress")).toHaveAttribute(
      "value",
      String(bsl.progress.covered),
    );
    await cover.click();
    await expect(page.locator('#book-filter-form [name="status"]')).toHaveValue(
      "covered",
    );
    await expect(page.locator(".book-entry")).toHaveCount(bsl.progress.covered);
    await page.locator('.progress-metric[data-status="familiar"]').click();
    await expect(page.locator('#book-filter-form [name="status"]')).toHaveValue(
      "familiar",
    );
    await expect(page.locator(".book-entry")).toHaveCount(
      bsl.progress.familiar,
    );
    await expect(
      page.locator(".book-entry").filter({ hasText: "allocation" }),
    ).toContainText("已熟悉");
    await page
      .locator('#book-filter-form [name="query"]')
      .fill("no-matching-progress");
    await page.getByRole("button", { name: "筛选词条", exact: true }).click();
    await expect(page.locator(".book-entry")).toHaveCount(0);
    await page.locator('.progress-metric[data-status="unlearned"]').click();
    await expect(page.locator('#book-filter-form [name="query"]')).toHaveValue(
      "",
    );
    await expect(page.locator(".book-entry")).toHaveCount(
      bsl.progress.unlearned,
    );
    // 导入筛选结果只改变导入量，不能增加学习进度。
    const imported = await post(request, "books/import", {
      bookId: "bsl-business",
      mode: "next",
      status: "unlearned",
      limit: 1,
    });
    expect(imported.added + imported.reused).toBeLessThanOrEqual(1);
    expect(
      (await getState(request)).wordbooks.find((b) => b.id === "bsl-business")
        .progress,
    ).toEqual(bsl.progress);

    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".learning-progress-panel")
      .screenshot({ path: ".artifacts/book-learning-progress-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // 在生词本改变状态后返回已打开的词书，统计与筛选结果都应刷新。
    await page.getByRole("button", { name: "管理已导入词条" }).click();
    await page
      .locator(".vocab-row")
      .filter({ hasText: "allocation" })
      .getByRole("button", { name: "恢复学习", exact: true })
      .click();
    await expect(
      page
        .locator(".vocab-row")
        .filter({ hasText: "allocation" })
        .getByRole("button", { name: "标记熟悉", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "词书", exact: true }).click();
    await expect(page.locator(".progress-metric.familiar strong")).toHaveText(
      `${bsl.progress.familiar - 1}个`,
    );
    await expect(page.locator(".book-entry")).toHaveCount(
      bsl.progress.unlearned + (allocation.learned_at == null ? 1 : 0),
    );
    await flag(request, allocation.id, "familiar", true);
    await flag(request, allocation.id, "archived", true);
    const archived = (await getState(request)).wordbooks.find(
      (b) => b.id === "bsl-business",
    );
    expect(archived.progress.covered).toBe(bsl.progress.covered - 1);
    expect(archived.progress.total).toBe(bsl.total);
    await flag(request, allocation.id, "archived", false);
    expect(
      (await getState(request)).wordbooks.find((b) => b.id === "bsl-business")
        .progress,
    ).toEqual(bsl.progress);
  } finally {
    await flag(
      request,
      allocation.id,
      "familiar",
      Boolean(allocation.familiar),
    );
    await flag(
      request,
      allocation.id,
      "archived",
      Boolean(allocation.archived),
    );
  }
});

test("大词书学习状态筛选跨页且小进步不会显示为零", async ({
  page,
  request,
}) => {
  const bookId = "ielts-topic-essentials";
  const book = await post(request, "books/preview", {
    bookId,
    status: "unlearned",
  });
  const entry = book.entries.find((e) => !e.archived);
  await post(request, "books/import", {
    bookId,
    mode: "selected",
    entryIds: [entry.id],
  });
  const imported = await post(request, "books/preview", {
    bookId,
    query: entry.term,
  });
  const cardId = imported.entries.find((e) => e.id === entry.id).cardId;
  try {
    await flag(request, cardId, "familiar", true);
    await page.goto("/#books");
    const link = page.locator(`.book-learning-link[data-book="${bookId}"]`);
    await expect(link.locator("strong")).not.toHaveText("0%");
    await link.click();
    await expect(page.locator('#book-filter-form [name="status"]')).toHaveValue(
      "covered",
    );
    await page.locator('.progress-metric[data-status="unlearned"]').click();
    await expect(page.locator('#book-filter-form [name="status"]')).toHaveValue(
      "unlearned",
    );
    await expect(page.locator(".book-entry")).toHaveCount(50);
    const firstPage = await page
      .locator("[data-book-entry]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.bookEntry));
    await page.locator('[data-nb="book-page"][data-page="2"]').first().click();
    await expect(page.locator(".collection-pagination").first()).toContainText(
      "第 2 /",
    );
    const secondPage = await page
      .locator("[data-book-entry]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.bookEntry));
    expect(secondPage).toHaveLength(50);
    expect(secondPage.some((id) => firstPage.includes(id))).toBe(false);
    await expect(page.locator('#book-filter-form [name="status"]')).toHaveValue(
      "unlearned",
    );
  } finally {
    await flag(request, cardId, "familiar", false);
  }
});
