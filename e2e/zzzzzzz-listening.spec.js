import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("听力手册只记录听过状态、逐字稿和单集笔记", async ({ page, request }) => {
  const post = async (path, data, status = 200) => {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  };
  const id = "yt_FZDImEiPgMk";
  const before = await (await request.get("/api/state")).json();
  await page.goto("/#listening");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "听力手册", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("听过、文稿、笔记，仅此而已。")).toBeVisible();
  await expect(page.locator(".listen-stats")).toContainText("有逐字稿");

  await page
    .locator(".listen-row-main")
    .filter({ hasText: "Feed your brain" })
    .click();
  await expect(
    page.getByRole("link", { name: "打开 YouTube" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=FZDImEiPgMk");
  await expect(page.getByLabel("我听过这一集")).not.toBeChecked();
  await page.getByLabel("我听过这一集").check();
  await page
    .locator(".listen-note textarea")
    .fill("食物会影响大脑状态；下一次重点听营养师的例子。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByLabel("我听过这一集")).toBeChecked();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".listen-note textarea")).toHaveValue(
    "食物会影响大脑状态；下一次重点听营养师的例子。",
  );
  const transcript =
    "Now let's recap the vocabulary we've learned. Starting with 'intentional'. It's an adjective that describes acting with a plan or reason in mind. We also had 'enable'. This is to make something possible. A shift is a small change.";
  await post("listening/update", {
    id,
    transcript,
    transcriptSource: "https://www.youtube.com/watch?v=FZDImEiPgMk",
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".listen-transcript summary")).toContainText(
    "已保存",
  );
  await page.locator(".listen-transcript summary").click();
  await expect(page.getByLabel("编辑逐字稿")).toHaveValue(transcript);
  await page
    .getByLabel("编辑逐字稿")
    .fill(`${transcript} This sentence was corrected.`);
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "提取重点词语" }).click();
  await expect(page.locator(".listen-keywords")).toContainText("intentional");
  await expect(page.getByText("那些没听清的瞬间")).toHaveCount(0);
  await expect(page.getByText("每一遍，都算数")).toHaveCount(0);
  await expect(page.getByText("把这集的词句留下来")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/listening-simple-mobile.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("button", { name: "返回列表" }).click();
  const row = page
    .locator(".listen-row")
    .filter({ hasText: "Feed your brain" });
  await expect(row).toContainText("已听");
  await expect(row).toContainText("有逐字稿");
  await expect(row).toContainText("有笔记");
  await row.getByRole("button", { name: "标记为未听" }).click();
  await expect(row).toContainText("未听");

  const after = await (await request.get("/api/state")).json();
  expect(after.cards).toEqual(before.cards);
  expect(after.archivedCards).toEqual(before.archivedCards);
});

test("简单听力记录校验并保留旧接口数据", async ({ request }) => {
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/listening/${path}`, { data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  for (const url of [
    "http://127.0.0.1:3000/private",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "javascript:alert(1)",
    "https://youtube.com/playlist?list=abc",
  ])
    await post("preview", { url }, 400);

  const item = await post("save", {
    url: "https://youtu.be/abcdefghijk",
    title: "<script>alert(1)</script>",
    channel: "测试",
  });
  await post("update", { id: item.id, listened: "yes" }, 400);
  await post("update", { id: item.id, note: "x".repeat(12001) }, 400);
  const updated = await post("update", {
    id: item.id,
    listened: true,
    note: "一条简单笔记。",
  });
  expect(updated.status).toBe("heard");
  expect(updated.note).toBe("一条简单笔记。");

  // 旧版明细仍可读取，避免简化页面时破坏已有历史数据。
  const token = randomUUID();
  await post("log", {
    id: item.id,
    token,
    subtitles: "none",
    understanding: "little",
    minutes: 6,
    note: "旧版记录",
  });
  expect((await post("get", { id: item.id })).logs).toHaveLength(1);
});
