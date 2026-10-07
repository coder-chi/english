export function createReviewReading({
  api,
  render,
  speak,
  esc,
  heading,
  toast,
}) {
  let readings = null;
  let reading = null;
  let mode = "read";
  let showTranslations = false;
  let busy = false;
  const revealedTerms = new Set();
  const revealedParagraphs = new Set();

  async function enter() {
    readings = null;
    reading = null;
    resetReader();
    readings = await api("review-reading/list", {});
  }

  function resetReader() {
    mode = "read";
    showTranslations = false;
    revealedTerms.clear();
    revealedParagraphs.clear();
  }

  function targetMap() {
    return new Map(
      reading.targets.map((target) => [target.term.toLowerCase(), target]),
    );
  }

  function renderEnglish(text, paragraphIndex) {
    if (!reading.targets.length) return esc(text);
    const targets = targetMap();
    const alternatives = [...targets.keys()]
      .sort((a, b) => b.length - a.length)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const pattern = new RegExp(
      `(^|[^A-Za-z])(${alternatives})(?=$|[^A-Za-z])`,
      "gi",
    );
    let result = "";
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      const prefix = match[1];
      const term = match[2];
      const start = match.index + prefix.length;
      const target = targets.get(term.toLowerCase());
      result += esc(text.slice(cursor, start));
      if (mode === "cloze") {
        const revealed = revealedTerms.has(target.term.toLowerCase());
        result += `<button class="recall-blank ${revealed ? "revealed" : ""}" data-rr="term" data-term="${esc(target.term.toLowerCase())}" aria-label="${revealed ? `隐藏 ${esc(target.term)}` : `揭晓第 ${target.number} 个关键词`}">${revealed ? esc(term) : `<span>${target.number}</span>${"＿".repeat(Math.min(6, Math.max(2, target.term.length / 3)))}`}</button>`;
      } else {
        result += `<mark class="review-term" title="${esc(target.meaning)}">${esc(term)}</mark>`;
      }
      cursor = start + term.length;
    }
    return result + esc(text.slice(cursor));
  }

  function paragraph(paragraph, index) {
    if (mode === "recite") {
      const revealed = revealedParagraphs.has(index);
      return `<section class="recite-paragraph"><div class="recite-number">0${index + 1}</div><p class="review-chinese">${esc(paragraph.zh)}</p><button class="text-button" data-rr="paragraph" data-index="${index}">${revealed ? "收起英文" : "核对英文"} →</button>${revealed ? `<p class="review-english revealed-copy">${renderEnglish(paragraph.en, index)}</p>` : ""}</section>`;
    }
    return `<section class="reading-paragraph"><span class="paragraph-index">0${index + 1}</span><p class="review-english">${renderEnglish(paragraph.en, index)}</p>${showTranslations ? `<p class="review-chinese">${esc(paragraph.zh)}</p>` : ""}</section>`;
  }

  function controls() {
    return `<div class="reading-controls"><div class="reading-modes" role="group" aria-label="复习方式">${[
      ["read", "高亮精读"],
      ["cloze", "关键词挖空"],
      ["recite", "看中文背英文"],
    ]
      .map(
        ([value, label]) =>
          `<button data-rr="mode" data-mode="${value}" class="${mode === value ? "selected" : ""}" aria-pressed="${mode === value}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="reading-actions"><button class="text-button" data-rr="listen">朗读全文</button>${
      mode === "recite"
        ? `<button class="text-button" data-rr="all-paragraphs">${revealedParagraphs.size === reading.paragraphs.length ? "收起全部英文" : "核对全部英文"}</button>`
        : `<button class="text-button" data-rr="translations">${showTranslations ? "隐藏译文" : "显示译文"}</button>`
    }${mode === "cloze" ? `<button class="text-button" data-rr="all-terms">${revealedTerms.size === reading.targets.length ? "重新挖空" : "揭晓全部"}</button>` : ""}</div></div>`;
  }

  function vocabulary() {
    return `<details class="reading-vocabulary"><summary><span>本篇复习词汇</span><strong>${reading.stats.covered}</strong><small>点击展开释义</small></summary><div class="reading-vocabulary-grid">${reading.targets
      .map(
        (target) =>
          `<div><span>${target.number}</span><p><strong>${esc(target.term)}</strong><small>${esc(target.meaning)}</small></p><i>${target.kind === "phrase" ? "短语" : "单词"}</i></div>`,
      )
      .join("")}</div></details>`;
  }

  function listPage() {
    if (!readings)
      return '<div class="reading-loading">正在整理你的复习短文…</div>';
    return `${heading("YOUR REVIEW READING SHELF", "复习短文", "每次生成都会保存为独立文章。旧文章可以反复精读、挖空和背诵，不会被下一篇覆盖。")}
      <section class="reading-library-summary"><div><span class="eyebrow">SAVED FOR ANOTHER PASS</span><h2>${readings.length}<small>篇已保存短文</small></h2></div><p>下一篇短文会继续根据届时已经学过的词汇生成，并作为新的记录加入这里。</p></section>
      <div class="reading-list">${readings
        .map(
          (item, index) =>
            `<article class="reading-list-item"><span class="reading-list-number">${String(index + 1).padStart(2, "0")}</span><div class="reading-list-title"><span class="eyebrow">${esc(item.topic)} · ${esc(item.level)}</span><h2>${esc(item.title)}</h2><p>${esc(item.englishTitle)}</p><small>${esc(item.subtitle)}</small></div><dl><div><dt>${item.stats.covered}</dt><dd>目标词条</dd></div><div><dt>${item.paragraphCount}</dt><dd>段落</dd></div><div><dt>${item.progress.completions}</dt><dd>已回顾</dd></div></dl><button class="button outline" data-rr="open" data-id="${esc(item.id)}">打开复习</button><time>${esc(new Date(item.createdAt).toLocaleDateString("zh-CN"))}</time></article>`,
        )
        .join("")}</div>`;
  }

  function page() {
    if (!reading) return listPage();
    const completed = reading.progress.completions;
    return `${heading("RECALL THROUGH A WHOLE STORY", esc(reading.title), "先理解完整观点，再通过挖空和中译英把词汇主动找回来。", '<button class="text-button" data-rr="back">← 返回短文列表</button>')}
      <section class="reading-cover">
        <div><span class="eyebrow">PERSONAL REVIEW READING · ${esc(reading.level)}</span><h2>${esc(reading.englishTitle)}</h2><p>${esc(reading.subtitle)}</p></div>
        <dl><div><dt>${reading.stats.covered}</dt><dd>已学词条</dd></div><div><dt>${reading.stats.words}</dt><dd>单词</dd></div><div><dt>${reading.stats.phrases}</dt><dd>短语</dd></div><div><dt>${reading.stats.wordCount}</dt><dd>英文词数</dd></div></dl>
      </section>
      <p class="reading-coverage">本篇生成时从已学词汇中收录了 <strong>${reading.stats.covered} / ${reading.stats.learned}</strong> 个词条。高覆盖不等于一次必须全部背完，可以按段完成。</p>
      ${controls()}
      <article class="review-reading mode-${mode}">${reading.paragraphs.map(paragraph).join("")}</article>
      ${vocabulary()}
      <section class="reading-finish"><div><span class="eyebrow">FINISH THIS PASS</span><h2>读完，也试着主动想起了。</h2><p>这里仅记录短文回顾次数，不改变每个单词原有的 FSRS 到期时间。</p></div><button class="button primary" data-rr="complete">完成本次回顾</button><span>已完成 ${completed} 次${reading.progress.lastCompletedAt ? ` · 最近 ${esc(new Date(reading.progress.lastCompletedAt).toLocaleString("zh-CN"))}` : ""}</span></section>`;
  }

  async function click(button) {
    const action = button.dataset.rr;
    if (!action) return false;
    if (busy) return true;
    switch (action) {
      case "open":
        busy = true;
        button.disabled = true;
        try {
          resetReader();
          reading = await api("review-reading/get", {
            id: button.dataset.id,
          });
          render();
          window.scrollTo(0, 0);
        } catch (error) {
          toast(error.message);
          button.disabled = false;
        } finally {
          busy = false;
        }
        break;
      case "back":
        reading = null;
        resetReader();
        render();
        window.scrollTo(0, 0);
        break;
      case "mode":
        mode = button.dataset.mode;
        revealedTerms.clear();
        revealedParagraphs.clear();
        render();
        break;
      case "translations":
        showTranslations = !showTranslations;
        render();
        break;
      case "term": {
        const term = button.dataset.term;
        if (revealedTerms.has(term)) revealedTerms.delete(term);
        else revealedTerms.add(term);
        render();
        break;
      }
      case "all-terms":
        if (revealedTerms.size === reading.targets.length)
          revealedTerms.clear();
        else
          for (const target of reading.targets)
            revealedTerms.add(target.term.toLowerCase());
        render();
        break;
      case "paragraph": {
        const index = Number(button.dataset.index);
        if (revealedParagraphs.has(index)) revealedParagraphs.delete(index);
        else revealedParagraphs.add(index);
        render();
        break;
      }
      case "all-paragraphs":
        if (revealedParagraphs.size === reading.paragraphs.length)
          revealedParagraphs.clear();
        else
          reading.paragraphs.forEach((_, index) =>
            revealedParagraphs.add(index),
          );
        render();
        break;
      case "listen":
        speak(reading.paragraphs.map((item) => item.en).join(" "));
        break;
      case "complete":
        busy = true;
        button.disabled = true;
        try {
          reading.progress = await api("review-reading/complete", {
            id: reading.id,
          });
          const saved = readings.find((item) => item.id === reading.id);
          if (saved) saved.progress = reading.progress;
          render();
          toast("本次短文回顾已记录");
        } catch (error) {
          toast(error.message);
          button.disabled = false;
        } finally {
          busy = false;
        }
        break;
    }
    return true;
  }

  return { enter, page, click };
}
