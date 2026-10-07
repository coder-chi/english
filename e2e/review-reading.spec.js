import { test, expect } from "@playwright/test";

test("复习短文只统计已学词，并支持精读、挖空、背诵与完成记录", async ({
  page,
  request,
}) => {
  const entries = [
    ["fictional city", "虚构城市", "phrase"],
    ["public money", "公共资金", "phrase"],
    ["exam scores", "考试分数", "phrase"],
  ];
  await request.post("/api/categories/save", {
    data: { name: "短文回顾测试" },
  });
  const categoryId = (
    await (await request.get("/api/state")).json()
  ).categories.find((category) => category.name === "短文回顾测试").id;
  for (const [term, meaning, kind] of entries) {
    const response = await request.post("/api/notebook/save", {
      data: { term, meaning, kind, categoryId },
    });
    expect(response.ok()).toBe(true);
  }

  let session = await (
    await request.post("/api/practice/start", {
      data: { mode: "learn", limit: entries.length, categoryId },
    })
  ).json();
  while (session.current) {
    session = await (
      await request.post("/api/practice/check", {
        data: {
          id: session.id,
          position: session.position,
          reveal: true,
        },
      })
    ).json();
    session = await (
      await request.post("/api/practice/grade", {
        data: {
          id: session.id,
          position: session.position,
          rating: "good",
        },
      })
    ).json();
  }

  const reading = await (
    await request.post("/api/review-reading/get", { data: {} })
  ).json();
  expect(reading.stats.covered).toBe(3);
  expect(reading.targets.map((target) => target.term).sort()).toEqual(
    entries.map(([term]) => term).sort(),
  );
  const saved = await (
    await request.post("/api/review-reading/list", { data: {} })
  ).json();
  expect(saved).toHaveLength(1);
  expect(saved[0].title).toBe("一座城市的多重选择");

  await page.goto("/#reading");
  await expect(
    page.getByRole("heading", { name: "复习短文", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reading-list-item")).toHaveCount(1);
  await expect(page.locator(".reading-list-item")).toContainText(
    "一座城市的多重选择",
  );
  await page.getByRole("button", { name: "打开复习" }).click();
  await expect(
    page.getByRole("heading", { name: "一座城市的多重选择" }),
  ).toBeVisible();
  await expect(page.locator(".reading-coverage")).toContainText(
    `${reading.stats.covered} / ${reading.stats.learned}`,
  );
  await expect(page.locator(".review-term")).toHaveCount(3);

  await page.getByRole("button", { name: "关键词挖空" }).click();
  await expect(page.locator(".recall-blank")).toHaveCount(3);
  await page.locator(".recall-blank").first().click();
  await expect(page.locator(".recall-blank.revealed")).toHaveCount(1);
  await page.getByRole("button", { name: "揭晓全部" }).click();
  await expect(page.locator(".recall-blank.revealed")).toHaveCount(3);

  await page.getByRole("button", { name: "看中文背英文" }).click();
  await expect(page.locator(".recite-paragraph .review-english")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "核对英文 →" }).first().click();
  await expect(page.locator(".recite-paragraph .review-english")).toHaveCount(
    1,
  );
  await page.screenshot({
    path: ".artifacts/review-reading-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("button", { name: "完成本次回顾" }).click();
  await expect(page.locator(".reading-finish")).toContainText("已完成 1 次");
  await page.reload();
  await expect(page.locator(".reading-list-item")).toContainText("已回顾");
  await page.getByRole("button", { name: "打开复习" }).click();
  await expect(page.locator(".reading-finish")).toContainText("已完成 1 次");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "高亮精读" }).click();
  await page.getByRole("button", { name: "显示译文" }).click();
  await page.screenshot({
    path: ".artifacts/review-reading-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
