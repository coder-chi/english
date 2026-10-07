import { test, expect } from "@playwright/test";

test("阅读、收藏、复习与异常提示形成完整流程", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，也学一点英语。" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "开始阅读", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "英语阅读" })).toBeVisible();
  await page.getByRole("button", { name: "显示翻译", exact: true }).click();
  await expect(page.locator(".translation")).toHaveCount(3);
  await page.getByRole("button", { name: "全部收藏 +" }).click();
  await expect(page.locator(".phrase button:disabled")).toHaveCount(3);
  await expect(page.locator("#toast")).toBeVisible();
  await page.getByRole("button", { name: "全部收藏 +" }).click();
  await expect(page.locator(".phrase button:disabled")).toHaveCount(3);
  await page.locator('[data-answer="0"]').click();
  await expect(page.locator("#quiz-feedback")).toContainText("回答正确");
  await page.getByRole("button", { name: "完成这次阅读" }).click();
  await expect(
    page.getByRole("dialog", { name: "英语阅读" }),
  ).not.toBeVisible();
  await page.locator('[data-tab="review"]').first().click();
  await expect(page.locator(".review-empty")).toContainText("当前没有到期复习");
  await page.getByRole("button", { name: "学新词", exact: true }).click();
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-progress")).toContainText("第 1 / 3");
  const sessionId = await page.evaluate(() =>
    sessionStorage.getItem("english.practice"),
  );
  const session = await (
    await request.post("/api/practice/get", { data: { id: sessionId } })
  ).json();
  await page.getByRole("button", { name: "暂时想不起来，翻卡看看" }).click();
  await page.locator('[data-nb="grade"][data-rating="good"]').click();
  await expect(page.locator(".practice-progress")).toContainText("第 2 / 3");
  for (const value of [true, false])
    await request.post("/api/notebook/flag", {
      data: { id: session.current.id, field: "familiar", value },
    });
  await page.goto("/#review");
  await page.reload();
  await expect(page.locator(".review-meta")).toContainText("待复习 1");
  const reviewState = await (await request.get("/api/state")).json();
  const reviewTerm = reviewState.dueCards[0].term;
  await expect(page.locator(".flash-answer")).toHaveCount(0);
  await page.getByRole("button", { name: "听音默写" }).click();
  await expect(page.locator(".flashcard")).not.toContainText(reviewTerm);
  await page.screenshot({
    path: ".artifacts/review-dictation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/review-dictation-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("textbox", { name: "默写答案" })
    .fill(reviewTerm.toUpperCase());
  await page.getByRole("button", { name: "核对拼写" }).click();
  await expect(page.locator(".dictation-result")).toContainText("拼写一致");
  await expect(page.locator(".flash-answer")).toBeVisible();
  await expect(page.locator(".flash-answer")).toContainText(reviewTerm);
  await page.locator('[data-rating="good"]').click();
  await expect(page.locator(".review-empty")).toBeVisible();
  await page.reload();
  await page.locator('[data-tab="review"]').first().click();
  await expect(page.locator(".review-empty")).toBeVisible();
  await page.locator('[data-tab="create"]').click();
  await page.getByRole("button", { name: "生成我的练习" }).click();
  await expect(page.locator("#toast")).toContainText("OPENAI_API_KEY");
  await page.getByRole("link", { name: "Small Steps 首页" }).click();
  await expect(
    page.getByRole("heading", { name: "今天，也学一点英语。" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".artifacts/home-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "我的书架", exact: true }).click();
  await expect(page.locator(".phrase-list>div")).toHaveCount(3);
  expect(errors).toEqual([]);
});
