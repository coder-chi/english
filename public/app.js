import { createNotebook } from "./notebook.js";
import { createKnowledge } from "./knowledge.js";
import { createReviewReading } from "./review-reading.js";
import { createListening } from "./listening.js";
import { createLearningHub } from "./learning-hub.js";
const app = document.querySelector("#app");
const dialog = document.querySelector("#reader");
const articleImportDialog = document.querySelector("#article-import");
const sourceReaderDialog = document.querySelector("#source-reader");
let data;
let tab = location.hash.slice(1) || "today";
let filter = "全部";
let sourceScope = "all";
let search = "";
let revealed = false;
let reviewMode = "meaning";
let dictationAnswer = null;
let currentLesson;
let currentSource;
let translated = false;
let toastTimer;
let busy = false;
const icons = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  pen: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
  repeat:
    '<path d="M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4 4m-4-4 4-4"/>',
  book: '<path d="M12 5v16M3 3c4 0 6 0 9 2 3-2 5-2 9-2v16c-4 0-6 0-9 2-3-2-5-2-9-2Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  audio:
    '<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  note: '<path d="M4 4h16v13H8l-4 4Zm4 5h8M8 13h5"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
}
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? esc(url.href) : "#";
  } catch {
    return "#";
  }
}
function toast(message) {
  const node = document.querySelector("#toast");
  (document.querySelector("dialog[open]") || document.body).append(node);
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 4500);
}
async function api(path, input) {
  const response = await fetch(
    `/api/${path}`,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result;
}
async function refresh() {
  data = await api("state");
}
function resetReviewCard() {
  revealed = false;
  dictationAnswer = null;
}
function normalizeDictation(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
const nav = [
  ["today", "sun", "今日学习"],
  ["explore", "compass", "自由探索"],
  ["records", "bookmark", "我的积累"],
  ["puzzle", "pen", "语境拼图"],
  ["notebook", "book", "生词本"],
  ["books", "book", "词书"],
  ["words", "book", "统一词库"],
  ["sentences", "pen", "例句回顾"],
  ["reading", "book", "复习短文"],
  ["listening", "audio", "听力手册"],
  ["practice", "pen", "双向练习"],
  ["review", "repeat", "间隔复习"],
  ["discover", "compass", "发现内容"],
  ["create", "pen", "生成练习"],
  ["library", "book", "我的书架"],
];
if (!nav.some(([id]) => id === tab)) tab = "today";
async function navigate(nextTab, preserveKnowledge = false) {
  if (!nav.some(([id]) => id === nextTab)) return;
  tab = nextTab;
  history.replaceState(null, "", `#${tab}`);
  resetReviewCard();
  if (["records", "puzzle"].includes(nextTab)) {
    try {
      await learningHub.enter(nextTab);
    } catch (error) {
      toast(error.message);
    }
    if (tab !== nextTab) return;
  }
  if (nextTab === "books") {
    try {
      await notebook.reloadBookPreview();
    } catch (error) {
      toast(error.message);
    }
    if (tab !== nextTab) return;
  }
  if (["words", "sentences"].includes(nextTab) && !preserveKnowledge) {
    try {
      const loading = knowledge.enter(nextTab);
      render();
      await loading;
    } catch (error) {
      toast(error.message);
    }
    if (tab !== nextTab) return;
  }
  if (nextTab === "reading") {
    try {
      const loading = reviewReading.enter();
      render();
      await loading;
    } catch (error) {
      toast(error.message);
    }
    if (tab !== nextTab) return;
  }
  if (nextTab === "listening" && !preserveKnowledge) {
    try {
      const loading = listening.enter();
      render();
      await loading;
    } catch (error) {
      toast(error.message);
    }
    if (tab !== nextTab) return;
  }
  render();
  window.scrollTo(0, 0);
}
const notebook = createNotebook({
  getData: () => data,
  api,
  refresh,
  render,
  navigate,
  toast,
  speak,
  esc,
  icon,
  heading,
});
const knowledge = createKnowledge({
  api,
  refresh,
  getData: () => data,
  render,
  navigate,
  esc,
  heading,
  posTag: notebook.posTag,
  toast,
});
const reviewReading = createReviewReading({
  api,
  render,
  speak,
  esc,
  heading,
  toast,
});
const listening = createListening({
  api,
  render,
  navigate,
  esc,
  heading,
  toast,
  getData: () => data,
});
const learningHub = createLearningHub({
  api,
  render,
  navigate,
  esc,
  heading,
  notebook,
  toast,
  getData: () => data,
});

function render() {
  const due = data.dueCards.length;
  app.innerHTML = `
    <aside class="sidebar">
      <a href="#today" class="brand" aria-label="Small Steps 首页"><span class="brand-mark">s<span>·</span></span><span>small steps<small>ENGLISH, EVERY DAY.</small></span></a>
      <div class="sidebar-label">你的学习空间</div>
      <nav>${nav.map(([id, glyph, label]) => `<button data-tab="${id}" class="nav-item ${tab === id ? "active" : ""}" ${tab === id ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span>${id === "review" && due ? `<b>${due}</b>` : ""}</button>`).join("")}</nav>
      <div class="sidebar-note"><span class="little-star">✳</span><p>A little, every day.<br>It all adds up.</p><small>不用一口气走很远，<br>今天也前进一步。</small></div>
      <div class="profile"><span class="avatar">L</span><div>我的英语手册<small>本地个人学习空间</small></div><span class="online-dot"></span></div>
    </aside>
    <main>
      <header class="topbar"><span>MY LEARNING JOURNAL <i>/</i> ${nav.find((n) => n[0] === tab)[2]}</span><span class="date">${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span></header>
      <div class="page">${{ today: todayPage, explore: learningHub.explore, records: learningHub.recordsPage, puzzle: learningHub.puzzlePage, notebook: notebook.notebookPage, books: notebook.booksPage, words: knowledge.page, sentences: knowledge.page, reading: reviewReading.page, listening: listening.page, practice: notebook.practicePage, discover: discoverPage, create: createPage, review: reviewPage, library: libraryPage }[tab]()}</div>
      <footer>SMALL STEPS, BIG DIFFERENCE.<span>让英语，慢慢成为日常。</span></footer>
    </main>`;
}
function heading(eyebrow, title, description, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function lessonCard(lesson, index = 0) {
  return `<button class="lesson-card tone-${index % 3}" data-read="${esc(lesson.id)}">
    <div class="card-top"><span class="tag">${esc(lesson.topic)}</span><span class="muted">${esc(lesson.level)} · ${lesson.minutes} 分钟</span></div>
    <div class="card-number">0${index + 1}<span>${icon(index % 2 ? "pen" : "book")}</span></div>
    <h3>${esc(lesson.title)}</h3><p>${esc(lesson.subtitle)}</p>
    <div class="card-bottom"><span>${lesson.completedAt ? "✓ 已读完" : esc(lesson.kind)} · ${lesson.phrases.length} 个表达</span>${icon("arrow")}</div>
  </button>`;
}
function todayPage() {
  const featured = data.lessons.find((l) => !l.completedAt) || data.lessons[0];
  const due = data.dueCards.length;
  return `${learningHub.today()}
    <section class="notebook-entry-banner"><div><h3>也可以，从一篇阅读开始。</h3><p>${esc(featured.title)} · ${esc(featured.level)} · ${featured.minutes} 分钟</p></div><button class="button outline" data-read="${esc(featured.id)}">开始阅读</button></section>
    <section class="stats-grid" aria-label="学习统计">
      <div><span class="stat-icon">${icon("book")}</span><p>累计完成阅读<strong>${data.stats.completed}<small>篇</small></strong></p><span class="stat-note">每一篇都是积累</span></div>
      <div><span class="stat-icon">${icon("repeat")}</span><p>今天已复习<strong>${data.stats.reviewedToday}<small>次</small></strong></p><span class="stat-note">让表达留得更久</span></div>
      <div><span class="stat-icon">${icon("pen")}</span><p>收藏实用表达<strong>${data.stats.totalCards}<small>个</small></strong></p><span class="stat-note">属于你的词句库</span></div>
    </section>
    <div class="section-heading"><h2>接下来，读点什么 <span>CURATED FOR YOU</span></h2><button class="text-button" data-tab="library">查看全部 ${icon("arrow")}</button></div>
    <div class="lesson-grid">${data.lessons.slice(0, 3).map(lessonCard).join("")}</div>
    <section class="review-banner"><div class="review-banner-icon">${icon("repeat")}</div><div><h3>${due ? `${due} 个已学表达到期了。` : "当前没有到期复习。"}</h3><p>另有 ${data.stats.unlearnedCards} 个未学词，完成首次学习评分后才会加入复习。</p></div>${due ? `<button class="button outline" data-tab="review">开始复习 ${icon("arrow")}</button>` : `<button class="button outline" data-nb="learn-new">学新词 ${icon("arrow")}</button>`}</section>`;
}
function discoverPage() {
  const sources = data.sources
    .filter((s) => filter === "全部" || s.topic === filter)
    .filter(
      (s) =>
        sourceScope === "all" ||
        (sourceScope === "saved" && s.content) ||
        (sourceScope === "practiced" && s.practicedAt),
    )
    .filter((s) =>
      `${s.title} ${s.summary} ${s.content || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const savedCount = data.sources.filter((source) => source.content).length;
  const practicedCount = data.sources.filter(
    (source) => source.practicedAt,
  ).length;
  return `${heading("FOLLOW YOUR CURIOSITY", "从世界里，发现英语。", "同步公开资讯，也可以只挑一篇文章保存、分析、标注并完成精读。", '<div class="heading-actions"><button class="button outline" data-action="import-article">' + icon("bookmark") + ' 同步指定文章</button><button class="button primary" data-action="sync">刷新素材 ' + icon("repeat") + "</button></div>")}
    <div class="source-status"><span class="online-dot"></span>${data.discovery.syncedAt ? `最近同步 ${esc(new Date(data.discovery.syncedAt).toLocaleString("zh-CN"))}` : "等待首次同步"}<span>BBC World / Technology · 每小时自动同步</span></div>
    ${data.discovery.error ? `<div class="notice">部分来源同步失败：${esc(data.discovery.error)}。可稍后刷新，已有素材仍可阅读。</div>` : ""}
    <section class="article-ledger"><div><strong>${savedCount}</strong><span>篇已同步全文</span></div><div><strong>${practicedCount}</strong><span>篇已完成精读</span></div><p>文章正文与标注保存在本地数据库。没有模型密钥也能进行阅读分析与练习留痕。</p></section>
    <div class="filter-row"><div><div class="filters">${["全部", "生活", "科技"].map((f) => `<button data-filter="${f}" class="${filter === f ? "selected" : ""}">${f}</button>`).join("")}</div><div class="source-scopes">${[
      ["all", "全部素材"],
      ["saved", "已同步"],
      ["practiced", "已练习"],
    ]
      .map(
        ([value, label]) =>
          `<button data-source-scope="${value}" class="${sourceScope === value ? "selected" : ""}">${label}</button>`,
      )
      .join(
        "",
      )}</div></div><label class="search-box">⌕ <input id="source-search" placeholder="搜索标题、摘要或正文" value="${esc(search)}" aria-label="搜索素材"></label></div>
    <div class="source-grid">${sources.length ? sources.map((source) => `<article class="source-card ${source.content ? "source-saved" : ""}"><div class="card-top"><span class="source-publisher">${esc(source.publisher)}</span><span>${new Date(source.publishedAt).toLocaleDateString("zh-CN")}</span></div><div class="source-badges"><span class="tag">${esc(source.topic)} · ${source.content ? `${source.analysis?.level || "英语"} · ${source.analysis?.wordCount || 0} 词` : "资讯摘要"}</span>${source.practicedAt ? '<span class="practice-state">✓ 已练习</span>' : source.content ? '<span class="sync-state">已同步</span>' : ""}</div><h3>${source.url ? `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>` : esc(source.title)}</h3><p>${esc(source.summary)}</p><div class="source-bottom">${source.content ? `<button class="button outline" data-source-read="${esc(source.id)}">${icon("book")} 精读与标注</button>` : `<button class="button outline" data-source-import="${esc(source.id)}">${icon("bookmark")} 同步全文</button>`}<button class="text-button" data-generate-source="${esc(source.id)}">生成练习 ${icon("arrow")}</button></div></article>`).join("") : '<div class="empty"><span>◎</span><h3>暂时没有匹配的素材</h3><p>同步一篇指定文章，或调整筛选条件。</p></div>'}</div>
    <p class="fineprint">RSS 只提供标题和摘要。需要精读时再同步指定文章全文，避免无选择地保存大量内容；AI 练习仍是可选能力。</p>`;
}
function options(values, current) {
  return values
    .map((v) => `<option ${v === current ? "selected" : ""}>${v}</option>`)
    .join("");
}
function createPage() {
  return `${heading("MADE FOR YOUR EVERYDAY", "让内容，适合你。", "选一个话题和难度，生成一篇读得懂、用得上的英语练习。")}
    <div class="create-layout"><form id="generate-form" class="form-card"><div class="form-title"><span class="step-label">01 / PERSONALIZE</span><h2>今天想学些什么？</h2></div>
    <div class="form-row"><label>英语难度<select name="level">${options(["A2", "B1", "B2", "C1"], data.preferences.level)}</select><small>A2 基础 · B1 进阶 · B2 中高级 · C1 高级</small></label><label>感兴趣的主题<select name="topic">${options(["生活", "职场", "旅行", "科技"], data.preferences.topic)}</select><small>从熟悉的生活场景开始</small></label></div>
    <label>具体场景 <span class="muted">/ 可选</span><textarea name="prompt" maxlength="1000" rows="5" placeholder="例如：用英语向同事解释一个技术方案，或者在旅行中向当地人问路…"></textarea></label>
    <div class="form-actions"><button class="button primary" type="submit">生成我的练习 ${icon("arrow")}</button><button type="button" class="text-button" data-action="save-preferences">保存偏好</button></div>
    ${!data.aiEnabled ? '<div class="notice">AI 尚未连接。请在项目 .env 中配置模型接口和密钥，重启服务后即可生成。你可以先体验书架里的内置原创练习。</div>' : '<p class="fineprint">AI 内容可能有误；练习用于学习，不作为新闻事实来源。</p>'}</form>
    <aside class="generation-note"><span class="little-star">✳</span><h2>A lesson.<br>Made for you.</h2><p>每篇练习都包含</p><ul><li>一篇适合难度的英语短文</li><li>逐段中文翻译</li><li>实用表达与双语例句</li><li>一道阅读理解题</li></ul><div class="automation-status"><strong>${data.autoGenerate && data.aiEnabled ? "每日自动生成已开启" : "按自己的节奏学习"}</strong><p>${data.autoGenerate && data.aiEnabled ? "服务运行期间，每天按保存的偏好生成一篇练习。" : "开启 AUTO_GENERATE 并配置密钥后，服务每天自动准备一篇练习。"}</p>${data.automation.error ? `<p>${esc(data.automation.error)}</p>` : ""}</div></aside></div>`;
}
function reviewPage() {
  const card = data.dueCards[0];
  const dictationMatched =
    dictationAnswer !== null &&
    normalizeDictation(dictationAnswer) === normalizeDictation(card?.term);
  const learning = data.cards.filter(
    (c) => !c.familiar && c.learned_at != null,
  );
  const scheduleExplanation =
    card?.memory?.phase === "review"
      ? "当前是间隔复习，按钮时间由 FSRS 根据这张卡片的记忆历史计算。"
      : "当前是短期巩固，分钟数不是评分的固定含义；完成后才进入动态间隔复习。";
  return `${heading("MAKE IT STICK", "让学过的，真正留下。", "回想含义，或听音默写；核对之后，再按真实表现评分。")}
    <div class="memory-guide"><strong>一次想起，只是这次的表现。</strong><p>新词先做分钟级巩固，再逐渐拉长间隔；忘记后重新学习。FSRS 以约 90% 的回忆成功率为排程目标，这是模型目标，不是已掌握比例。</p><small>忘记或看答案才知道 → 忘记了；费力但独立答对 → 想起很难；正常答对 → 想起来了；毫不费力 → 轻松想起。</small></div>
    <div class="notebook-entry-banner"><div><h3>这里只复习学过且到期的词。</h3><p>未学习 ${data.stats.unlearnedCards} 个 · 已学到期 ${data.dueCards.length} 个。导入词书不会增加待复习数量。</p></div><button class="button outline" data-nb="learn-new">学新词 ${icon("arrow")}</button><button class="text-button" data-nb="review-due">双向复习已学词 →</button></div>
    ${
      card
        ? `<div class="review-mode-switch" role="group" aria-label="复习方式"><button data-review-mode="meaning" class="${reviewMode === "meaning" ? "active" : ""}" aria-pressed="${reviewMode === "meaning"}">释义回想</button><button data-review-mode="dictation" class="${reviewMode === "dictation" ? "active" : ""}" aria-pressed="${reviewMode === "dictation"}">听音默写</button></div>
        <div class="review-meta"><span>待复习 <strong>${data.dueCards.length}</strong> 个表达</span><span>今天已复习 ${data.stats.reviewedToday} 次</span></div><section class="flashcard ${reviewMode === "dictation" ? "dictation-card" : ""}">${
          reviewMode === "dictation"
            ? `<span class="step-label">LISTEN, THEN WRITE</span><button class="dictation-audio-button" data-speak="${esc(card.term)}" aria-label="播放默写音频">${icon("audio")}<span>播放发音</span></button><h2 class="dictation-prompt">听音后，写下英文</h2>${
                revealed
                  ? `<div class="dictation-result ${dictationMatched ? "correct" : "incorrect"}"><span>你的答案</span><strong>${dictationAnswer ? esc(dictationAnswer) : "未作答"}</strong><p>${dictationMatched ? "拼写一致" : "请对照正确拼写"}</p></div><div class="flash-answer"><h3 class="answer-term">${esc(card.term)}</h3>${notebook.posTag(card.part_of_speech)}<p>${esc(card.meaning)}</p>${card.example ? `<p class="dictation-example">${esc(card.example)}</p>` : ""}</div>`
                  : '<form id="review-dictation" class="dictation-form"><label class="sr-only" for="review-dictation-input">默写答案</label><input id="review-dictation-input" name="answer" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="160" placeholder="输入听到的英文…" required><div><button class="button primary" type="submit">核对拼写</button><button class="text-button" type="button" data-action="dictation-reveal">暂时想不起来</button></div></form>'
              }`
            : `<span class="step-label">RECALL BEFORE YOU REVEAL</span><button class="audio-button" data-speak="${esc(card.term)}" aria-label="朗读表达">${icon("audio")}</button><h2>${esc(card.term)}</h2><p class="example">${esc(card.example)}</p>${revealed ? `<div class="flash-answer"><h3>${esc(card.meaning)}</h3>${notebook.posTag(card.part_of_speech)}<p>${esc(card.translation)}</p></div>` : '<div class="flash-hint">试着想一想：它是什么意思？你会在哪个场景用到？</div>'}`
        }<p class="card-origin">来自 ${esc(data.lessons.find((l) => l.id === card.lesson_id)?.title || "我的收藏")}</p></section>
    ${
      revealed
        ? `<div class="rating-grid">${[
            ["again", "忘记了"],
            ["hard", "想起很难"],
            ["good", "想起来了"],
            ["easy", "轻松想起"],
          ]
            .map(
              ([rating, label]) =>
                `<button data-rating="${rating}" data-card="${card.id}" data-revision="${data.reviewPreview.revision}" class="rating ${rating}"><strong>${label}</strong><span>${esc(data.reviewPreview.options[rating].label)}</span></button>`,
            )
            .join("")}</div>`
        : reviewMode === "meaning"
          ? '<div class="center"><button class="button primary reveal-button" data-action="reveal">显示答案 <span>↵</span></button></div>'
          : ""
    }<p class="practice-tip">${esc(card.memory.label)} · ${scheduleExplanation} 四档评分都不会自动标记熟悉。</p><div class="familiar-practice-action"><button class="text-button" data-nb="familiar" data-id="${card.id}" data-value="true">标记熟悉</button><span>仅用于你确定无需再复习的词，将停止出题</span></div>`
        : `<div class="empty review-empty"><span>${icon("check")}</span><h2>当前没有到期复习</h2><p>${learning.length ? `下次复习：${esc(new Date(Math.min(...learning.map((c) => c.due_at))).toLocaleString("zh-CN"))}` : data.stats.unlearnedCards ? "新词还未开始学习，不会进入复习队列。请先从“学新词”开始。" : "没有需要复习的已学词；可在生词本中管理词条。"}</p><button class="button primary" data-tab="notebook">打开生词本 ${icon("arrow")}</button></div>`
    }
    <div class="review-explainer">回想 → 检查 → 评分 → 到期再见<span>忘记也是学习的一部分。</span></div>`;
}
function libraryPage() {
  return `${heading("YOUR GROWING COLLECTION", "把积累，放在这里。", `${data.lessons.length} 篇阅读内容，${data.cards.length} 个收藏表达。每一点进步都有迹可循。`)}
    <div class="lesson-grid library-grid">${data.lessons.map(lessonCard).join("")}</div>
    <div class="section-heading"><h2>我的表达库 <span>WORDS TO KEEP</span></h2><button class="text-button" data-tab="notebook">查看全部 ${data.cards.length} 条 →</button></div>
    ${
      data.cards.length
        ? `<p class="fineprint">显示前 50 条，全部词条可在生词本中搜索和管理。</p><div class="phrase-list">${data.cards
            .slice(0, 50)
            .map(
              (card) =>
                `<div><strong>${esc(card.term)}${notebook.posTag(card.part_of_speech)}</strong><span>${esc(card.meaning)}</span><small>${card.familiar ? "已熟悉" : card.learned_at == null ? "未学习" : card.due_at <= Date.now() ? "待复习" : new Date(card.due_at).toLocaleDateString("zh-CN") + " 复习"}</small></div>`,
            )
            .join("")}</div>`
        : '<div class="empty compact"><p>阅读时点击“收藏表达”，让值得记住的句子留在这里。</p></div>'
    }`;
}

function openReader(id) {
  currentLesson = data.lessons.find((l) => l.id === id);
  if (!currentLesson) return;
  translated = false;
  renderReader();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function renderReader() {
  const l = currentLesson;
  document.querySelector("#reader-content").innerHTML =
    `<div class="reader-toolbar"><span>THE READING ROOM</span><div><button class="text-button" data-action="translate">${translated ? "隐藏翻译" : "显示翻译"}</button><button class="audio-button" data-action="read-aloud" aria-label="朗读全文">${icon("audio")}</button><button class="close-button" data-action="close" aria-label="关闭阅读">×</button></div></div>
    <article class="reader-article"><div class="eyebrow">${esc(l.topic)} / ${esc(l.level)} / ${l.minutes} MIN READ / ${esc(l.kind)}</div><h1>${esc(l.title)}</h1><p class="reader-subtitle">${esc(l.subtitle)}</p>
    ${l.source ? `<p class="source-reference">参考摘要：<a href="${safeUrl(l.source.url)}" target="_blank" rel="noopener noreferrer">${esc(l.source.publisher)} ↗</a> · 根据摘要启发创作</p>` : ""}
    <div class="paragraphs">${l.paragraphs.map((p) => `<p class="english-paragraph">${esc(p.en)}</p>${translated ? `<p class="translation">${esc(p.zh)}</p>` : ""}`).join("")}</div>
    <section class="reader-phrases"><div class="section-heading"><h2>值得带走的表达</h2><button class="text-button" data-collect-all="${esc(l.id)}">全部收藏 +</button></div>${l.phrases
      .map((p) => {
        const saved = data.cards.some(
          (c) => c.lesson_id === l.id && c.term === p.term,
        );
        return `<div class="phrase"><div><strong>${esc(p.term)}</strong>${notebook.posTag(p.partOfSpeech)}<span>${esc(p.meaning)}</span><p>${esc(p.example)}</p></div><button class="small-button" data-collect="${esc(p.term)}" ${saved ? "disabled" : ""}>${saved ? "✓ 已收藏" : "+ 收藏"}</button></div>`;
      })
      .join("")}</section>
    <section class="quiz"><span class="step-label">QUICK CHECK</span><h3>${esc(l.quiz.question)}</h3>${l.quiz.options.map((option, i) => `<button data-answer="${i}"><span>${String.fromCharCode(65 + i)}</span>${esc(option)}</button>`).join("")}<div id="quiz-feedback" role="status"></div></section>
    <button class="button primary complete-button" data-complete="${esc(l.id)}">${l.completedAt ? "已完成阅读 ✓" : "完成这次阅读"} ${icon("check")}</button></article>`;
}
function openArticleImport(source = null) {
  articleImportDialog.innerHTML = `<form id="article-import-form" class="article-import-form">
    <div class="reader-toolbar"><span>SYNC ONE ARTICLE</span><button type="button" class="close-button" data-action="close-article-import" aria-label="关闭同步文章">×</button></div>
    <div class="article-import-body"><span class="step-label">SAVE FOR CLOSE READING</span><h2>${source ? "把这篇文章同步进来" : "同步一篇指定文章"}</h2><p>粘贴英文正文即可保存并自动分析。标题、来源与原文链接会一起保留。</p>
    <input type="hidden" name="sourceId" value="${esc(source?.id || "")}">
    <div class="form-row"><label>文章标题<input name="title" maxlength="300" required value="${esc(source?.title || "")}"></label><label>主题<select name="topic">${options(topicsForArticles, source?.topic || "生活")}</select></label></div>
    <div class="form-row"><label>来源名称<input name="publisher" maxlength="120" value="${esc(source?.publisher || "")}" placeholder="例如 BBC News"></label><label>原文链接<input name="url" type="url" value="${esc(source?.url || "")}" placeholder="https://..."></label></div>
    <label>英文正文<textarea name="content" minlength="80" maxlength="80000" required rows="14" placeholder="Paste the article text here. Keep paragraph breaks so the reading view stays clear.">${esc(source?.content || "")}</textarea><small>支持最多 80,000 个字符。系统仅分析并保存这篇指定文章。</small></label>
    <div class="form-actions"><button class="button primary" type="submit">${icon("bookmark")} 保存并分析</button><button class="text-button" type="button" data-action="close-article-import">取消</button></div></div>
  </form>`;
  articleImportDialog.showModal();
}
const topicsForArticles = ["生活", "职场", "旅行", "科技"];
function annotatedParagraph(text, annotations) {
  const ranges = [];
  for (const annotation of annotations) {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(annotation.text, from);
      if (start < 0) break;
      ranges.push({
        start,
        end: start + annotation.text.length,
        annotation,
      });
      from = start + annotation.text.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let html = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    html += esc(text.slice(cursor, range.start));
    html += `<mark title="${esc(range.annotation.note || "我的标注")}">${esc(text.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }
  return html + esc(text.slice(cursor));
}
function openSourceReader(id) {
  currentSource = data.sources.find((source) => source.id === id);
  if (!currentSource?.content) return;
  renderSourceReader();
  sourceReaderDialog.showModal();
  sourceReaderDialog.scrollTop = 0;
}
function renderSourceReader() {
  const source = currentSource;
  const analysis = source.analysis;
  const annotations = source.annotations || [];
  document.querySelector("#source-reader-content").innerHTML = `
    <div class="reader-toolbar"><span>ARTICLE WORKSPACE</span><div><button class="audio-button" data-action="read-source" aria-label="朗读文章">${icon("audio")}</button><button class="close-button" data-action="close-source-reader" aria-label="关闭文章精读">×</button></div></div>
    <article class="source-reader-article"><header><div class="eyebrow">${esc(source.topic)} / ${esc(analysis.level)} / ${analysis.minutes} MIN READ</div><h1>${esc(source.title)}</h1><p>${esc(source.publisher)}${source.url ? ` · <a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">查看原文 ↗</a>` : ""}</p></header>
    <section class="article-analysis" aria-label="文章分析"><div><strong>${analysis.wordCount}</strong><span>词</span></div><div><strong>${analysis.uniqueWords}</strong><span>不同词形</span></div><div><strong>${analysis.paragraphCount}</strong><span>段落</span></div><div><strong>${analysis.level}</strong><span>估算难度</span></div></section>
    <section class="analysis-notes"><div><span class="step-label">KEYWORDS</span><p>${analysis.keywords.map((item) => `<span class="keyword">${esc(item.term)} <small>${item.count}</small></span>`).join("") || "暂无足够信息"}</p></div><div><span class="step-label">KEY SENTENCES</span><ol>${analysis.keySentences.map((sentence) => `<li>${esc(sentence)}</li>`).join("") || "<li>文章较短，建议直接通读全文。</li>"}</ol></div></section>
    <div class="article-workspace"><section class="article-copy" aria-label="文章正文">${source.content
      .split(/\n\s*\n/)
      .map(
        (paragraph) =>
          `<p>${annotatedParagraph(paragraph.replace(/\s+/g, " ").trim(), annotations)}</p>`,
      )
      .join("")}</section>
    <aside class="annotation-panel"><span class="step-label">MY ANNOTATIONS</span><h2>选中原文，留下理解。</h2><form id="annotation-form"><label>选中的内容<textarea id="annotation-text" name="text" required rows="3" maxlength="600" placeholder="在左侧正文中选中单词或句子"></textarea></label><label>我的理解或疑问<textarea name="note" rows="4" maxlength="1000" placeholder="释义、语法、为什么值得记住…"></textarea></label><button class="button outline" type="submit">${icon("note")} 保存标注</button></form><div class="annotation-list">${annotations.map((item) => `<div><q>${esc(item.text)}</q>${item.note ? `<p>${esc(item.note)}</p>` : ""}<button class="text-button" data-remove-annotation="${esc(item.id)}">删除</button></div>`).join("") || '<p class="fineprint">还没有标注。选中正文后，选区会自动出现在这里。</p>'}</div></aside></div>
    <div class="article-complete"><div><strong>${source.practicedAt ? "这篇文章已经练习过。" : "完成阅读与标注后，记下这次练习。"}</strong><p>${source.practicedAt ? esc(new Date(source.practicedAt).toLocaleString("zh-CN")) : "完成状态会永久保留，方便以后筛选与回顾。"}</p></div><button class="button primary" data-complete-source="${esc(source.id)}" ${source.practicedAt ? "disabled" : ""}>${source.practicedAt ? "✓ 已完成精读" : "标记为已练习"} ${icon("check")}</button></div>
    </article>`;
}
function speak(text) {
  if (!("speechSynthesis" in window)) return toast("当前浏览器不支持朗读。");
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  utterance.onerror = () => toast("朗读不可用，请检查浏览器语音支持。");
  speechSynthesis.speak(utterance);
}

document.addEventListener("click", async (event) => {
  if (event.target.closest(".brand")) {
    event.preventDefault();
    navigate("today");
    return;
  }
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const d = button.dataset;
  try {
    if (d.hub) {
      await learningHub.click(button);
      return;
    }
    if (await listening.click(button)) return;
    if (await reviewReading.click(button)) {
      return;
    }
    if (await knowledge.click(button)) {
      return;
    }
    if (d.nb === "familiar") resetReviewCard();
    if (await notebook.click(button)) return;
    if (d.tab) {
      if (d.tab === "practice") notebook.openPracticeSetup();
      navigate(d.tab);
    }
    if (d.read) openReader(d.read);
    if (d.filter) {
      filter = d.filter;
      render();
    }
    if (d.sourceScope) {
      sourceScope = d.sourceScope;
      render();
    }
    if (d.speak) speak(d.speak);
    if (d.action === "close") dialog.close();
    if (d.action === "import-article") openArticleImport();
    if (d.action === "close-article-import") articleImportDialog.close();
    if (d.action === "close-source-reader") sourceReaderDialog.close();
    if (d.action === "translate") {
      translated = !translated;
      renderReader();
    }
    if (d.action === "read-aloud")
      speak(currentLesson.paragraphs.map((p) => p.en).join(" "));
    if (d.action === "read-source") speak(currentSource.content);
    if (d.action === "reveal") {
      revealed = true;
      render();
    }
    if (d.action === "dictation-reveal") {
      dictationAnswer = "";
      revealed = true;
      render();
    }
    if (d.reviewMode) {
      reviewMode = d.reviewMode;
      resetReviewCard();
      render();
    }
    if (d.action === "sync") {
      button.disabled = true;
      button.textContent = "正在同步…";
      const result = await api("discover", {});
      await refresh();
      render();
      toast(
        result.count
          ? `已同步 ${result.count} 条素材`
          : "同步暂未成功，请查看页面提示",
      );
    }
    if (d.action === "save-preferences") {
      const form = new FormData(document.querySelector("#generate-form"));
      await api("preferences", {
        level: form.get("level"),
        topic: form.get("topic"),
      });
      await refresh();
      toast("学习偏好已保存");
    }
    if (d.sourceImport)
      openArticleImport(
        data.sources.find((source) => source.id === d.sourceImport),
      );
    if (d.sourceRead) openSourceReader(d.sourceRead);
    if (d.generateSource)
      await generateLesson({ sourceId: d.generateSource }, button);
    if (d.completeSource) {
      await api("articles/complete", { sourceId: d.completeSource });
      await refresh();
      currentSource = data.sources.find(
        (source) => source.id === d.completeSource,
      );
      render();
      renderSourceReader();
      toast("已记录这次文章练习");
    }
    if (d.removeAnnotation) {
      await api("articles/annotations/remove", {
        sourceId: currentSource.id,
        annotationId: d.removeAnnotation,
      });
      await refresh();
      currentSource = data.sources.find(
        (source) => source.id === currentSource.id,
      );
      renderSourceReader();
      toast("标注已删除");
    }
    if (d.collect || d.collectAll) {
      button.disabled = true;
      await api("collect", {
        lessonId: currentLesson.id,
        term: d.collect || undefined,
      });
      await refresh();
      render();
      renderReader();
      toast("已加入间隔复习");
    }
    if (d.complete) {
      await api("complete", { lessonId: d.complete });
      await refresh();
      render();
      dialog.close();
      toast("又积累了一篇，做得好。");
    }
    if (d.answer !== undefined) {
      const quiz = currentLesson.quiz;
      const correct = Number(d.answer) === quiz.answer;
      document.querySelectorAll("[data-answer]").forEach((b) => {
        b.disabled = true;
        if (Number(b.dataset.answer) === quiz.answer)
          b.classList.add("correct");
      });
      if (!correct) button.classList.add("incorrect");
      document.querySelector("#quiz-feedback").textContent =
        `${correct ? "回答正确！" : "再看一下："} ${quiz.explanation}`;
    }
    if (d.rating) {
      document.querySelectorAll("[data-rating]").forEach((b) => {
        b.disabled = true;
      });
      await api("review", {
        cardId: Number(d.card),
        rating: d.rating,
        revision: Number(d.revision),
      });
      await refresh();
      resetReviewCard();
      render();
    }
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    if (d.action === "sync") button.textContent = "刷新素材";
    if (d.rating) {
      await refresh().catch(() => {});
      resetReviewCard();
      render();
    }
  }
});
async function generateLesson(input, button) {
  if (busy) return toast("正在生成，请稍候。");
  busy = true;
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "正在创作，请稍候…";
  try {
    const lesson = await api("generate", input);
    await refresh();
    render();
    openReader(lesson.id);
    toast("新练习已经准备好了");
  } finally {
    busy = false;
    button.disabled = false;
    button.innerHTML = original;
  }
}
document.addEventListener("submit", async (event) => {
  if (event.target.id === "review-dictation") {
    event.preventDefault();
    dictationAnswer = new FormData(event.target).get("answer");
    revealed = true;
    render();
    return;
  }
  if (event.target.id === "article-import-form") {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(event.target));
      if (!input.sourceId) delete input.sourceId;
      const source = await api("articles/save", input);
      await refresh();
      render();
      articleImportDialog.close();
      openSourceReader(source.id);
      toast("文章已同步并完成本地分析");
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
    return;
  }
  if (event.target.id === "annotation-form") {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(event.target));
      await api("articles/annotate", {
        sourceId: currentSource.id,
        ...input,
      });
      await refresh();
      currentSource = data.sources.find(
        (source) => source.id === currentSource.id,
      );
      renderSourceReader();
      toast("标注已保存");
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
    return;
  }
  if (event.target.matches("[data-listening-form]")) {
    event.preventDefault();
    await listening.submit(event.target);
    return;
  }
  if (event.target.id === "puzzle-answer") {
    event.preventDefault();
    await learningHub.submit(event.target);
    return;
  }
  if (
    event.target.matches("#knowledge-filter, #sentence-form, #association-form")
  ) {
    event.preventDefault();
    await knowledge.submit(event.target);
    return;
  }
  if (
    event.target.matches(
      "#book-filter-form, .book-page-jump, #card-form, #category-add, .category-edit, #practice-setup, #practice-answer, #reminder-form",
    )
  ) {
    event.preventDefault();
    await notebook.submit(event.target);
    if (tab === "words") {
      await knowledge.refreshDetail().catch((error) => toast(error.message));
      render();
    }
    return;
  }
  if (event.target.id !== "generate-form") return;
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.target));
  try {
    await generateLesson(input, event.target.querySelector("[type=submit]"));
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("input", (event) => {
  notebook.input(event);
  learningHub.input(event);
  if (event.target.id === "source-search") {
    const position = event.target.selectionStart;
    search = event.target.value;
    render();
    const input = document.querySelector("#source-search");
    input.focus();
    input.setSelectionRange(position, position);
  }
});
document.addEventListener("mouseup", () => {
  if (!sourceReaderDialog.open) return;
  const selection = getSelection();
  const anchor = selection?.anchorNode?.parentElement;
  const focus = selection?.focusNode?.parentElement;
  if (
    !selection ||
    selection.isCollapsed ||
    !anchor?.closest(".article-copy") ||
    !focus?.closest(".article-copy")
  )
    return;
  const text = selection.toString().replace(/\s+/g, " ").trim().slice(0, 600);
  if (!text || !currentSource.content.includes(text)) return;
  const input = document.querySelector("#annotation-text");
  input.value = text;
});
document.addEventListener("change", notebook.change);
window.addEventListener("hashchange", () => {
  navigate(location.hash.slice(1) || "today");
});
dialog.addEventListener("close", () => {
  document.body.append(document.querySelector("#toast"));
  if ("speechSynthesis" in window) speechSynthesis.cancel();
});
for (const modal of [articleImportDialog, sourceReaderDialog])
  modal.addEventListener("close", () => {
    document.body.append(document.querySelector("#toast"));
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  });
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    tab === "review" &&
    !revealed &&
    !dialog.open &&
    event.target === document.body &&
    data?.dueCards.length
  ) {
    revealed = true;
    render();
  }
});
setInterval(async () => {
  if (
    document.hidden ||
    busy ||
    document.querySelector("dialog[open]") ||
    revealed ||
    document.activeElement?.id === "review-dictation-input" ||
    tab === "practice"
  )
    return;
  try {
    await refresh();
    if (tab === "today" || tab === "review") render();
  } catch {
    /* 后台刷新失败保留当前内容，主动操作会展示错误。 */
  }
}, 60000);
document.addEventListener("input", (event) =>
  listening.input(event.target.form),
);
document.addEventListener("change", (event) =>
  listening.input(event.target.form),
);
setInterval(() => notebook.remind(), 60000);
try {
  await refresh();
  await notebook.restore();
  if (["words", "sentences"].includes(tab)) await knowledge.enter(tab);
  if (tab === "reading") await reviewReading.enter();
  if (tab === "listening") await listening.enter();
  if (["puzzle", "records"].includes(tab)) await learningHub.enter(tab);
  render();
  notebook.remind();
} catch {
  app.innerHTML =
    '<div class="loading">暂时无法打开手册<span>请确认服务已启动，然后刷新页面重试。</span></div>';
}
