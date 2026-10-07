import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const owned = new Set();
const client =
  (request) =>
  async (path, data, status = 200) => {
    const r = await request.post(`/api/${path}`, { data });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  };
test.afterEach(async ({ request }) => {
  for (const id of owned)
    await client(request)("notebook/flag", {
      id,
      field: "archived",
      value: true,
    });
  owned.clear();
});
async function fixture(request, term, withExample = true) {
  const post = client(request);
  const name = `拼图验证 ${randomUUID().slice(0, 8)}`;
  await post("categories/save", { name });
  const state = await (await request.get("/api/state")).json();
  const categoryId = state.categories.find((c) => c.name === name).id;
  const english = `We keep a ${term} near the window.`;
  const card = await post("notebook/save", {
    term,
    meaning: `${term} 测试词`,
    kind: "word",
    categoryId,
    example: withExample ? english : "",
    translation: withExample ? "我们把这个东西放在窗边。" : "",
  });
  owned.add(card.id);
  let practice = await post("practice/start", { adaptive: true, categoryId });
  await post("practice/check", { id: practice.id, position: 0, reveal: true });
  practice = await post("practice/grade", {
    id: practice.id,
    position: 0,
    rating: "good",
  });
  const start = () =>
    post("puzzle/start", {
      practiceSessionId: practice.id,
      token: randomUUID(),
    });
  return { post, card, english, practice, start };
}
function order(s, english) {
  return [...s.current.chunks]
    .sort((a, b) => english.indexOf(a.text) - english.indexOf(b.text))
    .map((c) => c.id);
}
const act = (post, s, action, extra = {}) =>
  post("puzzle/act", { id: s.id, position: s.position, action, ...extra });

test("同批词拼图三阶段递进、幂等提交，独立句数去重且不写 FSRS", async ({
  request,
}) => {
  const { post, card, english, practice, start } = await fixture(
    request,
    "riverstone",
  );
  const snapshot = (await (await request.get("/api/state")).json()).cards.find(
    (c) => c.id === card.id,
  );
  for (const mode of ["assemble", "cloze", "recall", "recall"]) {
    let s = await start();
    expect(s.total).toBe(1);
    expect(s.practiceSessionId).toBe(practice.id);
    expect(s.current.mode).toBe(mode);
    expect(s.current.solution).toBeNull();
    if (mode === "recall") {
      expect(s.current.initial).toBe("");
      expect(s.current.target).toBeNull();
    }
    const input =
      mode === "assemble"
        ? { chunks: order(s, english) }
        : { answer: "Riverstone" };
    s = await act(post, s, "check", input);
    expect(s.current.result.outcome).toBe("independent");
    expect(
      (await act(post, s, "check", { answer: "wrong" })).current.result,
    ).toEqual(s.current.result);
    const old = s;
    s = await act(post, s, "next");
    expect(s.current).toBeNull();
    expect(await act(post, old, "next")).toEqual(s);
  }
  const token = randomUUID();
  const first = await post("puzzle/start", {
    token,
    practiceSessionId: practice.id,
  });
  expect(
    (await post("puzzle/start", { token, practiceSessionId: practice.id })).id,
  ).toBe(first.id);
  const records = await post("learning/records", {});
  const entries = records.expression.filter((e) => e.term === "riverstone");
  expect(entries.map((e) => e.mode).sort()).toEqual([
    "assemble",
    "cloze",
    "recall",
  ]);
  expect(records.counts.expression).toBe(
    new Set(
      records.expression
        .filter((e) => e.outcome === "independent")
        .map((e) => e.sentenceId),
    ).size,
  );
  expect(records.counts.memory).toBe(records.memory.length);
  expect(records.memory.some((e) => e.id === card.id)).toBe(true);
  expect(
    (await (await request.get("/api/state")).json()).cards.find(
      (c) => c.id === card.id,
    ),
  ).toEqual(snapshot);
});

test("提示后不升级，答案不同与跳过不记成果，无例句显示空态", async ({
  request,
}) => {
  const { post, english, start } = await fixture(request, "paperboat");
  let s = await start();
  s = await act(post, s, "hint");
  expect((await post("puzzle/get", { id: s.id })).current.hinted).toBe(true);
  s = await act(post, s, "check", { chunks: order(s, english) });
  expect(s.current.result.outcome).toBe("assisted");
  await act(post, s, "next");
  s = await start();
  expect(s.current.mode).toBe("assemble");
  const reversed = order(s, english).reverse();
  s = await act(post, s, "check", { chunks: reversed });
  expect(s.current.result.outcome).toBe("different");
  await act(post, s, "next");
  s = await start();
  const skipped = await act(post, s, "skip");
  expect(skipped.current).toBeNull();
  expect(await act(post, s, "skip")).toEqual(skipped);
  const entries = (await post("learning/records", {})).expression.filter(
    (e) => e.term === "paperboat",
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].outcome).toBe("assisted");
  const empty = await fixture(request, "without-example", false);
  expect((await empty.start()).total).toBe(0);
});

