import { test, expect } from "@playwright/test";
import { fork, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

test("FSRS 跨日学习、遗忘重学、迁移、重启与界面提示", async ({
  page,
  playwright,
}) => {
  test.setTimeout(60000);
  mkdirSync(".artifacts", { recursive: true });
  const dir = mkdtempSync(resolve(".artifacts/fsrs-test-"));
  const dbPath = resolve(dir, "learning.sqlite");
  let now = Date.UTC(2026, 8, 30, 8);
  const day = 86400000;
  const env = {
    ...process.env,
    DB_PATH: dbPath,
    PORT: "3101",
    HOST: "127.0.0.1",
    DISABLE_AUTOMATION: "true",
    OPENAI_API_KEY: "",
  };
  // 创建完整隔离数据库后降至真实 v3 字段集，验证升级而非直接测试最终模型。
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import {db} from './server/store.js';
    db.exec("ALTER TABLE cards DROP COLUMN learned_at; ALTER TABLE cards DROP COLUMN part_of_speech; ALTER TABLE cards DROP COLUMN fsrs_card; ALTER TABLE cards DROP COLUMN schedule_revision; ALTER TABLE reviews DROP COLUMN fsrs_log; PRAGMA user_version=3");
    db.close();
  `,
    ],
    { env },
  );
  const fixture = new DatabaseSync(dbPath);
  const legacyDue = now + 3 * day;
  fixture
    .prepare(
      `INSERT INTO cards(id, lesson_id, term, meaning, example, translation, due_at, interval_days, repetitions, familiar, note)
    VALUES(1, 'manual:legacy', 'legacy', '旧词', '', '', ?, 7, 3, 1, '保留旧笔记')`,
    )
    .run(legacyDue);
  for (const daysAgo of [10, 9, 4])
    fixture
      .prepare(
        "INSERT INTO reviews(card_id, rating, reviewed_at) VALUES(1, 'good', ?)",
      )
      .run(now - daysAgo * day);
  const legacyBefore = fixture.prepare("SELECT * FROM cards WHERE id=1").get();
  fixture
    .prepare(
      `INSERT INTO cards(id, lesson_id, term, meaning, example, translation, due_at)
    VALUES(2, 'manual:untouched', 'untouched', '未学习', '', '', ?),
      (3, 'manual:studied', 'studied', '以前练过', '', '', ?)`,
    )
    .run(now - day, now - day);
  fixture
    .prepare(
      `INSERT INTO practice_attempts(session_id, position, card_id, direction, rating, mode, practiced_at)
    VALUES('historical-free', 0, 3, 'en-zh', 'good', 'free', ?)`,
    )
    .run(now - day);
  const oldItem = fixture.prepare("SELECT * FROM cards WHERE id=2").get();
  fixture.prepare("INSERT INTO practice_sessions VALUES(?, ?, ?)").run(
    "old-mixed-queue",
    JSON.stringify({
      id: "old-mixed-queue",
      mode: "due",
      direction: "en-zh",
      exercise: "flashcard",
      position: 0,
      pending: { revealed: true },
      results: [],
      createdAt: now,
      items: [{ card: oldItem, direction: "en-zh" }],
    }),
    now,
  );
  fixture.close();
  let child;
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3101",
  });
  async function start() {
    child = fork("e2e/helpers/fsrs-server.js", [], {
      env: { ...env, FSRS_TEST_TIME: String(now) },
      silent: true,
    });
    const [message] = await once(child, "message");
    expect(message.ready).toBe(true);
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
    const exited = once(child, "exit");
    child.kill();
    await exited;
    child = null;
  }
  async function advance(timestamp) {
    now = timestamp;
    const ack = once(child, "message");
    child.send({ now });
    expect((await ack)[0].now).toBe(now);
  }
  async function post(path, data, status = 200) {
    const response = await api.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  const state = async () => (await api.get("/api/state")).json();
  const card = async (id) => (await state()).cards.find((c) => c.id === id);
  try {
    await start();
    const legacy = await card(1);
    for (const [key, value] of Object.entries(legacyBefore))
      expect(legacy[key]).toBe(value);
    expect(legacy.memory.reviews).toBe(3);
    expect(legacy.memory.stability).toBeGreaterThan(0);
    expect((await state()).scheduler.retention).toBe(0.9);
    expect((await card(1)).learned_at).toBe(now - 10 * day);
    expect((await card(2)).learned_at).toBeNull();
    expect((await card(3)).learned_at).toBe(now - day);
    expect((await state()).dueCards.map((c) => c.id)).toEqual([3]);
    const oldGroup = await post("practice/grade", {
      id: "old-mixed-queue",
      position: 0,
      rating: "good",
    });
    expect(oldGroup.current).toBeNull();
    expect(oldGroup.skippedUnlearned).toBe(1);
    expect((await card(2)).learned_at).toBeNull();
    expect((await card(2)).repetitions).toBe(0);
    await post("notebook/flag", { id: 3, field: "familiar", value: true });

    await post("categories/save", { name: "记忆测试" });
    const categoryId = (await state()).categories.find(
      (c) => c.name === "记忆测试",
    ).id;
    const fresh = await post("notebook/save", {
      term: "retrieve",
      meaning: "回想",
      kind: "word",
      categoryId,
    });
    expect((await state()).dueCards).toHaveLength(0);
    await post("review", { cardId: fresh.id, rating: "good" }, 409);
    await post("practice/start", { categoryId, mode: "due" }, 400);
    const initial = await post("practice/start", { categoryId, mode: "learn" });
    expect((await card(fresh.id)).learned_at).toBeNull();
    const initialChecked = await post("practice/check", {
      id: initial.id,
      position: 0,
      reveal: true,
    });
    expect((await card(fresh.id)).learned_at).toBeNull();
    let preview = initialChecked.current.schedule;
    expect(preview.cardId).toBe(fresh.id);
    expect(Object.values(preview.options).map((o) => o.dueAt - now)).toEqual([
      60000, 360000, 600000, 1800000,
    ]);
    await post("review", { cardId: fresh.id, rating: "wrong" }, 400);
    await post("practice/grade", {
      id: initial.id,
      position: 0,
      rating: "good",
    });
    let current = await card(fresh.id);
    expect(current.memory.phase).toBe("learning");
    expect(current.familiar).toBe(0);
    expect(current.learned_at).toBe(now);
    expect(current.due_at).toBe(now + 600000);
    await post("books/import", {
      bookId: "ielts-topic-essentials",
      mode: "all",
    });
    const afterImport = await state();
    expect(afterImport.wordbooks[0].partOfSpeechCount).toBe(6512);
    expect(afterImport.dueCards).toHaveLength(0);
    expect(
      afterImport.cards
        .filter((c) => c.bookIds.includes("ielts-topic-essentials"))
        .every((c) => c.part_of_speech),
    ).toBe(true);
    await post("review", { cardId: fresh.id, rating: "good" }, 409);
    // 自由练习可以多练，但不能把连续看答案当成间隔回忆证据。
    const free = await post("practice/start", { categoryId, mode: "free" });
    await post("practice/check", { id: free.id, position: 0, reveal: true });
    await post("practice/grade", { id: free.id, position: 0, rating: "easy" });
    expect((await card(fresh.id)).fsrs_card).toBe(current.fsrs_card);
    expect((await card(fresh.id)).due_at).toBe(current.due_at);
    await advance(current.due_at);
    expect((await state()).dueCards.map((c) => c.id)).toEqual([fresh.id]);
    const due = await post("practice/start", { categoryId, mode: "due" });
    expect(due.mode).toBe("due");
    const concurrent = await post("practice/start", {
      categoryId,
      mode: "due",
    });
    const checked = await post("practice/check", {
      id: due.id,
      position: 0,
      reveal: true,
    });
    const expectedDue = checked.current.schedule.options.good.dueAt;
    const graded = await post("practice/grade", {
      id: due.id,
      position: 0,
      rating: "good",
    });
    expect(graded.results[0].scheduled).toBe(true);
    const duplicate = await post("practice/grade", {
      id: due.id,
      position: 0,
      rating: "good",
    });
    expect(duplicate.position).toBe(1);
    await post("practice/check", {
      id: concurrent.id,
      position: 0,
      reveal: true,
    });
    const stale = await post("practice/grade", {
      id: concurrent.id,
      position: 0,
      rating: "easy",
    });
    expect(stale.results[0].scheduled).toBe(false);
    current = await card(fresh.id);
    expect(current.repetitions).toBe(2);
    expect(current.memory.phase).toBe("review");
    expect(current.due_at).toBe(expectedDue);
    expect(current.interval_days).toBeGreaterThanOrEqual(1);
    expect(current.familiar).toBe(0);
    const firstStability = current.memory.stability;
    // 多次真实到期后答对，模型才逐步延长间隔。
    for (let i = 0; i < 4; i++) {
      await advance(current.due_at);
      await post("review", {
        cardId: fresh.id,
        rating: "good",
        revision: current.schedule_revision,
      });
      current = await card(fresh.id);
    }
    expect(current.memory.stability).toBeGreaterThan(firstStability);
    const mature = current;
    await advance(current.due_at + 30 * day);
    await post(
      "review",
      { cardId: fresh.id, rating: "again", revision: 0 },
      409,
    );
    await post("review", {
      cardId: fresh.id,
      rating: "again",
      revision: current.schedule_revision,
    });
    current = await card(fresh.id);
    expect(current.memory.phase).toBe("relearning");
    expect(current.memory.lapses).toBe(1);
    expect(current.memory.stability).toBeLessThan(mature.memory.stability);
    expect(current.due_at).toBe(now + 600000);
    await stop();
    await start();
    expect((await card(fresh.id)).fsrs_card).toBe(current.fsrs_card);
    expect((await card(fresh.id)).due_at).toBe(current.due_at);
    await advance(current.due_at);
    await post("review", { cardId: fresh.id, rating: "good" });
    current = await card(fresh.id);
    expect(current.memory.phase).toBe("review");
    expect(current.interval_days).toBeLessThan(mature.interval_days);
    expect(current.memory.lapses).toBe(1);

    const second = await post("notebook/save", {
      term: "consolidation",
      meaning: "巩固过程",
      kind: "word",
      categoryId,
    });
    await page.goto("http://127.0.0.1:3101/#notebook");
    await page.getByRole("button", { name: "学新词", exact: true }).click();
    await page
      .locator('#practice-setup [name="categoryId"]')
      .selectOption(String(categoryId));
    await page.getByRole("button", { name: "开始这组练习" }).click();
    await page.getByRole("button", { name: "暂时想不起来，翻卡看看" }).click();
    await expect(page.locator('[data-rating="good"]')).toContainText(
      "10 分钟后短期巩固",
    );
    await expect(page.locator('[data-rating="easy"]')).toContainText(
      "30 分钟后短期巩固",
    );
    await expect(page.locator(".practice-tip").last()).toContainText(
      "不是“想起来了”的固定复习间隔",
    );
    await page.screenshot({
      path: ".artifacts/fsrs-desktop.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".artifacts/fsrs-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator('[data-rating="easy"]').click();
    await expect(page.locator(".practice-result")).toBeVisible();
    expect((await card(second.id)).memory.phase).toBe("learning");
    expect((await card(second.id)).familiar).toBe(0);
    await post("notebook/flag", {
      id: fresh.id,
      field: "familiar",
      value: true,
    });
    await post("notebook/flag", {
      id: fresh.id,
      field: "familiar",
      value: false,
    });
    const reset = await card(fresh.id);
    expect(reset.memory.phase).toBe("new");
    expect(reset.repetitions).toBe(current.repetitions);
    expect(reset.due_at).toBe(now);
    const audit = new DatabaseSync(dbPath);
    expect(audit.prepare("PRAGMA user_version").get().user_version).toBe(8);
    expect(
      audit
        .prepare(
          "SELECT COUNT(*) AS n FROM reviews WHERE card_id=? AND fsrs_log IS NOT NULL",
        )
        .get(fresh.id).n,
    ).toBe(current.repetitions);
    expect(
      audit.prepare("SELECT COUNT(*) AS n FROM reviews WHERE card_id=1").get()
        .n,
    ).toBe(3);
    audit.close();
  } finally {
    if (child) await stop();
    await api.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
