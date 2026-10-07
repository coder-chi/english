import { test, expect } from "@playwright/test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

test("听力外部服务：同步去重、超时兜底、AI 依据校验、重启持久化", async ({
  playwright,
}) => {
  test.setTimeout(45000);
  mkdirSync(".artifacts", { recursive: true });
  const dir = mkdtempSync(resolve(".artifacts/listening-test-"));
  let child;
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3104",
  });
  async function start() {
    child = fork("e2e/helpers/listening-server.js", [], {
      env: {
        ...process.env,
        DB_PATH: resolve(dir, "test.sqlite"),
        HOST: "127.0.0.1",
        PORT: "3104",
        DISABLE_AUTOMATION: "true",
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://ai.example.test/v1",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const [message] = await once(child, "message");
    expect(message.ready).toBe(true);
    await expect
      .poll(
        async () => {
          try {
            return (await api.get("/api/state")).status();
          } catch {
            return 0;
          }
        },
        { timeout: 5000 },
      )
      .toBe(200);
  }
  async function stop() {
    const done = once(child, "exit");
    child.kill();
    await done;
    child = null;
  }
  async function mode(value) {
    const reply = once(child, "message");
    child.send({ mode: value });
    return (await reply)[0];
  }
  async function post(path, data = {}, status = 200) {
    const response = await api.post(`/api/listening/${path}`, { data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  try {
    await start();
    const preview = await post("preview", {
      url: "https://youtu.be/abcdefghijk",
    });
    expect(preview.title).toBe("Mock episode title");
    expect((await post("sync")).added).toBe(1);
    expect((await post("sync")).added).toBe(0);
    const id = "yt_abcdefghijk";
    await mode("oversized");
    expect((await post("preview", { url: preview.url })).warning).toContain(
      "手动填写",
    );
    await mode("timeout");
    const startTime = Date.now();
    expect((await post("preview", { url: preview.url })).warning).toContain(
      "手动填写",
    );
    expect(Date.now() - startTime).toBeLessThan(11000);
    await mode("valid");
    const logId = randomUUID();
    const record = {
      id,
      token: logId,
      minutes: 6,
      subtitles: "none",
      understanding: "main",
      retelling: "I think this is about food.",
      note: "Some words were hard to hear.",
    };
    await post("log", record);
    const notes = await post("reflect", { logId });
    expect(notes.basis).toBe("notes");
    expect(notes.mode).toBe("ai");
    const source = "A balanced diet supports the brain.";
    await post("update", {
      id,
      transcript: source,
      transcriptSource: "https://www.bbc.co.uk/learningenglish/",
    });
    const next = randomUUID();
    await post("log", { ...record, token: next });
    await mode("invalid");
    await post("reflect", { logId: next }, 502);
    expect((await post("get", { id })).logs[0].reflection).toBeNull();
    await mode("valid");
    const reflected = await post("reflect", { logId: next });
    expect(reflected.basis).toBe("transcript");
    expect(reflected.points).toEqual([source]);
    const count = (await mode("valid")).calls;
    expect(await post("reflect", { logId: next })).toEqual(reflected);
    expect((await mode("valid")).calls).toBe(count);
    await post("link", {
      id,
      terms: ["brain", "diet"],
      english: source,
      chinese: "均衡饮食有益大脑。",
    });
    const before = await post("get", { id });
    await stop();
    await start();
    expect(await post("get", { id })).toEqual(before);
    expect((await post("list")).items).toHaveLength(4);
  } finally {
    if (child) await stop();
    await api.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
