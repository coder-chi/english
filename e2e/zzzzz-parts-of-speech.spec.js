import { test, expect } from "@playwright/test";
import { wordbooks } from "../server/wordbook-catalog.js";
import { normalizePartOfSpeech } from "../server/parts-of-speech.js";

test("词库完整标注词性，支持多词性、编辑、练习答案和进度保护", async ({
  page,
  request,
}) => {
  for (const book of wordbooks)
    for (const entry of book.entries) {
      expect(entry.partOfSpeech, `${book.id}/${entry.term}`).toBeTruthy();
      expect(normalizePartOfSpeech(entry.partOfSpeech)).toBe(
        entry.partOfSpeech,
      );
    }
  async function post(path, data, status = 200) {
    const response = await request.post(`/api/${path}`, { data });
    expect(response.status()).toBe(status);
    return response.json();
  }
  const getState = async () => (await request.get("/api/state")).json();
  const bookId = "ielts-topic-essentials";
  const environment = (
    await post("books/preview", { bookId, query: "environment" })
  ).entries.find((e) => e.term === "environment");
  expect(environment.partOfSpeech).toBe("n.");
  const academic = (
    await post("books/preview", { bookId, query: "academic" })
  ).entries.find((e) => e.term === "academic");
  expect(academic.partOfSpeech).toBe("adj. / n.");
  const modal = (
    await post("books/preview", { bookId, query: "can" })
  ).entries.find((e) => e.term === "can");
  expect(modal.partOfSpeech).toBe("modal.");
  await post("books/import", {
    bookId,
    mode: "selected",
    entryIds: ["sustainable"],
  });
  let saved = (await getState()).cards.find((c) => c.term === "sustainable");
  expect(saved.part_of_speech).toBe("adj.");
  await post("notebook/flag", { id: saved.id, field: "familiar", value: true });
  const before = (await getState()).cards.find((c) => c.id === saved.id);
  await post("notebook/save", {
    ...saved,
    categoryId: saved.category_id,
    partOfSpeech: "形容词 / 名词",
  });
  await post("books/import", {
    bookId,
    mode: "selected",
    entryIds: ["sustainable"],
  });
  saved = (await getState()).cards.find((c) => c.id === saved.id);
  expect(saved.part_of_speech).toBe("adj. / n.");
  for (const field of [
    "due_at",
    "interval_days",
    "fsrs_card",
    "repetitions",
    "familiar",
  ])
    expect(saved[field]).toEqual(before[field]);
  await post("notebook/save", { ...saved, categoryId: saved.category_id });
  expect(
    (await getState()).cards.find((c) => c.id === saved.id).part_of_speech,
  ).toBe("adj. / n.");
  await post(
    "notebook/save",
    { ...saved, categoryId: saved.category_id, partOfSpeech: "不存在的词性" },
    400,
  );

  await post("categories/save", { name: "词性页面测试" });
  const categoryId = (await getState()).categories.find(
    (c) => c.name === "词性页面测试",
  ).id;
  await page.goto("/#notebook");
  await page
    .getByRole("button", { name: "+ 添加词条", exact: true })
    .first()
    .click();
  await page.getByLabel("英文单词或短语").fill("wordclasssample");
  await page.getByLabel("中文释义").fill("词性测试词");
  await page.getByLabel("词性", { exact: true }).fill("名词 / 动词");
  await page
    .locator('#card-form [name="categoryId"]')
    .selectOption(String(categoryId));
  await page.getByRole("button", { name: "保存词条", exact: true }).click();
  await expect(page.locator("#notebook-dialog")).not.toBeVisible();
  await page.getByLabel("搜索生词本").fill("wordclasssample");
  await expect(page.locator(".vocab-row .pos-tag")).toHaveText(
    "n. 名词 / v. 动词",
  );
  await page
    .getByRole("button", { name: "wordclasssample", exact: true })
    .click();
  await expect(page.getByLabel("词性", { exact: true })).toHaveValue("n. / v.");
  await page.getByLabel("词性", { exact: true }).fill("adj.");
  await page.getByRole("button", { name: "保存词条", exact: true }).click();
  await expect(page.locator(".vocab-row .pos-tag")).toHaveText("adj. 形容词");
  await page
    .locator(".category-strip button")
    .filter({ hasText: "词性页面测试" })
    .click();
  await page.locator('[data-nb="quick"][data-direction="zh-en"]').click();
  await page.getByRole("button", { name: "开始这组练习" }).click();
  await expect(page.locator(".practice-card .pos-tag")).toHaveCount(0);
  await page.getByRole("button", { name: "暂时想不起来，翻卡看看" }).click();
  await expect(page.locator(".practice-answer .pos-tag")).toHaveText(
    "adj. 形容词",
  );
  await page.screenshot({
    path: ".artifacts/parts-of-speech-practice.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "词书", exact: true }).click();
  await page
    .getByRole("button", { name: "预览 雅思备考主题精选", exact: true })
    .click();
  await expect(
    page
      .locator(".book-entry")
      .filter({ hasText: "curriculum" })
      .locator(".pos-tag"),
  ).toHaveText("n. 名词");
  await expect(
    page
      .locator(".book-entry")
      .filter({ hasText: "vocational" })
      .locator(".pos-tag"),
  ).toHaveText("adj. 形容词");
  await expect(
    page
      .locator(".book-entry")
      .filter({ hasText: "critical thinking" })
      .locator(".pos-tag"),
  ).toHaveText("n. phr. 名词短语");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".book-entry-list").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".artifacts/parts-of-speech-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const unknown = await post("notebook/save", {
    term: "unknownpossample",
    meaning: "未知词性",
    kind: "word",
  });
  expect(unknown.part_of_speech).toBe("");
  const phrase = await post("notebook/save", {
    term: "give up",
    meaning: "放弃",
    kind: "phrase",
  });
  expect(phrase.part_of_speech).toBe("v. phr.");
});
