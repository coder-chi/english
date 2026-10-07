import { test, expect } from "@playwright/test";
import { wordId } from "../server/knowledge-index.js";
import { associationCatalog } from "../server/association-catalog.js";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const postFor =
  (request) =>
  async (path, data, status = 200) => {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  };
const detail = (post, term) => post("words/get", { wordId: wordId(term) });

test("内置联想双向一致、三类明确，个人关系去重且不影响学习状态", async ({
  request,
}) => {
  const post = postFor(request);
  const before = await (await request.get("/api/state")).json();
  for (const group of associationCatalog) {
    for (const w of group.words) {
      const found = (await detail(post, w.term)).associations.curated.find(
        (g) => g.id === group.id,
      );
      expect(found.type).toBe(group.type);
      expect(found.words.map((w) => w.term)).toEqual(
        group.words.map((w) => w.term),
      );
      for (const target of found.words)
        expect((await post("words/get", { wordId: target.id })).term).toBe(
          target.term,
        );
    }
  }
  const conservation = await detail(post, "conservation");
  expect(
    conservation.associations.curated.find(
      (g) => g.id === "conservation-preservation",
    ).contrast,
  ).toContain("会重叠");
  let result = await post("words/associations/save", {
    wordId: wordId("conservation"),
    relatedTerm: "  PRESERVATION  ",
    type: "meaning",
    note: "从资源保护联想到物品保存。",
  });
  const row = result.personal[0];
  try {
    result = await post("words/associations/save", {
      wordId: wordId("preservation"),
      relatedTerm: "conservation",
      type: "meaning",
      note: "更新后的双向笔记。",
    });
    expect(result.personal).toHaveLength(1);
    expect(result.personal[0].id).toBe(row.id);
    expect(
      (await detail(post, "conservation")).associations.personal[0].contrast,
    ).toBe("更新后的双向笔记。");
    await post(
      "words/associations/save",
      {
        wordId: wordId("conservation"),
        relatedTerm: "Conservation",
        type: "meaning",
        note: "无效",
      },
      400,
    );
    await post(
      "words/associations/save",
      {
        wordId: wordId("conservation"),
        relatedTerm: "missing-association-term",
        type: "meaning",
        note: "无效",
      },
      404,
    );
    await post(
      "words/associations/save",
      {
        wordId: wordId("conservation"),
        relatedTerm: "preservation",
        type: "unknown",
        note: "无效",
      },
      400,
    );
    await post(
      "words/associations/remove",
      { wordId: wordId("conservation"), id: "conservation-preservation" },
      400,
    );
    const after = await (await request.get("/api/state")).json();
    expect(after.cards).toEqual(before.cards);
    expect(after.learningProgress).toEqual(before.learningProgress);
  } finally {
    await post("words/associations/remove", {
      wordId: wordId("preservation"),
      id: row.id,
    });
    await post("words/associations/remove", {
      wordId: wordId("preservation"),
      id: row.id,
    });
  }
  expect(
    (await detail(post, "conservation")).associations.personal,
  ).toHaveLength(0);
});

