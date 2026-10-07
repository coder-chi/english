import { test, expect } from "@playwright/test";

test("生词本可分类、编辑、双向练习、恢复进度及设置提醒", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "生词本", exact: true }).click();
  await page.getByRole("button", { name: "管理分类" }).click();
  await page.getByRole("textbox", { name: "新分类名称" }).fill("工作沟通");
  await page.getByRole("button", { name: "添加分类", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "分类 工作沟通", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page
    .getByRole("button", { name: "+ 添加词条", exact: true })
    .first()
    .click();
  await page.getByLabel("英文单词或短语").fill("resilient");
  await page.getByLabel("中文释义").fill("有韧性的；能迅速恢复的");
  await page
    .locator('#card-form [name="categoryId"]')
    .selectOption({ label: "工作沟通" });
  await page
    .getByLabel("英文例句")
    .fill("A resilient team can learn from mistakes.");
  await page.getByLabel("例句翻译").fill("有韧性的团队能从错误中学习。");
  await page.getByLabel("记忆笔记").fill("形容人或团队面对困难的恢复能力");
  await page.getByRole("button", { name: "保存词条" }).click();
  await expect(page.locator("#notebook-dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "resilient", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "标记重点 resilient" }).click();
  await expect(
    page.getByRole("button", { name: "取消重点 resilient" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "遮住释义", exact: true }).click();
  const row = page.locator(".vocab-row").filter({ hasText: "resilient" });
  await expect(row.locator(".meaning-cover")).toBeVisible();
  await row.getByRole("button", { name: "点击查看释义" }).click();
  await expect(row.locator(".vocab-meaning>p")).toHaveText(
    "有韧性的；能迅速恢复的",
  );
  await page.getByRole("button", { name: "显示释义", exact: true }).click();
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("记忆笔记").fill("也可描述系统的恢复能力");
  await page.getByRole("button", { name: "保存词条" }).click();
  await expect(row.locator(".vocab-meaning>small")).toHaveText(
    "也可描述系统的恢复能力",
  );
  await page
    .locator(".category-strip button")
    .filter({ hasText: "工作沟通" })
    .click();
  await expect(page.locator(".vocab-row")).toHaveCount(1);
  await expect(page.locator(".notebook-footnote")).toContainText(
    "共 1 条 · 1 个单词 / 0 个短语",
  );
  await page.screenshot({
    path: ".artifacts/notebook-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  const before = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.term === "resilient",
  );
  await page.locator('[data-nb="quick"][data-direction="zh-en"]').click();
  await expect(page.locator('#practice-setup [name="mode"]')).toHaveValue(
    "smart",
  );
  await page.locator('#practice-setup [name="mode"]').selectOption("free");
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-card>h2")).toHaveText(
    "有韧性的；能迅速恢复的",
  );
  await expect(page.locator(".practice-card")).not.toContainText("resilient");
  await page.getByRole("textbox", { name: "你的答案" }).fill("RESILIENT");
  await page.getByRole("button", { name: "核对答案", exact: true }).click();
  await expect(page.locator(".answer-feedback")).toContainText(
    "与参考答案一致",
  );
  await page.reload();
  // 刷新当前作答页继续原进度；主动点击“双向练习”则开新组，旧组从历史恢复。
  await expect(page.locator(".practice-answer>h3")).toHaveText("resilient");
  await page.getByRole("button", { name: "双向练习", exact: true }).click();
  await expect(page.locator('#practice-setup [name="mode"]')).toHaveValue(
    "smart",
  );
  await expect(page.locator(".practice-answer")).toHaveCount(0);
  await page.locator('[data-nb="resume"]').first().click();
  await expect(page.locator(".practice-answer>h3")).toHaveText("resilient");
  await page.locator('[data-nb="grade"][data-rating="hard"]').click();
  await expect(
    page.getByRole("heading", { name: "这一组，完成了。" }),
  ).toBeVisible();
  const afterFirst = (
    await (await request.get("/api/state")).json()
  ).cards.find((c) => c.id === before.id);
  expect(afterFirst.learned_at).not.toBeNull();
  expect(afterFirst.due_at).toBeGreaterThan(before.due_at);
  await page.getByRole("button", { name: "再练本组薄弱项" }).click();
  await page.getByRole("button", { name: "暂时想不起来，翻卡看看" }).click();
  await page.locator('[data-nb="grade"][data-rating="good"]').click();
  const afterFree = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === before.id,
  );
  expect(afterFree.due_at).toBe(afterFirst.due_at);
  expect(afterFree.fsrs_card).toBe(afterFirst.fsrs_card);
  expect(afterFree.practice_count).toBe(2);

  await page.getByRole("button", { name: "再选一组" }).click();
  for (const value of [true, false])
    await request.post("/api/notebook/flag", {
      data: { id: before.id, field: "familiar", value },
    });
  await page.locator('#practice-setup [name="mode"]').selectOption("due");
  await page
    .locator('#practice-setup [name="direction"]')
    .selectOption("en-zh");
  await page
    .locator('#practice-setup [name="exercise"]')
    .selectOption("flashcard");
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-card>h2")).toHaveText("resilient");
  await expect(page.locator(".practice-card")).not.toContainText("有韧性的");
  await page.getByRole("button", { name: "翻卡核对答案" }).click();
  await expect(page.locator(".practice-answer")).toBeVisible();
  await page.screenshot({
    path: ".artifacts/practice-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator('[data-nb="grade"][data-rating="easy"]').click();
  const afterDue = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === before.id,
  );
  expect(afterDue.due_at - Date.now()).toBeGreaterThan(29 * 60000);
  expect(afterDue.due_at - Date.now()).toBeLessThanOrEqual(30 * 60000);
  expect(afterDue.memory.phase).toBe("learning");
  expect(afterDue.familiar).toBe(0);
  expect(afterDue.repetitions).toBe(before.repetitions + 2);

  await page.getByRole("button", { name: "生词本", exact: true }).click();
  await page
    .locator(".category-strip button")
    .filter({ hasText: "工作沟通" })
    .click();
  await page
    .locator(".vocab-row")
    .getByRole("button", { name: "归档", exact: true })
    .click();
  await expect(page.locator(".vocab-row")).toHaveCount(0);
  await page.getByRole("button", { name: "已归档", exact: true }).click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await page.locator('[data-nb="scope"][data-value="all"]').click();
  await expect(page.locator(".vocab-row")).toHaveCount(1);
  await page.getByRole("button", { name: "提醒设置" }).click();
  await page.getByLabel("开启每日提醒").check();
  await page.getByLabel("每天提醒时间").fill("20:15");
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  await expect(page.locator(".notebook-reminder")).toContainText("20:15");
  await page.getByRole("button", { name: "管理分类" }).click();
  const categoryForm = page.locator(".category-edit").filter({
    has: page.getByRole("textbox", { name: "分类 工作沟通", exact: true }),
  });
  await categoryForm.getByRole("button", { name: "移除", exact: true }).click();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "resilient", exact: true }).click();
  await expect(page.locator('#card-form [name="categoryId"]')).toHaveValue("");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const toastWidth = await page
    .locator("#toast")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(toastWidth).toBeGreaterThan(100);
  expect(toastWidth).toBeLessThan(390);
  await page.screenshot({
    path: ".artifacts/notebook-mobile.png",
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

test("练习 API 拦截重复推进、保护排程并正确处理混合方向", async ({
  request,
}) => {
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  await post("categories/save", { name: "接口验证分类" });
  let state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find((c) => c.name === "接口验证分类").id;
  const a = await post("notebook/save", {
    term: "keep going",
    meaning: "继续前进",
    kind: "phrase",
    categoryId,
  });
  await post("notebook/save", {
    term: "curious",
    meaning: "好奇的",
    kind: "word",
    categoryId,
  });
  await post(
    "notebook/save",
    { term: " KEEP GOING ", meaning: "继续前进", kind: "phrase", categoryId },
    409,
  );
  await post("notebook/save", {
    term: "keep going",
    meaning: "继续运转",
    kind: "phrase",
    categoryId,
  });
  const s = await post("practice/start", {
    mode: "learn",
    direction: "mixed",
    categoryId,
    limit: 10,
  });
  expect(s.total).toBe(3);
  expect(s.current.direction).toBe("en-zh");
  expect(s.current.answer).toBeNull();
  await post("practice/grade", { id: s.id, position: 0, rating: "good" }, 400);
  await post("practice/check", { id: s.id, position: 0, reveal: true });
  const next = await post("practice/grade", {
    id: s.id,
    position: 0,
    rating: "good",
  });
  expect(next.position).toBe(1);
  expect(next.current.direction).toBe("zh-en");
  const duplicate = await post("practice/grade", {
    id: s.id,
    position: 0,
    rating: "good",
  });
  expect(duplicate.position).toBe(1);
  await post("practice/check", { id: s.id, position: 0, reveal: true }, 409);
  const currentId = next.current.id;
  const concurrent = await post("practice/start", {
    mode: "learn",
    direction: "en-zh",
    categoryId,
    limit: 100,
  });
  await post("practice/check", { id: s.id, position: 1, reveal: true });
  await post("notebook/flag", {
    id: currentId,
    field: "archived",
    value: true,
  });
  const archived = await post("practice/grade", {
    id: s.id,
    position: 1,
    rating: "easy",
  });
  expect(archived.results[1].scheduled).toBe(false);
  await post("reminders", { enabled: true, time: "25:00" }, 400);
  state = await (await request.get("/api/state")).json();
  expect(state.archivedCards.some((c) => c.id === currentId)).toBe(true);
  expect(concurrent.total).toBe(2);
  expect(a.kind).toBe("phrase");
});

test("新词优先选择用户记录，再选择纯词书导入项", async ({ request }) => {
  async function post(path, data) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(200);
    return response.json();
  }

  await post("categories/save", { name: "来源优先级验证" });
  let state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find(
    (category) => category.name === "来源优先级验证",
  ).id;
  const preview = await post("books/preview", { bookId: "bsl-business" });
  const entry = preview.entries.find((item) => !item.imported);
  expect(entry).toBeTruthy();
  await post("books/import", {
    bookId: "bsl-business",
    entryIds: [entry.id],
  });
  const imported = (
    await post("books/preview", {
      bookId: "bsl-business",
      query: entry.term,
    })
  ).entries.find((item) => item.id === entry.id);
  await post("notebook/save", {
    id: imported.cardId,
    term: entry.term,
    meaning: entry.meaning,
    kind: entry.kind,
    categoryId,
  });
  const manual = await post("notebook/save", {
    term: "user-priority-entry",
    meaning: "用户主动记录的词条",
    kind: "word",
    categoryId,
  });

  const learn = await post("practice/start", {
    mode: "learn",
    categoryId,
    limit: 1,
  });
  expect(learn.current.id).toBe(manual.id);

  const smart = await post("practice/start", {
    mode: "smart",
    categoryId,
    limit: 1,
  });
  expect(smart.current.id).toBe(manual.id);

  state = await (await request.get("/api/state")).json();
  expect(
    state.cards.find((card) => card.id === imported.cardId).lesson_id,
  ).toMatch(/^book:/);
  expect(state.cards.find((card) => card.id === manual.id).lesson_id).toMatch(
    /^manual:/,
  );
});

test("智能混合按 FSRS 选到期旧词，并用新词补足本组", async ({
  page,
  request,
}) => {
  async function post(path, data) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(200);
    return response.json();
  }
  await post("categories/save", { name: "智能混合验证" });
  const state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find(
    (category) => category.name === "智能混合验证",
  ).id;
  const old = await post("notebook/save", {
    term: "scheduled-old",
    meaning: "按算法到期的旧词",
    kind: "word",
    categoryId,
  });
  const first = await post("practice/start", {
    mode: "learn",
    categoryId,
  });
  await post("practice/check", {
    id: first.id,
    position: 0,
    reveal: true,
  });
  await post("practice/grade", {
    id: first.id,
    position: 0,
    rating: "good",
  });
  // 保留“学过”的事实并令它立即到期，模拟今天应按 FSRS 复习的旧词。
  await post("notebook/flag", { id: old.id, field: "familiar", value: true });
  await post("notebook/flag", { id: old.id, field: "familiar", value: false });
  for (let index = 1; index <= 3; index++)
    await post("notebook/save", {
      term: `fresh-word-${index}`,
      meaning: `未学习新词 ${index}`,
      kind: "word",
      categoryId,
    });

  const mixed = await post("practice/start", {
    mode: "smart",
    direction: "mixed",
    categoryId,
    limit: 10,
  });
  expect(mixed.total).toBe(4);
  expect(mixed.reviewCount).toBe(1);
  expect(mixed.newCount).toBe(3);
  expect(mixed.current.id).toBe(old.id);
  expect(mixed.current.queue).toBe("review");
  await page.goto("/#practice");
  await page.locator(".practice-advanced > summary").click();
  await page
    .locator('#practice-setup [name="categoryId"]')
    .selectOption(String(categoryId));
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator("main")).toContainText("本组复习 1 + 新词 3");
  await expect(page.locator(".practice-tip")).toContainText("FSRS 到期复习");
  await page.screenshot({
    path: ".artifacts/practice-smart-mix.png",
    animations: "disabled",
  });
  await post("practice/check", {
    id: mixed.id,
    position: 0,
    reveal: true,
  });
  const next = await post("practice/grade", {
    id: mixed.id,
    position: 0,
    rating: "good",
  });
  expect(next.current.queue).toBe("new");
  expect(next.results[0].scheduled).toBe(true);
});

test("提醒尊重每日去重，模拟通知不会发出真实系统通知", async ({
  page,
  request,
}) => {
  const state = await (await request.get("/api/state")).json();
  const learned = state.cards.find(
    (card) => card.learned_at != null && !card.archived,
  );
  for (const value of [true, false])
    await request.post("/api/notebook/flag", {
      data: { id: learned.id, field: "familiar", value },
    });
  await request.post("/api/reminders", {
    data: { enabled: true, time: "00:00" },
  });
  await page.addInitScript(() => {
    window.notificationLog = [];
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: class {
        static permission = "granted";
        constructor(title, options) {
          window.notificationLog.push({ title, body: options.body });
        }
        close() {}
      },
    });
  });
  await page.clock.install();
  await page.goto("/#notebook");
  await expect(
    page.getByRole("heading", { name: "我的生词本", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.notificationLog.length))
    .toBe(1);
  await expect(page.locator("#toast")).toContainText("个词条到期了");
  const nextState = page.waitForResponse((response) =>
    response.url().endsWith("/api/state"),
  );
  await page.clock.fastForward(60000);
  await nextState;
  expect(await page.evaluate(() => window.notificationLog.length)).toBe(1);
  await request.post("/api/reminders", {
    data: { enabled: false, time: "20:00" },
  });
});
