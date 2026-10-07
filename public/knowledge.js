import { renderAssociations, associationForm } from "./associations.js";

export function createKnowledge({
  api,
  getData,
  refresh,
  render,
  navigate,
  esc,
  heading,
  posTag,
  toast,
}) {
  let active = "words";
  let detail = null;
  let result = null;
  let recall = null;
  let answer = null;
  let busy = false;
  let loadVersion = 0;
  let filters = { query: "", bookId: "", scope: "all", wordId: "", page: 1 };
  const bookOptions = () =>
    `<option value="">全部词书</option>${getData()
      .wordbooks.map(
        (b) =>
          `<option value="${b.id}" ${filters.bookId === b.id ? "selected" : ""}>${esc(b.title)}</option>`,
      )
      .join("")}`;
  const wordLink = (w) =>
    `<button class="word-link" data-k="word" data-word="${esc(w.id)}">${esc(w.term)} ↗</button>`;
  async function load() {
    const version = ++loadVersion;
    const next = await api(
      active === "words" ? "words/list" : "sentences/list",
      filters,
    );
    if (version !== loadVersion) return;
    result = next;
    filters.page = result.page;
  }
  async function enter(tab) {
    active = tab;
    detail = null;
    recall = null;
    answer = null;
    result = null;
    filters = { query: "", bookId: "", scope: "all", wordId: "", page: 1 };
    await load();
  }
  function filterForm() {
    return `<form id="knowledge-filter" class="book-filters"><label>搜索词条或例句<input name="query" maxlength="160" value="${esc(filters.query)}" placeholder="英文 / 中文关键词"></label><label>词书来源<select name="bookId">${bookOptions()}</select></label>${
      active === "sentences"
        ? `<label>回顾范围<select name="scope">${[
            ["all", "全部例句"],
            ["saved", "已收藏 / 待巩固"],
            ["due", "关联到期词"],
            ["unseen", "尚未回顾"],
          ]
            .map(
              ([v, label]) =>
                `<option value="${v}" ${filters.scope === v ? "selected" : ""}>${label}</option>`,
            )
            .join("")}</select></label>`
        : ""
    }<button type="submit" class="button outline">筛选</button></form>`;
  }
  function pager() {
    return `<div class="collection-pagination"><span>共 ${result.total} ${active === "words" ? "个统一词条" : "条例句"} · 第 ${result.page} / ${result.pages} 页</span><div><button class="button outline" data-k="page" data-page="${result.page - 1}" ${result.page <= 1 ? "disabled" : ""}>上一页</button><button class="button outline" data-k="page" data-page="${result.page + 1}" ${result.page >= result.pages ? "disabled" : ""}>下一页</button></div></div>`;
  }
  function sentenceCard(s, showChinese = true) {
    return `<article class="sentence-card"><div class="sentence-heading"><span class="eyebrow">WORDS IN CONTEXT</span><button class="text-button" data-k="save" data-id="${s.id}" data-saved="${s.saved ? "false" : "true"}">${s.saved ? "取消收藏" : "收藏例句"}</button></div><p class="sentence-english">${esc(s.english)}</p>${showChinese ? `<p class="sentence-chinese">${esc(s.chinese)}</p>` : ""}<button class="text-button" data-speak="${esc(s.english)}">朗读例句</button><div class="sentence-words">${s.words.map(wordLink).join("")}</div><p class="fineprint">来源：${esc(s.sources.join("；"))} · 已回顾 ${s.reviews} 次</p>${(s.listening || []).map((e) => `<button class="text-button" data-listen="open" data-id="${esc(e.id)}">回到听力：${esc(e.title)} ↗</button>`).join("")}</article>`;
  }
  function wordPage() {
    const groups = new Map();
    for (const source of detail.sources) {
      const key = `${source.meaning}|${source.pos}`;
      if (!groups.has(key)) groups.set(key, { ...source, labels: [] });
      groups.get(key).labels.push(source.label);
    }
    return `${heading("ONE WORD, MANY CONTEXTS", esc(detail.term), "同一词条汇总词书、释义、学习卡片与例句。", '<button class="text-button" data-k="back">← 返回统一词库</button>')}
      <section class="word-identity"><span class="eyebrow">YOUR SHARED VOCABULARY</span><p>${detail.books.length ? detail.books.map((b) => `<span class="tag">${esc(b.title)}</span>`).join(" ") : "个人词条 / 阅读表达"}</p><p>不同词书里的这个词使用同一词条编号。不同词义仍保留，学习卡片按释义记录掌握情况。</p></section>
      <div class="word-detail-grid"><section><h2>释义与来源</h2>${[...groups.values()].map((s) => `<div class="word-sense">${posTag(s.pos)}<p>${esc(s.meaning)}</p><small>${esc([...new Set(s.labels)].join("；"))}</small></div>`).join("") || '<p class="fineprint">该词来自你的学习卡片。</p>'}</section>
      <section><h2>我的学习记录</h2>${
        detail.cards
          .map(
            (c) =>
              `<div class="word-sense"><p>${esc(c.meaning)}</p>${posTag(c.part_of_speech)}<small>${c.archived ? "已归档" : c.familiar ? "已熟悉" : c.learned_at == null ? "未学习" : esc(c.memory.label)} · ${c.repetitions} 次排程评分</small><button class="text-button" data-nb="edit" data-id="${c.id}">编辑学习卡片</button></div>`,
          )
          .join("") ||
        `<p class="fineprint">还未加入学习。可从下列词书导入，已有相同英文与释义时共用卡片。</p>${detail.sources
          .filter((s) => s.book_id)
          .map(
            (s) =>
              `<button class="button outline" data-k="import" data-book="${s.book_id}" data-entry="${s.entry_id}">从 ${esc(detail.books.find((b) => b.id === s.book_id)?.title)} 加入</button>`,
          )
          .join("")}`
      }</section></div>
      ${renderAssociations(detail.associations, detail.id, esc)}
      ${associationForm(esc, detail.term)}
      ${detail.listening?.length ? `<section class="word-identity"><h2>在听力中遇见</h2>${detail.listening.map((e) => `<p><button class="word-link" data-listen="open" data-id="${esc(e.id)}">${esc(e.title)} ↗</button> <small>${esc(e.channel)}</small></p>`).join("")}</section>` : ""}
      <div class="section-heading"><h2>关联例句 <span>${detail.sentences.length} 条</span></h2><button class="button outline" data-k="word-recall" ${detail.sentences.length ? "" : "disabled"}>回顾这个词的例句</button></div>
      <div class="sentence-grid">${detail.sentences.map((s) => sentenceCard(s)).join("") || '<p class="empty">还没有关联例句，可以在下面添加。</p>'}</div>
      <details class="sentence-editor"><summary>+ 添加自己的例句，关联更多词</summary><form id="sentence-form" class="notebook-form"><label>英文例句<textarea name="english" maxlength="2000" required rows="3"></textarea></label><label>中文译文<textarea name="chinese" maxlength="2000" required rows="2"></textarea></label><label>同时关联其他词<input name="linkedTerms" placeholder="例如 education, opportunity（用逗号分隔）" maxlength="1600"></label><p class="fineprint">已关联 ${esc(detail.term)}。其他词须已存在于统一词库；短语可整体填写。</p><button class="button primary" type="submit">保存关联例句</button></form></details>`;
  }
  function page() {
    if (detail) return wordPage();
    if (recall)
      return `${heading("RECALL IN CONTEXT", "把意思，还原成一句话。", "先尝试说出或写出英文，再核对例句。", '<button class="text-button" data-k="stop">← 返回例句库</button>')}
      <section class="sentence-recall"><span class="tag">例句回顾</span><h2>${esc(recall.question)}</h2>${answer ? sentenceCard(answer, false) : `<label>我的表达<textarea id="sentence-draft" rows="3" placeholder="尝试写出英文，允许合理改写…"></textarea></label><button class="button primary" data-k="reveal">揭晓英文与关联词</button>`}
      ${answer ? `<div class="sentence-feedback"><button class="button outline" data-k="grade" data-rating="again">还需巩固</button><button class="button primary" data-k="grade" data-rating="good">本次能表达</button></div>` : ""}<p class="fineprint">“还需巩固”会收藏本句。例句表现单独记录，不会自动把关联单词全部标为记住。</p></section>`;
    if (!result) return '<p class="loading">正在整理词条与例句…</p>';
    return `${heading(active === "words" ? "ONE VOCABULARY, ALL YOUR BOOKS" : "SENTENCES WORTH REVISITING", active === "words" ? "统一词库" : "例句回顾", active === "words" ? "词书是选词集合。每个词都有自己的释义、来源与例句。" : "从熟悉的单词出发，在完整句子里回想、理解和表达。")}
      ${active === "sentences" ? '<p class="fineprint">首批收录原创精选例句及阅读例句，来源逐条标注。这里的精选例句不冒充名人名言或考试原题。</p>' : ""}
      ${active === "words" ? `<section class="association-discovery"><div><span class="eyebrow">ONE WORD LEADS TO ANOTHER</span><h2>相近的词，放在一起看。</h2><p>从“保护与保存”开始，对照意思、搭配和例句，也记下自己的联想。</p></div><div>${(result.associationExample || []).map(wordLink).join('<span aria-hidden="true">↔</span>')}</div></section>` : ""}
      ${filterForm()}${active === "sentences" ? `<button class="button primary" data-k="recall" ${!result.total ? "disabled" : ""}>开始例句回顾</button>` : ""}${pager()}
      ${active === "words" ? `<div class="unified-word-list">${result.items.map((w) => `<article>${wordLink(w)}<p>${esc(w.meanings.slice(0, 2).join("；"))}</p><small>${w.bookIds.length} 本词书 · ${w.sentenceCount} 条例句</small></article>`).join("")}</div>` : `<div class="sentence-grid">${result.items.map((s) => sentenceCard(s)).join("")}</div>`}
      ${!result.total ? '<p class="empty">暂无匹配内容，试试其他关键词或范围。</p>' : ""}${pager()}`;
  }
  async function click(button) {
    const action = button.dataset.k;
    if (!action) return false;
    if (busy) return true;
    busy = true;
    button.disabled = true;
    try {
      switch (action) {
        case "association-reset":
          render();
          document.querySelector(".association-editor").open = true;
          document
            .querySelector('#association-form [name="relatedTerm"]')
            .focus();
          break;
        case "association-edit": {
          const group = detail.associations.personal.find(
            (g) => g.id === button.dataset.id,
          );
          if (!group) break;
          const editor = document.querySelector(".association-editor");
          editor.open = true;
          const form = editor.querySelector("form");
          form.elements.relatedTerm.value = group.words.find(
            (w) => w.id !== detail.id,
          ).term;
          form.elements.type.value = group.type;
          form.elements.note.value = group.contrast;
          form.elements.relatedTerm.readOnly = true;
          form.elements.type.disabled = true;
          form.dataset.editType = group.type;
          form.elements.note.focus();
          editor.scrollIntoView({ block: "center" });
          break;
        }
        case "association-remove":
          detail.associations = await api("words/associations/remove", {
            wordId: detail.id,
            id: button.dataset.id,
          });
          render();
          toast("已移除这条个人联想");
          break;
        case "word":
          detail = await api("words/get", { wordId: button.dataset.word });
          document.querySelector("#notebook-dialog")?.close();
          recall = answer = null;
          active = "words";
          navigate("words", true);
          break;
        case "back":
          await enter("words");
          render();
          break;
        case "page":
          filters.page = Number(button.dataset.page);
          await load();
          render();
          break;
        case "save":
          await api("sentences/flag", {
            id: button.dataset.id,
            saved: button.dataset.saved === "true",
          });
          if (detail) detail = await api("words/get", { wordId: detail.id });
          else if (recall)
            answer = await api("sentences/reveal", { token: recall.token });
          else await load();
          render();
          break;
        case "word-recall":
          filters = {
            query: "",
            bookId: "",
            scope: "all",
            wordId: detail.id,
            page: 1,
          };
          detail = null;
          active = "sentences";
          recall = await api("sentences/start", filters);
          answer = null;
          navigate("sentences", true);
          break;
        case "recall":
          recall = await api("sentences/start", filters);
          answer = null;
          render();
          break;
        case "reveal":
          answer = await api("sentences/reveal", { token: recall.token });
          render();
          break;
        case "grade":
          await api("sentences/grade", {
            token: recall.token,
            rating: button.dataset.rating,
          });
          recall = answer = null;
          await load();
          render();
          toast("已记录例句回顾，单词复习计划保留");
          break;
        case "stop":
          recall = answer = null;
          await load();
          render();
          break;
        case "import":
          await api("books/import", {
            bookId: button.dataset.book,
            mode: "selected",
            entryIds: [button.dataset.entry],
          });
          await refresh();
          detail = await api("words/get", { wordId: detail.id });
          render();
          toast("已加入学习，相关词书共用已有卡片");
          break;
      }
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
    return true;
  }
  async function submit(form) {
    if (busy) return;
    busy = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(form));
      if (form.id === "knowledge-filter") {
        filters = { ...filters, ...input, page: 1 };
        await load();
      } else if (form.id === "association-form") {
        detail.associations = await api("words/associations/save", {
          wordId: detail.id,
          ...input,
          type: form.dataset.editType || input.type,
        });
        toast("联想已保存，两个词都能看到");
      } else {
        await api("sentences/save", {
          english: input.english,
          chinese: input.chinese,
          wordIds: [detail.id],
          linkedTerms: input.linkedTerms
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        });
        detail = await api("words/get", { wordId: detail.id });
        toast("例句和词条关联已保存");
      }
      render();
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  async function refreshDetail() {
    if (!detail) return;
    const id = detail.id;
    const next = await api("words/get", { wordId: id });
    if (detail?.id === id) detail = next;
  }
  return { enter, page, click, submit, refreshDetail };
}
