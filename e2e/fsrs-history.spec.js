import { test, expect } from "@playwright/test";
import { fork, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { scheduleCard } from "../server/scheduler.js";

test("旧自由练习初始化模型，按钮预览与实际排程一致且不覆盖主动重置", async ({
  page,
  playwright,
}) => {
  mkdirSync(".artifacts", { recursive: true });
  const dir = mkdtempSync(resolve(".artifacts/fsrs-history-"));
  const dbPath = resolve(dir, "history.sqlite");
  const now = Date.UTC(2026, 9, 1, 12);
  const day = 86400000;
  const firstTime = now - 2 * day;
  const formalTime = now - day;
  const env = {
    ...process.env,
    DB_PATH: dbPath,
    PORT: "3102",
    HOST: "127.0.0.1",
    DISABLE_AUTOMATION: "true",
    OPENAI_API_KEY: "",
    FSRS_TEST_TIME: String(now),
  };
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {db} from './server/store.js'; db.exec('PRAGMA user_version=6'); db.close();",
    ],
    { env },
  );
  const fixture = new DatabaseSync(dbPath);
  const model = scheduleCard(
    { due_at: formalTime, fsrs_card: null },
    "good",
    formalTime,
  ).card;
  const insert = fixture.prepare(`INSERT INTO cards
    (id, lesson_id, term, meaning, example, translation, kind, category_id, part_of_speech,
     learned_at, due_at, fsrs_card, repetitions, schedule_revision, interval_days)
    VALUES (?, ?, ?, ?, '', '', 'word', ?, 'n.', ?, ?, ?, ?, ?, ?)`);
  insert.run(
    1,
    "manual:first",
    "recall",
    "回忆",
    null,
    firstTime,
    firstTime,
    null,
    0,
    0,
    0,
  );
  insert.run(
    2,
    "manual:nutrition",
    "nutrition",
    "营养",
    1,
    firstTime,
    model.due.getTime(),
    JSON.stringify(model),
    1,
    1,
    10 / 1440,
  );
  insert.run(
    3,
    "manual:reset",
    "reset",
    "重置",
    null,
    firstTime,
    formalTime,
    null,
    0,
    2,
    0,
  );
  insert.run(
    4,
    "manual:modern",
    "modern",
    "现代",
    null,
    formalTime,
    model.due.getTime(),
    JSON.stringify(model),
    1,
    1,
    10 / 1440,
  );
  const attempt = fixture.prepare(`INSERT INTO practice_attempts
    (session_id, position, card_id, direction, rating, mode, practiced_at) VALUES(?, ?, ?, 'zh-en', ?, 'free', ?)`);
  for (const id of [1, 2, 3])
    attempt.run("old-free", id, id, "good", firstTime);
  attempt.run("extra-free", 0, 1, "easy", firstTime + 1000);
  attempt.run("modern-free", 0, 4, "good", formalTime);
  const review = fixture.prepare(
    "INSERT INTO reviews(card_id, rating, reviewed_at) VALUES(?, 'good', ?)",
  );
  for (const id of [2, 4]) review.run(id, formalTime);
  const before = fixture.prepare("SELECT * FROM cards ORDER BY id").all();
  fixture.close();
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3102",
  });
  let child;
  async function start() {
    child = fork("e2e/helpers/fsrs-server.js", [], { env, silent: true });
    expect((await once(child, "message"))[0].ready).toBe(true);
    await expect
      .poll(async () => {
        try {
          return (await api.get("/api/state")).status();
        } catch {
          return 0;
        }
      })
      .toBe(200);
  }
  async function stop() {
    const done = once(child, "exit");
    child.kill();
    await done;
    child = null;
  }
  const getState = async () => (await api.get("/api/state")).json();
  async function post(path, data) {
    const response = await api.post(`/api/${path}`, { data });
    expect(response.status()).toBe(200);
    return response.json();
  }
  try {
    await start();
    let state = await getState();
    const one = state.cards.find((c) => c.id === 1);
    const nutrition = state.cards.find((c) => c.id === 2);
    expect(one.memory.reviews).toBe(1);
    expect(one.memory.phase).toBe("learning");
    expect(nutrition.memory.reviews).toBe(2);
    expect(nutrition.memory.phase).toBe("review");
    expect(state.cards.find((c) => c.id === 3).fsrs_card).toBeNull();
    expect(state.cards.find((c) => c.id === 4).fsrs_card).toBe(
      before[3].fsrs_card,
    );
    for (const original of before)
      for (const [key, value] of Object.entries(original))
        if (key !== "fsrs_card")
          expect(state.cards.find((c) => c.id === original.id)[key]).toBe(
            value,
          );
    const recovered = nutrition.fsrs_card;
    await stop();
    await start();
    expect((await getState()).cards.find((c) => c.id === 2).fsrs_card).toBe(
      recovered,
    );
    const session = await post("practice/start", {
      mode: "due",
      direction: "zh-en",
      categoryId: 1,
    });
    const answer = await post("practice/check", {
      id: session.id,
      position: 0,
      answer: "nutrition",
    });
    const option = answer.current.schedule.options.good;
    expect(option.dueAt - now).toBeGreaterThanOrEqual(day);
    expect(option.label).toContain("天后间隔复习");
    await page.goto("http://127.0.0.1:3102/#practice");
    await page
      .locator('[data-nb="resume"]')
      .filter({ hasText: "中" })
      .first()
      .click();
    await expect(page.locator(".practice-answer > h3")).toHaveText("nutrition");
    await expect(
      page.locator('[data-nb="grade"][data-rating="good"]'),
    ).toContainText(option.label);
    await page.screenshot({
      path: ".artifacts/fsrs-history-preview.png",
      animations: "disabled",
    });
    await page.locator('[data-nb="grade"][data-rating="good"]').click();
    await expect(page.locator(".practice-result")).toBeVisible();
    state = await getState();
    expect(state.cards.find((c) => c.id === 2).due_at).toBe(option.dueAt);
    expect(state.cards.find((c) => c.id === 2).repetitions).toBe(2);
  } finally {
    if (child) await stop();
    await api.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
