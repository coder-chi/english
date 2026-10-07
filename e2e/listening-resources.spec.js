import { test, expect } from "@playwright/test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

test("BBC 采集：HTML/PDF、音频播放、来源保护、失败回退及重启", async ({
  playwright,
  page,
}) => {
  test.setTimeout(90000);
  mkdirSync(".artifacts", { recursive: true });
  const dir = mkdtempSync(resolve(".artifacts/listening-resources-"));
  const api = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3105",
  });
  let child;
  async function start() {
    child = fork("e2e/helpers/listening-resources-server.js", [], {
      env: {
        ...process.env,
        PORT: "3105",
        HOST: "127.0.0.1",
        DB_PATH: resolve(dir, "test.sqlite"),
        OPENAI_API_KEY: "",
        DISABLE_AUTOMATION: "true",
        DISABLE_YOUTUBE_TRANSCRIPT: "true",
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
  const id = "yt_FZDImEiPgMk";
  try {
    await start();
    const initial = await mode("html");
    let result = await post("resources", { id });
    expect(result.resources.page).toContain("/english/features/");
    expect(result.transcript).toContain("Neil: Hello");
    expect(result.transcript).not.toContain("Introduction");
    expect(result.transcript).not.toContain("Not part");
    expect(result.resources.audio.url).toContain("brain.mp3");
    const original = result.transcript;
    await post("update", {
      id,
      transcript: "My carefully edited transcript.",
      transcriptSource: "https://example.org/my-notes",
    });
    result = await post("resources", { id });
    expect(result.transcript).toBe("My carefully edited transcript.");
    result = await post("transcript-use", { id });
    expect(result.transcript).toBe(original);
    const versionId = result.transcriptVersions[0].id;
    result = await post("transcript-use", { id, versionId });
    expect(result.transcript).toBe("My carefully edited transcript.");
    await mode("pdf");
    result = await post("resources", { id });
    expect(
      result.resources.transcript.kind,
      JSON.stringify(result.resources.errors),
    ).toBe("BBC 官方 PDF");
    expect(result.resources.transcript.text).toContain("balanced diet");
    expect(result.transcript).toBe("My carefully edited transcript.");
    await mode("bad-audio");
    await post("download", { id }, 502);
    await mode("html");
    result = await post("download", { id });
    const cacheId = result.resources.audio.cacheId;
    const audioURL = `/api/listening/audio/${cacheId}`;
    const audio = await api.get(audioURL);
    expect(audio.status()).toBe(200);
    expect(audio.headers()["content-type"]).toBe("audio/mpeg");
    const ranged = await api.get(audioURL, {
      headers: { Range: "bytes=10-99" },
    });
    expect(ranged.status()).toBe(206);
    expect((await ranged.body()).length).toBe(90);
    expect((await api.head(audioURL)).headers()["accept-ranges"]).toBe("bytes");
    expect(
      (
        await api.get(audioURL, { headers: { Range: "bytes=9999999-" } })
      ).status(),
    ).toBe(416);
    expect(
      (await api.get(audioURL, { headers: { Range: "bytes=-0" } })).status(),
    ).toBe(416);
    const clip = {
      id,
      token: randomUUID(),
      start: "00:02",
      reason: "连读弱读",
    };
    result = await post("clip", clip);
    expect(result.clips[0].media).toBe("youtube");
    result = await post("clip", { ...clip, token: randomUUID(), media: "bbc" });
    expect(result.clips.find((c) => c.media === "bbc").audio_id).toBe(cacheId);

    await page.goto("http://127.0.0.1:3105/#listening");
    await page.waitForLoadState("networkidle");
    await page
      .locator(".listen-row-main")
      .filter({ hasText: "Feed your brain" })
      .click();
    await expect(page.getByLabel("我听过这一集")).toBeVisible();
    await expect(page.locator(".listen-note textarea")).toBeVisible();
    await expect(page.locator(".listen-transcript summary")).toContainText(
      "已保存",
    );
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.getByText("那些没听清的瞬间")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".artifacts/listening-resources-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: ".artifacts/listening-resources-desktop.png",
      fullPage: true,
    });

    const another = await post("save", {
      url: "https://youtu.be/abcdefghijk",
      title: "Feed your brain",
      channel: "BBC",
    });
    await mode("ambiguous");
    const ambiguous = await post("resources", { id: another.id });
    expect(ambiguous.resources.candidates).toHaveLength(2);
    expect(ambiguous.resources.audio).toBeUndefined();
    expect(ambiguous.transcript).toBe("");
    await mode("fallback");
    const fallback = await post("resources", { id: another.id });
    expect(fallback.resources.transcript.kind).toBe(
      "YouTube 英文字幕镜像（第三方）",
    );
    expect(fallback.transcript).toContain("Caption sentence 1");
    expect(fallback.resources.errors.join(" ")).toContain("BBC unavailable");
    await mode("html");
    const described = await post("resources", { id: another.id });
    expect(described.resources.page).toContain("ep-240222");
    expect(described.resources.transcript.kind).toBe("BBC 官方页面");
    expect(described.resources.transcript.text).toContain("Neil: Hello");
    expect(described.transcript).toContain("Caption sentence 1");
    const saved = await post("get", { id });
    await mode("broken");
    const changedSource = await post("resources", {
      id,
      source: saved.resources.page.replace("240222", "250101"),
    });
    expect(changedSource.resources.page).toBe(saved.resources.page);
    expect(changedSource.resources.audio.cacheId).toBe(cacheId);
    expect(changedSource.resources.transcript).toEqual(
      saved.resources.transcript,
    );
    for (const failure of ["broken", "oversized", "redirect", "partial"]) {
      await mode(failure);
      result = await post("resources", { id });
      expect(result.resources.errors.length).toBeGreaterThan(0);
      expect(result.resources.audio.cacheId).toBe(cacheId);
      expect(result.transcript).toBe(saved.transcript);
      expect(result.clips).toEqual(saved.clips);
    }
    const denied = await mode("html");
    expect(denied.requests.some((url) => url.includes("127.0.0.1"))).toBe(
      false,
    );
    await post("resources", { id, source: "http://127.0.0.1/secrets" }, 400);
    await mode("timeout");
    const started = Date.now();
    result = await post("resources", { id });
    expect(Date.now() - started).toBeLessThan(19000);
    expect(result.resources.errors.join(" ")).toContain("超时");
    expect(result.resources.audio.cacheId).toBe(cacheId);
    expect((await mode("html")).fingerprint).toBe(initial.fingerprint);
    const before = await post("get", { id });
    await stop();
    await start();
    expect(await post("get", { id })).toEqual(before);
    expect((await api.get(audioURL)).status()).toBe(200);
  } finally {
    if (child) await stop();
    await api.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
