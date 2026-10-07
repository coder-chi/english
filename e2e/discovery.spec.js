import { test, expect } from "@playwright/test";

const article = {
  title: "Why city trees matter",
  publisher: "Example Journal",
  url: "https://example.com/city-trees",
  topic: "生活",
  content:
    "City trees do more than make a street look pleasant. Their leaves provide shade during hot summers, while their roots can slow rainwater before it reaches crowded drains.\n\nResearchers also connect urban trees with healthier daily routines. People are more likely to walk when streets feel cooler and quieter, and even a short walk can improve concentration.\n\nHowever, planting is only the beginning. Cities need to choose suitable species, protect enough soil, and care for young trees for many years.",
};

test("指定文章可同步、分析、标注并记录练习状态", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#discover");
  await page.getByRole("button", { name: "同步指定文章" }).click();
  await page.getByLabel("文章标题").fill(article.title);
  await page.getByLabel("来源名称").fill(article.publisher);
  await page.getByLabel("原文链接").fill(article.url);
  await page.getByLabel("主题").selectOption(article.topic);
  await page.getByLabel("英文正文").fill(article.content);
  await page.getByRole("button", { name: "保存并分析" }).click();

  const reader = page.getByRole("dialog", { name: "文章精读与标注" });
  await expect(reader).toBeVisible();
  await expect(
    reader.getByRole("heading", { name: article.title }),
  ).toBeVisible();
  await expect(reader.locator(".article-analysis")).toContainText("词");
  await expect(reader.locator(".analysis-notes")).toContainText("KEYWORDS");
  await reader.getByLabel("选中的内容").fill("City trees");
  await reader.getByLabel("我的理解或疑问").fill("全文核心主题");
  await reader.getByRole("button", { name: "保存标注" }).click();
  await expect(reader.locator("mark").first()).toHaveText("City trees");
  await expect(reader.locator(".annotation-list")).toContainText(
    "全文核心主题",
  );
  await reader.getByRole("button", { name: "标记为已练习" }).click();
  await expect(
    reader.getByRole("button", { name: /已完成精读/ }),
  ).toBeDisabled();
  await reader.getByRole("button", { name: "关闭文章精读" }).click();

  await page.locator('[data-source-scope="practiced"]').click();
  await expect(page.locator(".source-card")).toHaveCount(1);
  await expect(page.locator(".source-card")).toContainText("✓ 已练习");

  const state = await (await request.get("/api/state")).json();
  const saved = state.sources.find((source) => source.title === article.title);
  expect(saved.content).toBe(article.content);
  expect(saved.analysis.wordCount).toBeGreaterThan(50);
  expect(saved.analysis.keywords.length).toBeGreaterThan(0);
  expect(saved.annotations).toHaveLength(1);
  expect(saved.practicedAt).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-source-read]").click();
  await expect(reader).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/discovery-article-mobile.png",
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