test("统一入口、拼图草稿刷新、键盘和手机操作、成果明细与收尾衔接", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { post, english, practice, start } = await fixture(
    request,
    "woodenbird",
  );
  const s = await start();
  await page.goto("/");
  await expect(page.locator(".hub-path li")).toHaveCount(3);
  await page.locator(".hub-entry-grid [data-tab=explore]").click();
  await expect(page.locator(".hub-explore")).toHaveCount(3);
  await page.goto("/#practice");
  await page.evaluate(
    ({ id, puzzle }) => {
      sessionStorage.setItem("english.practice", id);
      sessionStorage.setItem("english.puzzle", puzzle);
    },
    { id: practice.id, puzzle: s.id },
  );
  await page.reload();
  await page.getByRole("button", { name: "用这批词玩拼图" }).click();
  const game = await post("puzzle/get", {
    id: await page.evaluate(() => sessionStorage.getItem("english.puzzle")),
  });
  const ids = order(game, english);
  await page.locator(`[data-hub=pick][data-chunk="${ids[0]}"]`).focus();
  await page.keyboard.press("Enter");
  await page.reload();
  await expect(page.locator(".puzzle-slots button")).toHaveCount(1);
  for (const id of ids.slice(1))
    await page.locator(`[data-hub=pick][data-chunk="${id}"]`).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/puzzle-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "核对这句话", exact: true }).click();
  await expect(page.locator(".puzzle-feedback")).toContainText("独立完成");
  await page.reload();
  await expect(page.locator(".puzzle-feedback")).toContainText("独立完成");
  await page.getByRole("button", { name: "收好这一轮", exact: true }).click();
  await page.getByRole("button", { name: "读熟词短文收尾" }).click();
  await expect(page.locator(".flow-reading")).toBeVisible();
  await page.goto("/#records");
  await expect(page.locator(".ability-detail")).toContainText(english);
  await page.screenshot({
    path: ".artifacts/records-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".artifacts/records-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const mode of ["首字母补词", "独立补关键词"]) {
    await page.goto("/#practice");
    await page.getByRole("button", { name: "用这批词玩拼图" }).click();
    await expect(page.locator(".puzzle-top .tag")).toHaveText(mode);
    await page.getByLabel("空缺的词或短语").fill("woodenbird");
    await page.reload();
    await expect(page.getByLabel("空缺的词或短语")).toHaveValue("woodenbird");
    await page.getByRole("button", { name: "核对这句话", exact: true }).click();
    await expect(page.locator(".puzzle-feedback")).toContainText("独立完成");
    await page.getByRole("button", { name: "收好这一轮", exact: true }).click();
  }
  await page.goto("/");
  await page.screenshot({
    path: ".artifacts/hub-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "一键开练", exact: true }).click();
  await expect(page).toHaveURL(/#practice$/);
  expect(errors).toEqual([]);
});

test("听辨积累只纳入无字幕理解自评，重复篇目去重", async ({
  request,
  page,
}) => {
  const post = client(request);
  const episode = await post("listening/save", {
    url: "https://www.youtube.com/watch?v=hubtest0001",
    title: "Hub evidence fixture",
    channel: "测试",
  });
  const id = episode.id;
  for (const [subtitles, understanding] of [
    ["english", "most"],
    ["none", "little"],
  ]) {
    await post("listening/log", {
      id,
      token: randomUUID(),
      subtitles,
      understanding,
      minutes: 2,
    });
  }
  expect(
    (await post("learning/records", {})).listening.some((e) => e.id === id),
  ).toBe(false);
  for (const understanding of ["main", "most"])
    await post("listening/log", {
      id,
      token: randomUUID(),
      subtitles: "none",
      understanding,
      minutes: 3,
    });
  const r = await post("learning/records", {});
  expect(r.listening.filter((e) => e.id === id)).toHaveLength(1);
  expect(r.counts.listening).toBe(r.listening.length);
  await page.goto("/#records");
  await page.locator("[data-dimension=listening]").click();
  await expect(page.locator(".ability-detail")).toContainText(
    "Hub evidence fixture",
  );
  await expect(page.locator(".ability-detail")).toContainText("自评");
});

test("重启保留拼图提示、进度与能力记录", async ({ playwright }) => {
  mkdirSync(".artifacts", { recursive: true });
  const dir = mkdtempSync(resolve(".artifacts/puzzle-persistence-"));
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3105",
  });
  let child;
  async function start() {
    child = fork("server/index.js", [], {
      env: {
        ...process.env,
        DB_PATH: resolve(dir, "test.sqlite"),
        HOST: "127.0.0.1",
        PORT: "3105",
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
    const exited = once(child, "exit");
    child.kill();
    await exited;
    child = null;
  }
  try {
    await start();
    const post = client(api);
    const english = "We keep a stonebird near the window.";
    const card = await post("notebook/save", {
      term: "stonebird",
      meaning: "石鸟",
      kind: "word",
      example: english,
      translation: "我们把石鸟放在窗边。",
    });
    await post("notebook/flag", {
      id: card.id,
      field: "familiar",
      value: true,
    });
    let s = await post("puzzle/start", { token: randomUUID() });
    s = await act(post, s, "hint");
    await stop();
    await start();
    expect(await post("puzzle/get", { id: s.id })).toEqual(s);
    s = await act(post, s, "check", { chunks: order(s, english) });
    s = await act(post, s, "next");
    const records = await post("learning/records", {});
    await stop();
    await start();
    expect(await post("puzzle/get", { id: s.id })).toEqual(s);
    expect(await post("learning/records", {})).toEqual(records);
    expect(records.expression[0].outcome).toBe("assisted");
  } finally {
    await stop();
    await api.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