test("词条联想可跳转、朗读、增改删笔记并适配手机", async ({
  page,
  request,
}) => {
  const post = postFor(request);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.spoken = [];
    speechSynthesis.speak = (u) => window.spoken.push(u.text);
  });
  await page.goto("/#words");
  await page
    .locator(".association-discovery")
    .getByRole("button", { name: "conservation ↗", exact: true })
    .click();
  const first = page.locator(".association-card").first();
  await expect(first).toContainText("water conservation");
  await first
    .getByRole("button", { name: "朗读 conservation 例句", exact: true })
    .click();
  expect(await page.evaluate(() => window.spoken.length)).toBe(1);
  await page
    .locator(".word-associations")
    .screenshot({
      path: ".artifacts/associations-desktop.png",
      animations: "disabled",
    });
  await first
    .getByRole("button", { name: "preservation ↗", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "preservation", exact: true, level: 1 }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".word-associations")
    .screenshot({
      path: ".artifacts/associations-mobile.png",
      animations: "disabled",
    });
  await page.locator(".association-editor > summary").click();
  await page.getByLabel("联想到的英文词或短语").fill("protection");
  await page
    .getByLabel("我的联想与区别")
    .fill("我的记法 <b>保护</b>，不能直接互换。");
  await page.getByRole("button", { name: "保存联想", exact: true }).click();
  let personal = page
    .locator(".association-card")
    .filter({ hasText: "个人整理" });
  await expect(personal).toContainText("我的记法 <b>保护</b>");
  expect(await personal.locator("b").count()).toBe(0);
  await personal.locator("summary").click();
  await personal.getByRole("button", { name: "编辑联想笔记" }).click();
  await expect(page.getByLabel("我的联想与区别")).toHaveValue(
    "我的记法 <b>保护</b>，不能直接互换。",
  );
  await page
    .getByLabel("我的联想与区别")
    .fill("保存重在保持状态；保护还可以是防止受伤。");
  await page.getByRole("button", { name: "保存联想", exact: true }).click();
  await personal.locator("summary").click();
  await personal
    .getByRole("button", { name: "protection ↗", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "protection", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(personal).toContainText("保存重在保持状态");
  await page.reload();
  await page.getByLabel("搜索词条或例句").fill("protection");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page
    .locator(".unified-word-list")
    .getByRole("button", { name: "protection ↗", exact: true })
    .click();
  await expect(personal).toContainText("保存重在保持状态");
  await personal.locator("summary").click();
  await personal.getByRole("button", { name: "移除这条联想" }).click();
  await expect(personal).toHaveCount(0);
  expect(
    (await detail(post, "preservation")).associations.personal,
  ).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("联想只在翻卡后出现，浏览和返回不写 FSRS", async ({ page, request }) => {
  const post = postFor(request);
  await post("categories/save", { name: "联想练习验证" });
  const state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find((c) => c.name === "联想练习验证").id;
  const card = await post("notebook/save", {
    term: "conservation",
    meaning: "保护；节约（联想验证）",
    kind: "word",
    categoryId,
  });
  try {
    const session = await post("practice/start", {
      categoryId,
      direction: "zh-en",
      exercise: "flashcard",
    });
    expect(session.current.answer).toBeNull();
    expect(JSON.stringify(session.current)).not.toContain("preservation");
    const before = (await (await request.get("/api/state")).json()).cards.find(
      (c) => c.id === card.id,
    );
    await page.goto("/#practice");
    await page.evaluate(
      (id) => sessionStorage.setItem("english.practice", id),
      session.id,
    );
    await page.reload();
    await expect(page.locator(".association-mini")).toHaveCount(0);
    await page
      .getByRole("button", { name: "翻卡核对答案", exact: true })
      .click();
    await expect(page.locator(".association-mini")).not.toHaveAttribute(
      "open",
      "",
    );
    await page.locator(".association-mini > summary").click();
    await page
      .locator(".association-mini .association-card")
      .first()
      .locator("summary")
      .click();
    await page
      .locator(".association-mini")
      .getByRole("button", { name: "preservation ↗", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "preservation",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    await page.goto("/#practice");
    await expect(page.locator(".practice-answer")).toContainText(
      "conservation",
    );
    const after = (await (await request.get("/api/state")).json()).cards.find(
      (c) => c.id === card.id,
    );
    expect(after).toEqual(before);
  } finally {
    await post("notebook/flag", {
      id: card.id,
      field: "archived",
      value: true,
    });
  }
});

test("重启与索引重建保留个人联想", async ({ playwright }) => {
  mkdirSync(".artifacts", { recursive: true });
  const dir = mkdtempSync(resolve(".artifacts/association-persistence-"));
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3106",
  });
  let child;
  async function start() {
    child = fork("server/index.js", [], {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "3106",
        DB_PATH: resolve(dir, "test.sqlite"),
        DISABLE_AUTOMATION: "true",
        OPENAI_API_KEY: "",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
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
  }
  async function stop() {
    if (!child) return;
    const exit = once(child, "exit");
    child.kill();
    await exit;
    child = null;
  }
  try {
    await start();
    const post = postFor(api);
    const original = await post("words/associations/save", {
      wordId: wordId("adapt"),
      relatedTerm: "adopt",
      type: "spelling",
      note: "adapt to change；adopt a plan。",
    });
    await post("notebook/save", {
      term: "index rebuild fixture",
      meaning: "索引重建验证",
      kind: "phrase",
    });
    expect((await detail(post, "adapt")).associations).toEqual(original);
    await stop();
    await start();
    expect((await detail(post, "adopt")).associations.personal).toEqual(
      original.personal,
    );
  } finally {
    await stop();
    await api.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
