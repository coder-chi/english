import { test, expect } from "@playwright/test";

const ownedCategories = new Set();
test.afterEach(async ({ request }) => {
  // 共享测试服务中只清理本用例创建的词，避免影响后续“首次收藏”流程。
  const state = await (await request.get("/api/state")).json();
  for (const card of state.cards.filter((c) =>
    ownedCategories.has(c.category_id),
  ))
    await client(request)("notebook/flag", {
      id: card.id,
      field: "archived",
      value: true,
    });
  ownedCategories.clear();
});

function client(request) {
  return async (path, data, status = 200) => {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status(), path).toBe(status);
    return response.json();
  };
}
async function category(request, name) {
  await client(request)("categories/save", { name });
  const state = await (await request.get("/api/state")).json();
  const id = state.categories.find((c) => c.name === name).id;
  ownedCategories.add(id);
  return id;
}
async function grade(post, session, rating = "good") {
  await post("practice/check", {
    id: session.id,
    position: session.position,
    reveal: true,
  });
  return post("practice/grade", {
    id: session.id,
    position: session.position,
    rating,
  });
}
async function finish(post, session) {
  while (session.current) session = await grade(post, session);
  return session;
}
async function cards(request, categoryId) {
  return (await (await request.get("/api/state")).json()).cards.filter(
    (c) => c.category_id === categoryId,
  );
}

test("轻量队列上限、连续吃力减新词，续轮不提前复习或重复创建", async ({
  request,
}) => {
  const post = client(request);
  const categoryId = await category(request, "轻量自动减负验证");
  for (let i = 0; i < 7; i++)
    await post("notebook/save", {
      term: `flow-old-${i}`,
      meaning: `旧词 ${i}`,
      kind: "word",
      categoryId,
    });
  await finish(
    post,
    await post("practice/start", { mode: "learn", categoryId }),
  );
  for (const card of await cards(request, categoryId))
    for (const value of [true, false])
      await post("notebook/flag", { id: card.id, field: "familiar", value });
  for (let i = 0; i < 6; i++)
    await post("notebook/save", {
      term: `flow-new-${i}`,
      meaning: `新词 ${i}`,
      kind: "word",
      categoryId,
    });
  let s = await post("practice/start", {
    adaptive: true,
    categoryId,
    limit: 100,
  });
  expect(s.total).toBe(10);
  expect(s.newCount).toBe(3);
  expect(s.current.queue).toBe("review");
  expect(s.exercise).toBe("flashcard");
  s = await grade(post, s, "hard");
  s = await grade(post, s, "hard");
  expect(s.flow.newCap).toBe(1);
  expect(s.newCount).toBe(1);
  expect(s.flow.deferredNewCount).toBe(2);
  s = await grade(post, s, "hard");
  expect(s.flow.newCap).toBe(0);
  expect(
    (await post("practice/start", { adaptive: true, categoryId })).newCount,
  ).toBe(0);
  s = await finish(post, s);
  const state = await cards(request, categoryId);
  expect(
    state.filter(
      (c) => c.term.startsWith("flow-new-") && c.learned_at === null,
    ),
  ).toHaveLength(5);
  const next = await post("practice/continue", { id: s.id });
  expect(next.newCount).toBeLessThanOrEqual(3);
  expect(next.reviewCount).toBe(0);
  expect((await post("practice/continue", { id: s.id })).id).toBe(next.id);
  await post("practice/start", { adaptive: true, mode: "free" }, 400);
});

test("手动减负保留眼前题目、翻卡和刷新状态，暂停新词延续到下一轮", async ({
  page,
  request,
}) => {
  const post = client(request);
  const categoryId = await category(request, "轻量手动减负验证");
  for (let i = 0; i < 6; i++)
    await post("notebook/save", {
      term: `gentle-${i}`,
      meaning: `轻量词 ${i}`,
      kind: "word",
      categoryId,
    });
  const s = await post("practice/start", { adaptive: true, categoryId });
  expect(s.total).toBe(3); // 无到期词时，不用更多新词补满。
  await page.goto("/#practice");
  await page.evaluate(
    (id) => sessionStorage.setItem("english.practice", id),
    s.id,
  );
  await page.reload();
  await page.getByRole("button", { name: "翻卡核对答案", exact: true }).click();
  const currentAnswer = await page.locator(".practice-answer").innerText();
  await page.getByRole("button", { name: "这一轮轻一点", exact: true }).click();
  await expect(page.locator(".flow-pace")).toContainText("已放回 2 个");
  await page.reload();
  await expect(page.locator(".practice-answer")).toHaveText(currentAnswer, {
    useInnerText: true,
  });
  await page.locator('[data-rating="good"]').click();
  await expect(page.locator(".flow-finish")).toBeVisible();
  const done = await post("practice/get", { id: s.id });
  const before = await cards(request, categoryId);
  expect(before.filter((c) => c.learned_at === null)).toHaveLength(5);
  const next = await post("practice/continue", { id: done.id });
  expect(next.total).toBe(0);
  expect(next.flow.newCap).toBe(0);
  expect(
    (await post("practice/start", { adaptive: true, categoryId })).newCount,
  ).toBe(0);
  await page.getByRole("button", { name: "继续一小轮", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "现在可以轻松收尾。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "继续一小轮", exact: true }),
  ).toHaveCount(0);
  expect(await cards(request, categoryId)).toEqual(before);
});

test("收尾短文与例句按实际已学词匹配，朗读、完成和重试不写记忆评分", async ({
  page,
  request,
}) => {
  const post = client(request);
  const categoryId = await category(request, "熟词短文验证");
  await post("notebook/save", {
    term: "book",
    meaning: "书（收尾验证）",
    kind: "word",
    categoryId,
  });
  let s = await post("practice/start", { adaptive: true, categoryId });
  await post("practice/closing", { id: s.id }, 400);
  s = await finish(post, s);
  const before = await cards(request, categoryId);
  s = await post("practice/closing", { id: s.id });
  expect(s.flow.closing.kind).toBe("story");
  expect(s.flow.closing.focusTerms).toEqual(["book"]);
  await page.addInitScript(() => {
    window.spoken = [];
    window.speechSynthesis.speak = (utterance) =>
      window.spoken.push(utterance.text);
  });
  await page.goto("/#practice");
  await page.evaluate(
    (id) => sessionStorage.setItem("english.practice", id),
    s.id,
  );
  await page.reload();
  await expect(page.locator(".flow-reading mark")).toHaveText("book");
  await page.getByRole("button", { name: "朗读这一段" }).click();
  expect(await page.evaluate(() => window.spoken.length)).toBe(1);
  await page.getByText("看中文", { exact: true }).click();
  await expect(page.locator(".flow-reading details p")).toBeVisible();
  await page.screenshot({
    path: ".artifacts/flow-reading-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "读完了，收好这一轮" }).click();
  await expect(page.locator(".flow-reading-done")).toBeVisible();
  const first = await post("practice/closing", { id: s.id, complete: true });
  const again = await post("practice/closing", { id: s.id, complete: true });
  expect(again.flow.closing.completedAt).toBe(first.flow.closing.completedAt);
  await page.reload();
  await expect(page.locator(".flow-reading-done")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".artifacts/flow-reading-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(await cards(request, categoryId)).toEqual(before);

  const sentenceCategory = await category(request, "熟词例句验证");
  await post("notebook/save", {
    term: "quiet corner",
    meaning: "安静角落（收尾验证）",
    kind: "phrase",
    categoryId: sentenceCategory,
    example: "I found a quiet corner to read.",
    translation: "我找到了一个安静的角落读书。",
  });
  let sentence = await finish(
    post,
    await post("practice/start", {
      adaptive: true,
      categoryId: sentenceCategory,
    }),
  );
  sentence = await post("practice/closing", { id: sentence.id });
  expect(sentence.flow.closing.kind).toBe("sentences");
  expect(sentence.flow.closing.sentences[0].english).toContain("quiet corner");

  const emptyCategory = await category(request, "收尾无素材验证");
  await post("notebook/save", {
    term: "no-material-flow",
    meaning: "无材料",
    kind: "word",
    categoryId: emptyCategory,
  });
  let empty = await finish(
    post,
    await post("practice/start", { adaptive: true, categoryId: emptyCategory }),
  );
  empty = await post("practice/closing", { id: empty.id });
  expect(empty.flow.closing.kind).toBe("empty");
});

test("一键入口默认折叠设置，偏好记忆与窄屏开练可用", async ({
  page,
  request,
}) => {
  const categoryId = await category(request, "一键入口验证");
  await client(request)("notebook/save", {
    term: "flow-entry-word",
    meaning: "入口验证词",
    kind: "word",
    categoryId,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#practice");
  await expect(page.locator(".practice-advanced")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.getByRole("button", { name: "一键开练" })).toBeVisible();
  await page.screenshot({
    path: ".artifacts/flow-entry-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".flow-preferences > summary").click();
  await page.getByLabel("一键练习方向").selectOption("mixed");
  await page.getByLabel("一键练习方式").selectOption("typing");
  await page.reload();
  await expect(page.locator(".flow-preferences > summary")).toContainText(
    "双向混合",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".artifacts/flow-entry-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/practice/start"),
  );
  await page.getByRole("button", { name: "一键开练" }).click();
  const s = await (await response).json();
  expect(s.config.adaptive).toBe(true);
  expect(s.direction).toBe("mixed");
  expect(s.exercise).toBe("typing");
  expect(s.newCount).toBeLessThanOrEqual(3);
  expect(s.total).toBeGreaterThan(0);
  expect(s.total).toBeLessThanOrEqual(10);
  expect(errors).toEqual([]);
});
