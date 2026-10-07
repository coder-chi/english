import { matchesProgress, summarizeProgress } from "./learning-progress.js";
import { renderAssociations } from "./associations.js";

export function createNotebook({
  getData,
  api,
  refresh,
  render,
  navigate,
  toast,
  speak,
  esc,
  icon,
  heading,
}) {
  const modal = document.querySelector("#notebook-dialog");
  let category = "all";
  let scope = "all";
  let kind = "all";
  let query = "";
  let sort = "newest";
  let hideMeanings = false;
  let session = null;
  let advancedOpen = false;
  let flowPreferences = {
    source: "all",
    direction: "zh-en",
    exercise: "flashcard",
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem("english.practice.preferences") || "{}",
    );
    if (typeof saved.source === "string") flowPreferences.source = saved.source;
    if (["en-zh", "zh-en", "mixed"].includes(saved.direction))
      flowPreferences.direction = saved.direction;
    if (["typing", "flashcard"].includes(saved.exercise))
      flowPreferences.exercise = saved.exercise;
  } catch {
    /* 存储不可用时仍可一键开始。 */
  }
  let operation = false;
  let source = "all";
  let preview = null;
  let previewCards = null;
  let notebookPageNumber = 1;
  let bookFilters = { query: "", section: "", status: "all", page: 1 };
  let bookScan = false;
  const selectedFamiliar = new Set();
  const notebookPageSize = 50;
  const selectedEntries = new Set();
  async function loadPreview(bookId = preview.id) {
    preview = await api("books/preview", { bookId, ...bookFilters });
    previewCards = getData().cards;
    bookFilters.page = preview.page;
    selectedEntries.clear();
    selectedFamiliar.clear();
  }
  function familiarSelection(value) {
    return preview.entries.filter(
      (e) => selectedFamiliar.has(e.id) && !e.archived && e.familiar !== value,
    );
  }
  function scanList(b) {
    return `<section class="book-scan" aria-label="快速标熟悉">
      <div class="book-scan-bar">
        <div><strong id="familiar-selection-count" role="status">已选 ${selectedFamiliar.size} 个</strong><small>仅当前页 · 翻页或筛选会清空勾选</small></div>
        <div class="book-scan-selection"><button class="button outline" data-nb="select-familiar-page" ${b.entries.some((e) => !e.archived) ? "" : "disabled"}>全选本页</button><button class="text-button" data-nb="clear-familiar-page">清空勾选</button></div>
        <button class="button primary" data-nb="bulk-familiar" ${familiarSelection(true).length ? "" : "disabled"}>标为熟悉</button>
        <button class="button outline" data-nb="bulk-restore" ${familiarSelection(false).length ? "" : "disabled"}>恢复学习</button>
        ${bookPageJump(b.page, b.pages)}
      </div>
      <div class="book-detail-actions"><span>本页 ${b.entries.length} 个词条 · 全选仅包含本页未归档词条</span></div>
      <p class="fineprint">只勾选已经掌握的词。未导入词会自动加入词库并标熟悉，不再进入学习和复习；相同英文与释义在其他已导入词书中同步生效。已归档词不参与标记。</p>
      ${pagination("book-page", b.page, b.pages, b.filtered)}
      <div class="book-scan-list">${
        b.entries
          .map(
            (e) => `<label class="book-scan-row">
        <input type="checkbox" data-familiar-entry="${esc(e.id)}" aria-label="选择 ${esc(e.term)}" ${e.archived ? "disabled" : ""} ${selectedFamiliar.has(e.id) ? "checked" : ""}>
        <strong>${esc(e.term)} <small>${esc(e.partOfSpeech || "")}</small></strong><span>${esc(e.meaning)}</span>
        <em class="${e.learningStatus}">${{ archived: "已归档", familiar: "已熟悉", learning: "正在学习", unlearned: "未学习" }[e.learningStatus]}</em>
      </label>`,
          )
          .join("") || '<p class="empty">没有匹配词条，请调整筛选条件。</p>'
      }</div>
      ${pagination("book-page", b.page, b.pages, b.filtered)}
      <p class="fineprint">误标后，可筛选“已熟悉”再批量恢复学习。学过的词进入待复习，未学词回到新词列表；历史记录保留。</p>
    </section>`;
  }
  function bookPageJump(page, pages) {
    return `<form class="book-page-jump"><label>第 <input aria-label="跳转页码" name="page" type="number" inputmode="numeric" min="1" max="${pages}" step="1" required value="${page}"> / ${pages} 页</label><button class="button outline" type="submit">跳转</button></form>`;
  }
  async function goToBookPage(page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > preview.pages)
      throw new Error(`请输入 1–${preview.pages} 之间的整数页码。`);
    if (page === preview.page) return;
    bookFilters.page = page;
    await loadPreview();
    render();
    document
      .querySelector(".book-detail-actions")
      ?.scrollIntoView({ block: "start" });
  }
  function pagination(action, page, pages, total) {
    return `<div class="collection-pagination"><span>共 ${total} 条 · 第 ${page} / ${pages} 页</span><div><button class="button outline" data-nb="${action}" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button><button class="button outline" data-nb="${action}" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>下一页</button></div>${action === "book-page" ? bookPageJump(page, pages) : ""}</div>`;
  }
  let settings = {
    mode: "smart",
    direction: "zh-en",
    exercise: "typing",
    scope: "all",
    kind: "all",
    categoryId: "",
    limit: 10,
  };
  let reminderBusy = false;
  const labels = {
    again: "忘记了",
    hard: "想起很难",
    good: "想起来了",
    easy: "轻松想起",
    familiar: "已熟悉 · 跳过",
    unlearned: "未学新词 · 跳过",
  };
  const modeLabels = {
    smart: "智能混合",
    learn: "学新词",
    due: "到期复习",
    free: "自由练习",
  };
  const hasLearned = (card) => card.learned_at != null;
  const isDue = (card) =>
    hasLearned(card) &&
    !card.familiar &&
    !card.archived &&
    card.due_at <= Date.now();
  const directions = {
    "en-zh": "英译中",
    "zh-en": "中译英",
    mixed: "双向混合",
  };
  const allCards = () => [...getData().cards, ...getData().archivedCards];
  function posTag(value) {
    const label = value
      ? value
          .split(" / ")
          .map((code) =>
            `${code} ${getData().partsOfSpeech?.[code] || ""}`.trim(),
          )
          .join(" / ")
      : "词性待补充";
    return `<span class="pos-tag">${esc(label)}</span>`;
  }
  function familiarButton(card) {
    return `<button class="text-button familiar-action" data-nb="familiar" data-id="${card.id}" data-value="${card.familiar ? "false" : "true"}">${card.familiar ? "恢复学习" : "标记熟悉"}</button>`;
  }
  function sourceOptions(current = "all") {
    return `<option value="all" ${current === "all" ? "selected" : ""}>全部词条</option><option value="personal" ${current === "personal" ? "selected" : ""}>我的生词本 · 个人收藏</option>${getData()
      .wordbooks.filter((b) => b.imported)
      .map(
        (b) =>
          `<option value="${b.id}" ${current === b.id ? "selected" : ""}>${esc(b.title)} · ${b.active} 条</option>`,
      )
      .join("")}`;
  }
  function openPracticeSetup() {
    // 主动点击练习入口时开新一组，旧会话保留在历史中；刷新作答页仍可恢复当前进度。
    session = null;
    advancedOpen = false;
    settings = {
      ...settings,
      mode: "smart",
      source: "all",
      categoryId: "",
      scope: "all",
      kind: "all",
    };
    saveSessionId();
  }
  function choosePractice(bookId, mode = "smart") {
    advancedOpen = true;
    flowPreferences.source = bookId;
    settings = {
      mode,
      direction: "zh-en",
      exercise: "typing",
      scope: "all",
      kind: "all",
      categoryId: "",
      limit: 10,
      source: bookId,
    };
    session = null;
    saveSessionId();
    navigate("practice");
  }
  function progressPercent(progress) {
    if (progress.percent > 0 && progress.percent < 0.1) return "<0.1";
    if (progress.percent < 100)
      return String(Math.min(99.9, Math.round(progress.percent * 10) / 10));
    return "100";
  }
  function progressPanel(
    progress = getData().learningProgress,
    bookId = "all",
    title = "我的学习积累",
    isBook = false,
  ) {
    const action = isBook ? "book-progress" : "view-progress";
    const metric = (status, label, value, hint) =>
      `<button class="progress-metric ${status}" data-nb="${action}" data-book="${esc(bookId)}" data-status="${status}"><span>${label} <span aria-hidden="true">↗</span></span><strong>${value}<small>个</small></strong><small>${hint}</small></button>`;
    return `<section class="learning-progress-panel" aria-label="${esc(title)}">
      <div class="progress-panel-heading"><div><span class="eyebrow">EVERY WORD COUNTS</span><h2>${esc(title)}</h2></div><button class="text-button" data-nb="${action}" data-book="${esc(bookId)}" data-status="all">查看全部 ${progress.total} 个词条 →</button></div>
      <button class="progress-coverage" data-nb="${action}" data-book="${esc(bookId)}" data-status="covered"><span>已学习或已熟悉 <strong>${progress.covered} / ${progress.total}</strong></span><b>${progressPercent(progress)}%</b><progress max="${progress.total || 1}" value="${progress.covered}" aria-label="${esc(title)} 学习进度"></progress></button>
      <div class="progress-metrics">${metric("learned", "累计学过", progress.learned, "完成过首次学习评分")}${metric("learning", "正在学习", progress.learning, "已开始，继续慢慢巩固")}${metric("familiar", "已熟悉", progress.familiar, "你已确认，无需再复习")}${metric("unlearned", "尚未学习", progress.unlearned, isBook ? "含尚未导入的词条" : "留给下一次的小进步")}</div>
      <p class="progress-explanation">点击数字查看词条。累计学过包含其中已标熟悉的词；“已熟悉”由你手动确认。${isBook ? `百分比以全书 ${progress.total} 个词条为分母；已归档 ${progress.archived} 个不计入已学习或熟悉。` : "统计当前未归档的单词与短语，同一词条跨书只计一次，不同释义分别计数。"}</p>
    </section>`;
  }
  function bookProgress(b) {
    return `<div class="book-progress"><button class="book-learning-link" data-nb="book-progress" data-book="${b.id}" data-status="covered"><span>学习进度 <strong>${progressPercent(b.progress)}%</strong></span><progress max="${b.total}" value="${b.progress.covered}" aria-label="${esc(b.title)} 学习进度"></progress><small>已学习或熟悉 ${b.progress.covered} / ${b.total} →</small></button><div class="book-state-links"><button data-nb="book-progress" data-book="${b.id}" data-status="learning">正在学习 ${b.progress.learning}</button><button data-nb="book-progress" data-book="${b.id}" data-status="familiar">已熟悉 ${b.progress.familiar}</button></div><small>已导入 ${b.imported} / ${b.total}</small></div>`;
  }
  function booksPage() {
    const books = getData().wordbooks;
    if (preview) return bookDetail();
    return `${heading("A SMALL LIBRARY, A BIGGER WORLD", "选一本词书，慢慢积累。", "从有来源的词表出发，也为自己的收藏留一个位置。")}
      <section class="books-intro"><div><span class="eyebrow">THE WORD COLLECTIONS</span><h2>A book to begin.<br><em>Your words to keep.</em></h2><p>先预览，按需导入。每一本，都可以单独练习。</p></div><div class="books-intro-count"><strong>${books.length}</strong><span>本精选词书</span><small>${books.reduce((n, b) => n + b.total, 0)} 个词条可选</small></div></section>
      <div class="book-grid">${books.map((b, i) => `<article class="wordbook-card"><button class="book-cover ${b.theme}" data-nb="preview-book" data-book="${b.id}" aria-label="预览 ${esc(b.title)}"><span>SMALL STEPS / VOL. 0${i + 1}</span><h2>${esc(b.english)}</h2><div class="book-cover-rule"></div><strong>${esc(b.title)}</strong><small>${esc(b.edition)}</small></button><div class="book-meta"><div><span class="tag">${esc(b.sourceType)}</span><span>${esc(b.level)}</span></div><p>${esc(b.subtitle)}</p>${bookProgress(b)}<div class="book-actions"><button class="text-button" data-nb="preview-book" data-book="${b.id}">预览与导入 →</button><button class="button outline" data-nb="practice-book" data-book="${b.id}" ${!b.active ? "disabled" : ""}>练这本</button></div></div></article>`).join("")}</div>
      <section class="notebook-entry-banner"><div><h3>自己的生词，也有专属练习。</h3><p>个人添加、阅读收藏，以及主动加入生词本的词书词条。</p></div><button class="button outline" data-nb="practice-personal">练我的生词本 ${icon("arrow")}</button></section>
      <p class="fineprint">词书包含开放词表选编、词典释义和原创材料，均非官方中文译本。每本词书的来源、覆盖范围与授权可在预览中查看。</p>`;
  }
  function bookDetail() {
    const b = preview;
    const imported = b.imported;
    return `${heading("INSIDE THE COLLECTION", esc(b.title), esc(b.subtitle), '<button class="text-button" data-nb="back-books">← 返回词书</button>')}
      ${progressPanel(b.progress, b.id, "这本词书，学到哪里了", true)}
      <p class="book-coverage">词性已标注 ${b.partOfSpeechCount} / ${b.total} 条 · 覆盖整本词书。导入只加入词库，首次学习评分后才安排复习。</p>
      <button class="text-button" data-tab="words">去统一词库查看跨书释义与关联例句 →</button>
      <div class="book-source-panel"><div><span class="tag">${esc(b.sourceType)}</span><span class="tag">${esc(b.edition)}</span></div><p>${esc(b.note)}</p><small>内容作者：${esc(b.authors)} · <a href="${b.licenseUrl}" target="_blank" rel="noopener noreferrer">${esc(b.license)} ↗</a>${b.sourceUrl ? ` · <a href="${b.sourceUrl}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a>` : ""}${(b.references || []).map((ref) => ` · <a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.label)} ↗</a>`).join("")}</small></div>
      <div class="book-browse-mode" aria-label="词书浏览方式"><button class="button ${bookScan ? "outline" : "primary"}" data-nb="book-import-mode" aria-pressed="${!bookScan}">预览与导入</button><button class="button ${bookScan ? "primary" : "outline"}" data-nb="book-scan-mode" aria-pressed="${bookScan}">快速标熟悉</button><span>基础词太多？一页扫读，批量跳过已掌握的词。</span></div>
      <form id="book-filter-form" class="book-filters"><label>搜索英文或中文<input name="query" value="${esc(bookFilters.query)}" maxlength="160" placeholder="例如 environment / 环境"></label><label>学习分层<select name="section"><option value="">全部分层</option>${b.sections.map((s) => `<option value="${esc(s.name)}" ${bookFilters.section === s.name ? "selected" : ""}>${esc(s.name)} · ${s.total} 条</option>`).join("")}</select></label><label>词条状态<select name="status">${[
        ["all", "全部词条"],
        ["new", "未导入"],
        ["imported", "已导入"],
        ["covered", "已学习或已熟悉"],
        ["learned", "累计学过"],
        ["learning", "正在学习"],
        ["familiar", "已熟悉"],
        ["unlearned", "尚未学习"],
        ["archived", "已归档"],
      ]
        .map(
          ([value, label]) =>
            `<option value="${value}" ${bookFilters.status === value ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><label>每页词数<select name="pageSize">${[50, 100, 200].map((size) => `<option value="${size}" ${b.pageSize === size ? "selected" : ""}>${size} 个</option>`).join("")}</select></label><button class="button outline" type="submit">筛选词条</button></form>
      ${
        bookScan
          ? scanList(b)
          : `<div class="book-import-bar"><div><strong>已导入 ${imported} / ${b.total}</strong><span id="book-selection-count">已选 ${selectedEntries.size} 个</span></div><button class="button outline" data-nb="import-next" ${!b.remaining ? "disabled" : ""}>导入下一批 10 个</button><button class="button primary" data-nb="import-selected" ${selectedEntries.size ? "" : "disabled"}>导入所选</button><button class="text-button" data-nb="import-all" ${!b.remaining ? "disabled" : ""}>${bookFilters.query || bookFilters.section || bookFilters.status !== "all" ? "导入筛选结果中未导入词条" : "导入全部未导入词条"}</button></div>
      <div class="book-detail-actions"><button class="text-button" data-nb="select-book-entries">全选本页未导入</button><button class="text-button" data-nb="practice-book" data-book="${b.id}" ${!getData().wordbooks.find((book) => book.id === b.id)?.active ? "disabled" : ""}>练习本书已导入词条 →</button><button class="text-button" data-nb="view-book-cards" data-book="${b.id}">管理已导入词条 →</button></div>
      ${pagination("book-page", b.page, b.pages, b.filtered)}
      <div class="book-entry-list">${b.entries.map((e, i) => `<label class="book-entry"><input type="checkbox" data-book-entry="${esc(e.id)}" ${e.imported ? "disabled" : ""} ${selectedEntries.has(e.id) ? "checked" : ""}><span class="book-entry-index">${String((b.page - 1) * b.pageSize + i + 1).padStart(2, "0")}</span><strong>${esc(e.term)}${posTag(e.partOfSpeech)}</strong><span>${esc(e.meaning)}</span><small>${e.imported ? "已导入" : "未导入"} · ${{ archived: "已归档", familiar: "已熟悉", learning: "正在学习", unlearned: "未学习" }[e.learningStatus]}</small></label>`).join("") || '<p class="empty">没有匹配词条，请调整筛选条件。</p>'}</div>
      ${pagination("book-page", b.page, b.pages, b.filtered)}
      <p class="fineprint">导入后可编辑释义、归类、标记重点并练习。相同英文与释义会复用已有卡片；重复导入不重置进度、不恢复归档。词书条目需主动加入个人生词本，才会进入“个人收藏”范围。</p>`
      }`;
  }
  const categoryName = (id) =>
    getData().categories.find((c) => c.id === id)?.name || "未分类";
  function categoryOptions(selected = "", withAll = true) {
    return `${withAll ? `<option value="">全部分类</option><option value="uncategorized" ${selected === "uncategorized" ? "selected" : ""}>未分类</option>` : '<option value="">未分类</option>'}${getData()
      .categories.map(
        (c) =>
          `<option value="${c.id}" ${String(selected) === String(c.id) ? "selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("")}`;
  }
  function matchedCards() {
    return (scope === "archived" ? getData().archivedCards : getData().cards)
      .filter(
        (c) =>
          source === "all" ||
          (source === "personal" ? c.personal : c.bookIds.includes(source)),
      )
      .filter(
        (c) =>
          category === "all" ||
          (category === "uncategorized"
            ? c.category_id === null
            : c.category_id === Number(category)),
      )
      .filter((c) => kind === "all" || c.kind === kind)
      .filter((c) => scope !== "familiar" || c.familiar)
      .filter(
        (c) =>
          !["learned", "covered"].includes(scope) || matchesProgress(c, scope),
      )
      .filter((c) => scope !== "learning" || (hasLearned(c) && !c.familiar))
      .filter((c) => scope !== "new" || (!hasLearned(c) && !c.familiar))
      .filter((c) => scope !== "due" || isDue(c))
      .filter((c) => scope !== "starred" || c.starred)
      .filter(
        (c) =>
          scope !== "weak" ||
          (!c.familiar && ["again", "hard"].includes(c.last_practice_rating)),
      )
      .filter((c) =>
        `${c.term} ${c.meaning} ${c.note}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      )
      .sort((a, b) =>
        sort === "alphabet"
          ? a.term.localeCompare(b.term, "en")
          : sort === "due"
            ? a.due_at - b.due_at
            : b.id - a.id,
      );
  }
  function dueLabel(card) {
    if (card.archived) return "已归档";
    if (card.familiar) return "已熟悉 · 停止复习";
    if (!hasLearned(card)) return "未学习 · 不在复习队列";
    const phase = card.memory?.label || "待初学";
    if (card.due_at <= Date.now()) return `${phase} · 现在可复习`;
    return `${phase} · ${new Date(card.due_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }
  function notebookPage() {
    const data = getData();
    const sourceCards = data.cards.filter(
      (card) =>
        source === "all" ||
        (source === "personal" ? card.personal : card.bookIds.includes(source)),
    );
    const matched = matchedCards();
    const pages = Math.max(1, Math.ceil(matched.length / notebookPageSize));
    notebookPageNumber = Math.min(notebookPageNumber, pages);
    const cards = matched.slice(
      (notebookPageNumber - 1) * notebookPageSize,
      notebookPageNumber * notebookPageSize,
    );
    return `${heading("YOUR PERSONAL WORD COLLECTION", "我的生词本", "从认识到会用。把每一个单词和短语，慢慢变成自己的。", '<button class="button primary" data-nb="add">+ 添加词条</button>')}
      <div class="word-source-picker"><label>词条来源<select id="vocab-source">${sourceOptions(source)}</select></label><button class="text-button" data-tab="books">去选词书与导入 →</button></div>
      ${progressPanel(summarizeProgress(sourceCards), source, source === "all" ? "我的学习积累" : source === "personal" ? "个人收藏的学习积累" : `${getData().wordbooks.find((b) => b.id === source)?.title || "词书"} · 已导入词条`)}
      <section class="learning-queues"><div><strong>${sourceCards.filter(isDue).length}</strong><span>已学到期</span><button class="button primary" data-nb="review-due" data-book="${source}">复习已学词</button></div><div><strong>${sourceCards.filter((card) => !hasLearned(card) && !card.familiar).length}</strong><span>尚未学习</span><button class="button outline" data-nb="learn-new" data-book="${source}">学新词</button></div><p>只有完成首次评分的词才进入复习；导入、收藏和翻卡不会把整本词书排入待复习。</p></section>
      <section class="notebook-overview">
        <div class="notebook-intro"><span class="eyebrow">COLLECT. RECALL. REMEMBER.</span><h2>Words worth<br><em>keeping.</em></h2><p>不只收藏，<br>也为下一次想起它留一点时间。</p><div class="notebook-stamp" aria-hidden="true">Aa<span>YOUR WORDS<br>YOUR WORLD</span></div></div>
        <div class="notebook-summary"><div class="notebook-numbers"><div><strong>${data.cards.length}</strong><span>收藏词条</span></div><div><strong>${data.dueCards.length}</strong><span>到期复习</span></div><div><strong>${data.stats.practicedToday}</strong><span>今日练习</span></div></div>
        <p>选一种方式，开始今天的练习</p><div class="quick-practice"><button data-nb="quick" data-direction="zh-en"><span>中 → EN</span>中译英 ${icon("arrow")}</button><button data-nb="quick" data-direction="en-zh"><span>EN → 中</span>英译中 ${icon("arrow")}</button><button data-nb="quick" data-direction="mixed"><span>EN ⇄ 中</span>混合练习 ${icon("arrow")}</button></div>
        <div class="notebook-reminder"><span>${data.reminders.enabled ? `◷ 每天 ${esc(data.reminders.time)} 提醒` : "◷ 给记忆留一个固定的时间"}</span><button class="text-button" data-nb="reminders">提醒设置</button></div></div>
      </section>
      <div class="notebook-tools"><div class="notebook-scopes">${[
        ["all", "全部"],
        ["new", "未学习"],
        ["learned", "累计学过"],
        ["learning", "正在学习"],
        ["covered", "已学习或已熟悉"],
        ["due", "待复习"],
        ["familiar", "已熟悉"],
        ["starred", "重点"],
        ["weak", "薄弱项"],
        ["archived", "已归档"],
      ]
        .map(
          ([id, name]) =>
            `<button data-nb="scope" data-value="${id}" class="${scope === id ? "selected" : ""}">${name}${id === "all" ? ` <small>${sourceCards.length}</small>` : ""}</button>`,
        )
        .join(
          "",
        )}</div><button class="text-button" data-nb="categories">管理分类 ${icon("pen")}</button></div>
      <div class="category-strip"><button data-nb="category" data-value="all" class="${category === "all" ? "selected" : ""}">全部分类</button>${data.categories.map((c) => `<button data-nb="category" data-value="${c.id}" class="${category === String(c.id) ? "selected" : ""}">${esc(c.name)} <small>${data.cards.filter((card) => card.category_id === c.id).length}</small></button>`).join("")}<button data-nb="category" data-value="uncategorized" class="${category === "uncategorized" ? "selected" : ""}">未分类</button></div>
      <div class="notebook-filters"><label class="search-box">⌕ <input id="vocab-search" placeholder="搜索英文、释义或笔记" aria-label="搜索生词本" value="${esc(query)}"></label><label class="sr-only" for="vocab-kind">词条类型</label><select id="vocab-kind">${[
        ["all", "单词与短语"],
        ["word", "只看单词"],
        ["phrase", "只看短语"],
      ]
        .map(
          ([v, label]) =>
            `<option value="${v}" ${kind === v ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select><label class="sr-only" for="vocab-sort">排序</label><select id="vocab-sort">${[
        ["newest", "最近添加"],
        ["alphabet", "字母顺序"],
        ["due", "复习时间"],
      ]
        .map(
          ([v, label]) =>
            `<option value="${v}" ${sort === v ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select><button class="text-button" data-nb="hide">${hideMeanings ? "显示释义" : "遮住释义"}</button></div>
      <section class="vocab-table" aria-label="生词列表"><div class="vocab-table-heading"><span>英文 / EXPRESSION</span><span>释义 / MEANING</span><span>复习状态</span><span>操作</span></div>
      ${cards.length ? cards.map((c) => `<article class="vocab-row"><div class="vocab-term"><div><button data-nb="star" data-id="${c.id}" aria-label="${c.starred ? "取消重点" : "标记重点"} ${esc(c.term)}" aria-pressed="${Boolean(c.starred)}" class="star-button ${c.starred ? "starred" : ""}">${c.starred ? "★" : "☆"}</button><button class="term-button" data-nb="edit" data-id="${c.id}">${esc(c.term)}</button><button class="audio-button" data-speak="${esc(c.term)}" aria-label="朗读 ${esc(c.term)}">${icon("audio")}</button></div>${posTag(c.part_of_speech)}<small>${c.kind === "word" ? "单词" : "短语"} <span>·</span> ${esc(categoryName(c.category_id))}</small></div><div class="vocab-meaning">${hideMeanings ? `<button class="meaning-cover" data-nb="peek" data-id="${c.id}">点击查看释义</button>` : `<p>${esc(c.meaning)}</p>`}<small>${esc(c.note || c.example || "添加例句，让表达更好记")}</small></div><div class="vocab-state"><span class="${isDue(c) ? "is-due" : ""}">${dueLabel(c)}</span><small>${c.practice_count} 次双向练习</small></div><div class="vocab-actions">${familiarButton(c)}<button class="text-button" data-nb="edit" data-id="${c.id}">编辑</button><button class="text-button" data-nb="archive" data-id="${c.id}"> ${c.archived ? "恢复" : "归档"}</button></div></article>`).join("") : `<div class="empty notebook-empty"><span>${icon("book")}</span><h3>${data.cards.length || data.archivedCards.length ? "这个条件下还没有词条" : "第一笔积累，从一个词开始。"}</h3><p>${data.cards.length || data.archivedCards.length ? "试试其他分类，或添加一条新的表达。" : "手动添加单词与短语，或在阅读中收藏表达，它们都会留在这里。"}</p><button class="button outline" data-nb="add">+ 添加词条</button></div>`}</section>
      ${pagination("notebook-page", notebookPageNumber, pages, matched.length)}
      <p class="fineprint">已熟悉 ${data.stats.familiarCards} 个词条：保留收藏与记录，停止到期提醒和出题；可在“已熟悉”中恢复学习。</p>
      <div class="notebook-footnote"><span>共 ${matched.length} 条 · ${matched.filter((c) => c.kind === "word").length} 个单词 / ${matched.filter((c) => c.kind === "phrase").length} 个短语</span><span>归档可随时恢复，原复习记录会保留。</span></div>`;
  }
  function selected(value, target) {
    return value === target ? "selected" : "";
  }
  function practicePage() {
    if (session) return sessionPage();
    const data = getData();
    if (
      ![
        "all",
        "personal",
        ...data.wordbooks.filter((b) => b.imported).map((b) => b.id),
      ].includes(flowPreferences.source)
    )
      flowPreferences.source = "all";
    return `${heading("A LITTLE ROOM TO KEEP GOING", "先开始，节奏慢慢来。", "一小轮回想，一小段阅读。给今天留一点轻松的积累。")}
      <section class="flow-entry"><div><span class="eyebrow">SMALL STEPS / JUST ONE ROUND</span><h2>不用准备，<br><em>先练一小轮。</em></h2><p>到期词优先，每轮最多 10 个，新词最多 3 个。<br>吃力时自动少学一点，结束后用熟词读一小段。</p><button class="button primary" data-nb="flow-start">一键开练 ${icon("arrow")}</button></div><div class="flow-entry-aside"><span class="flow-round-number">01</span><p>回想 → 核对 → 轻松收尾</p><small>不计时，不追赶。随时可以停。</small></div></section>
      <details class="flow-preferences"><summary>练习偏好 · ${directions[flowPreferences.direction]} · ${flowPreferences.exercise === "flashcard" ? "翻卡自测" : "输入答案"} · ${esc(flowPreferences.source === "all" ? "全部词条" : flowPreferences.source === "personal" ? "我的生词本" : data.wordbooks.find((b) => b.id === flowPreferences.source)?.title || "")}</summary><div class="flow-preference-fields notebook-form"><label>一键练习内容<select data-flow-pref="source">${sourceOptions(flowPreferences.source)}</select></label><label>一键练习方向<select data-flow-pref="direction">${Object.entries(
        directions,
      )
        .map(
          ([value, label]) =>
            `<option value="${value}" ${selected(flowPreferences.direction, value)}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><label>一键练习方式<select data-flow-pref="exercise"><option value="flashcard" ${selected(flowPreferences.exercise, "flashcard")}>翻卡自测</option><option value="typing" ${selected(flowPreferences.exercise, "typing")}>输入答案</option></select></label></div></details>
      <details class="practice-advanced" ${advancedOpen ? "open" : ""}><summary>自定义练习 · 分类、数量与自由练习</summary>
      <p class="practice-entry-note">自定义智能混合约七成旧词、三成新词，不足时补足，不启用自动减负。未完成的旧组可从下方继续。</p>
      <div class="practice-layout"><form id="practice-setup" class="form-card notebook-form"><span class="step-label">01 / BUILD YOUR PRACTICE</span><h2>今天，想怎么练？</h2>
      <label>练习内容<select name="source">${sourceOptions(settings.source || "all")}</select></label>
      <div class="form-row"><label>练习范围<select name="mode"><option value="smart" ${selected(settings.mode, "smart")}>智能混合 · 到期旧词 + 新词</option><option value="due" ${selected(settings.mode, "due")}>到期复习 · 仅已学且到期</option><option value="learn" ${selected(settings.mode, "learn")}>学新词 · 仅尚未学习</option><option value="free" ${selected(settings.mode, "free")}>自由练习 · 随时可练</option></select></label><label>练习方向<select name="direction"><option value="zh-en" ${selected(settings.direction, "zh-en")}>中译英</option><option value="en-zh" ${selected(settings.direction, "en-zh")}>英译中</option><option value="mixed" ${selected(settings.direction, "mixed")}>双向混合</option></select></label></div>
      <div class="form-row"><label>练习方式<select name="exercise"><option value="typing" ${selected(settings.exercise, "typing")}>输入答案 · 动手写一遍</option><option value="flashcard" ${selected(settings.exercise, "flashcard")}>翻卡自测 · 先回想再核对</option></select></label><label>分类<select name="categoryId">${categoryOptions(settings.categoryId)}</select></label></div>
      <div class="form-row"><label>重点范围<select name="scope"><option value="all" ${selected(settings.scope, "all")}>全部词条</option><option value="starred" ${selected(settings.scope, "starred")}>仅重点词</option><option value="weak" ${selected(settings.scope, "weak")}>仅薄弱项</option></select></label><label>每组数量<select name="limit">${[5, 10, 20, 50, 100].map((n) => `<option value="${n}" ${Number(settings.limit) === n ? "selected" : ""}>${n} 个</option>`).join("")}</select></label></div>
      <label>词条类型<select name="kind"><option value="all" ${selected(settings.kind, "all")}>单词与短语</option><option value="word" ${selected(settings.kind, "word")}>只练单词</option><option value="phrase" ${selected(settings.kind, "phrase")}>只练短语</option></select></label>
      <button class="button primary" type="submit">开始这组练习 ${icon("arrow")}</button><p class="fineprint">智能混合只选择 FSRS 已到期的旧词，不会提前复习；组数大于 1 且两类都有时至少各含一个。新词首次评分后建立排程。自动排除已熟悉和归档词条。</p></form>
      <aside class="practice-guide"><span class="little-star">✳</span><h2>Try. Recall.<br><em>Try again.</em></h2><ol><li><strong>先试着想起</strong><p>写下来，或者在脑海里认真回忆。</p></li><li><strong>再核对答案</strong><p>同义表达也可以，重点是你是否真的理解。</p></li><li><strong>给记忆一个反馈</strong><p>标记掌握程度，薄弱项可以再练一组。</p></li></ol></aside></div></details>
      ${data.recentSessions.length ? `<div class="section-heading"><h2>最近的练习 <span>YOUR PRACTICE JOURNAL</span></h2></div><div class="practice-history">${data.recentSessions.map((s) => `<button data-nb="resume" data-id="${s.id}"><span>${directions[s.direction]}<small>${modeLabels[s.mode]}${s.mode === "smart" ? ` · 复习 ${s.reviewCount} + 新词 ${s.newCount}` : ""} · ${new Date(s.createdAt).toLocaleDateString("zh-CN")}</small></span><b>${s.done} / ${s.total}</b><span>${s.done < s.total ? "继续练习" : "查看结果"} →</span></button>`).join("")}</div>` : ""}`;
  }
  function sessionPage() {
    const s = session;
    if (!s.current) {
      if (s.flow) return flowResult(s);
      const weak = s.results.filter(
        (r) =>
          ["again", "hard"].includes(r.rating) &&
          !allCards().find((c) => c.id === r.cardId)?.familiar,
      );
      const nextDue = getData()
        .cards.filter(
          (card) =>
            !card.familiar &&
            s.results.some((r) => r.cardId === card.id && r.scheduled),
        )
        .reduce((next, card) => Math.min(next, card.due_at), Infinity);
      return `${heading("ANOTHER SMALL STEP, TAKEN", "这一组，完成了。", "本次答对不代表长期记牢，间隔后的再次回想才是巩固。")}
      <section class="practice-result"><span class="result-seal">✓</span><h2>${s.correct}<small> / ${s.total - (s.skipped || 0)}</small></h2><p>个词条本次顺利想起 · ${weak.length} 个忘记或费力想起</p><span class="tag">${modeLabels[s.mode]}${s.mode === "smart" ? ` · 复习 ${s.reviewCount} + 新词 ${s.newCount}` : ""} · 已安排 ${s.results.filter((r) => r.scheduled).length} 个词条的复习</span>
      ${Number.isFinite(nextDue) ? `<p class="fineprint">本组下次最早复习：${esc(new Date(nextDue).toLocaleString("zh-CN"))}。到时请回到“到期复习”，本组不会提前重复出题。</p>` : ""}
      ${s.skippedFamiliar ? `<p class="fineprint">另有 ${s.skippedFamiliar} 个已熟悉词条自动跳过，未计入练习次数。</p>` : ""}
      ${s.skippedUnlearned ? `<p class="fineprint">已跳过旧复习组中的 ${s.skippedUnlearned} 个未学新词，未计入学习记录；请从“学新词”开始。</p>` : ""}
      <div class="result-actions">${weak.length ? '<button class="button primary" data-nb="retry">再练本组薄弱项</button>' : ""}<button class="button outline" data-nb="setup">再选一组</button><button class="text-button" data-tab="notebook">回到生词本 →</button></div></section>
      <div class="result-list familiar-results">${s.results.map((r) => `<div><strong>${esc(r.term)}</strong><span>${esc(r.meaning)}</span><small class="${["again", "hard"].includes(r.rating) ? "weak-result" : ""}">${labels[r.rating]}</small>${familiarButton(allCards().find((c) => c.id === r.cardId) || { id: r.cardId, familiar: false })}</div>`).join("")}</div>`;
    }
    const c = s.current;
    const a = c.answer;
    return `${heading("ONE WORD AT A TIME", directions[c.direction], `${modeLabels[s.mode]} · ${s.mode === "smart" ? `本组复习 ${s.reviewCount} + 新词 ${s.newCount}` : s.mode === "free" ? "新词首次评分加入复习，已学词保留计划" : "评分后安排下次复习时间"} · ${s.exercise === "typing" ? "输入答案" : "翻卡自测"}`, '<button class="text-button" data-nb="setup">暂停，稍后继续</button>')}
      <div class="practice-progress"><span>第 ${s.position + 1} / ${s.total} 个</span><progress value="${s.position}" max="${s.total}" aria-label="练习进度"></progress><span>已完成 ${s.position}</span></div>
      ${s.flow ? `<div class="flow-pace" role="status"><span>${esc(s.flow.notice)}${s.flow.deferredNewCount ? ` 已放回 ${s.flow.deferredNewCount} 个未开始的新词。` : ""}</span><button class="text-button" data-nb="flow-pace" ${s.flow.paceUntil ? "disabled" : ""}>${s.flow.paceUntil ? "已减负 · 当前题保留" : "这一轮轻一点"}</button></div>` : ""}
      <p class="practice-tip">${s.mode === "smart" ? (c.queue === "review" ? "FSRS 到期复习" : "本组新词") + " · " : ""}${esc(c.memory?.label || "待初学")} · 四档反馈记录本次回忆，不代表永久掌握。</p>
      <section class="practice-card"><span class="step-label">${c.direction === "zh-en" ? "用英文，写出这个意思" : "用中文，说出它的含义"}</span><h2 class="${c.direction === "zh-en" ? "chinese-prompt" : ""}">${esc(c.question)}</h2>
      ${c.direction === "en-zh" ? `<button class="audio-button" data-speak="${esc(c.question)}" aria-label="朗读题目">${icon("audio")}</button>` : ""}
      ${
        !a
          ? s.exercise === "typing"
            ? '<form id="practice-answer"><label class="sr-only" for="practice-input">你的答案</label><input id="practice-input" name="answer" autocomplete="off" spellcheck="false" maxlength="1200" placeholder="不看答案，试着写下来…" required><div><button class="button primary" type="submit">核对答案</button><button class="text-button" type="button" data-nb="reveal">暂时想不起来，翻卡看看</button></div></form>'
            : '<div class="practice-recall"><p>给自己几秒钟，在脑海中认真回忆。</p><button class="button primary" data-nb="reveal">翻卡核对答案</button></div>'
          : `<div class="practice-answer" aria-live="polite">${a.input ? `<p class="your-answer">你的答案：${esc(a.input)}</p>` : ""}<span class="answer-feedback">${a.revealed ? "看完答案，再诚实地给记忆一个反馈。" : a.matched ? "与参考答案一致，再确认自己是否真正记住。" : "与参考答案写法不同，请核对含义；合理的同义表达也可以。"} </span><h3>${esc(c.direction === "zh-en" ? a.term : a.meaning)}</h3>${posTag(a.partOfSpeech)}<button class="audio-button" data-speak="${esc(a.term)}" aria-label="朗读参考英文">${icon("audio")}</button>${a.example ? `<p class="answer-example">${esc(a.example)}</p>` : ""}${a.translation ? `<p>${esc(a.translation)}</p>` : ""}${a.note ? `<div class="answer-note">记忆笔记 · ${esc(a.note)}</div>` : ""}</div>`
      }</section>
      ${a?.wordId ? `<p class="center"><button class="text-button" data-k="word" data-word="${a.wordId}">查看统一词条与更多例句 →</button></p>` : ""}
      ${a?.associations ? renderAssociations(a.associations, a.wordId, esc, { compact: true }) : ""}
      <div class="familiar-practice-action">${familiarButton({ id: c.id, familiar: false })}<span>仅用于你确定无需再复习的词，将停止出题</span></div>
      ${
        a
          ? `<div class="practice-ratings">${Object.entries(labels)
              .filter(([rating]) => !["familiar", "unlearned"].includes(rating))
              .map(
                ([r, label]) =>
                  `<button class="rating ${r}" data-nb="grade" data-rating="${r}"><strong>${label}</strong><span>${esc(c.schedule?.options[r]?.label || (r === "again" ? "忘记 / 答错" : r === "hard" ? "费力但答对" : r === "good" ? "正常答对" : "毫不费力"))}</span></button>`,
              )
              .join(
                "",
              )}</div><p class="practice-tip">${esc(c.scheduleNotice || "按揭晓答案前的实际表现评分；看答案才知道请选“忘记了”，不要选“想起很难”。间隔由记忆历史计算，以提交评分时为准。")}</p>`
          : ""
      }`;
  }
  function readingText(text, terms) {
    const known = new Set(terms.map((term) => term.toLowerCase()));
    if (!terms.length) return esc(text);
    const pattern = terms
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length)
      .join("|");
    return text
      .split(new RegExp(`\\b(${pattern})\\b`, "gi"))
      .map((part) =>
        known.has(part.toLowerCase()) ? `<mark>${esc(part)}</mark>` : esc(part),
      )
      .join("");
  }
  function flowResult(s) {
    const closing = s.flow.closing;
    const weakCount = s.results.filter((r) =>
      ["again", "hard"].includes(r.rating),
    ).length;
    const piece = (item) =>
      `<div class="flow-reading-piece"><p lang="en">${readingText(item.english, item.focusTerms)}</p><button class="text-button" data-speak="${esc(item.english)}">朗读这一段 ${icon("audio")}</button><details><summary>看中文</summary><p>${esc(item.chinese)}</p></details></div>`;
    return `${heading("A GOOD PLACE TO PAUSE", s.total ? "这一小轮，已经很好。" : "现在可以轻松收尾。", s.total ? `完成 ${s.position - (s.skipped || 0)} 个词条，${s.correct} 个顺利想起。${weakCount ? `${weakCount} 个仍需巩固，已按实际评分记录。` : "慢慢积累就好。"}` : "当前没有适合这一轮的到期词或预算内新词，不必凑满。")}
      <section class="flow-finish"><span class="eyebrow">RECALL → READ → REST</span><h2>${s.flow.newCap < 3 ? "少一点，也能走得久。" : "让刚才的词，回到生活里。"}</h2><p>${esc(s.flow.notice)}${s.flow.deferredNewCount ? ` ${s.flow.deferredNewCount} 个新词已放回待学池，未计为学习。` : ""}</p>
      <div class="result-actions">${s.total ? `<button class="button primary" data-hub="start" data-practice="${s.id}">用这批词玩拼图 →</button><button class="button outline" data-nb="flow-continue">继续一小轮</button>` : ""}<button class="button outline" data-nb="flow-closing">读熟词短文收尾</button><button class="button outline" data-nb="flow-stop">今天到这里</button></div></section>
      ${closing ? `<section class="flow-reading" aria-label="轻松收尾"><span class="eyebrow">${closing.kind === "story" ? "A LITTLE STORY" : closing.kind === "sentences" ? "A FAMILIAR SENTENCE" : "TIME TO REST"}</span><h2>${esc(closing.title)}</h2>${closing.kind === "story" ? piece(closing) : closing.kind === "sentences" ? `<p class="fineprint">暂时没有匹配的轻量短文，先读关联例句。</p>${closing.sentences.map(piece).join("")}` : `<p>${esc(closing.message)}</p>`}<p class="fineprint">标亮的是已学重点词，文中可能仍有陌生词。阅读和朗读不计记忆评分。</p>${closing.completedAt ? '<p class="flow-reading-done" role="status">已收尾，今天的积累留在这里。</p>' : '<button class="button outline" data-nb="flow-read">读完了，收好这一轮</button>'}<button class="text-button" data-nb="flow-stop">跳过，今天到这里 →</button></section>` : ""}
      ${s.results.length ? `<details class="flow-results"><summary>查看本轮 ${s.results.length} 个词条</summary><div class="result-list">${s.results.map((r) => `<div><strong>${esc(r.term)}</strong><span>${esc(r.meaning)}</span><small>${labels[r.rating]}</small></div>`).join("")}</div></details>` : ""}`;
  }
  function showModal(title, body) {
    document.body.append(document.querySelector("#toast"));
    modal.innerHTML = `<div class="reader-toolbar"><strong>${title}</strong><button class="close-button" data-nb="close" aria-label="关闭弹窗">×</button></div><div class="notebook-modal-body">${body}<p class="modal-error" role="alert"></p></div>`;
    if (!modal.open) modal.showModal();
  }
  function editCard(id) {
    const c = allCards().find((c) => c.id === Number(id));
    showModal(
      c ? "编辑词条" : "收录一个新表达",
      `<form id="card-form" class="notebook-form">${c ? `<input name="id" type="hidden" value="${c.id}">` : ""}
      ${c?.wordId ? `<button type="button" class="text-button" data-k="word" data-word="${c.wordId}">查看统一词条、全部词书与关联例句 →</button>` : ""}
      <div class="form-row"><label>英文单词或短语<input name="term" required maxlength="160" value="${esc(c?.term)}" placeholder="例如：resilient / figure out"></label><label>词条形式<select name="kind"><option value="word" ${c?.kind === "word" ? "selected" : ""}>单词</option><option value="phrase" ${c?.kind === "phrase" ? "selected" : ""}>短语</option></select></label></div>
      <label>中文释义<textarea name="meaning" required maxlength="800" rows="2" placeholder="例如：有韧性的；能迅速恢复的">${esc(c?.meaning)}</textarea></label>
      <label>词性<input name="partOfSpeech" maxlength="160" list="pos-options" value="${esc(c?.part_of_speech)}" placeholder="例如 n. / v. 或 名词 / 动词" aria-describedby="pos-help"></label>
      <datalist id="pos-options">${Object.entries(getData().partsOfSpeech || {})
        .map(
          ([code, label]) =>
            `<option value="${esc(code)}">${esc(label)}</option>`,
        )
        .join("")}</datalist>
      <p class="fineprint" id="pos-help">n. 名词 · v. 动词 · adj. 形容词 · adv. 副词。支持多个词性，用 / 分隔。新词留空时补全词库中已知的词性，未知词标为待补充；编辑时可清空。</p>
      <label>分类<select name="categoryId">${categoryOptions(c?.category_id || (category !== "all" && category !== "uncategorized" ? category : ""), false)}</select></label>
      ${c ? `<div class="personal-collection-setting"><p>${c.personal ? "已在个人生词本中" : "来自词书，尚未加入个人生词本"}</p><button type="button" class="button outline" data-nb="personal" data-id="${c.id}">${c.personal ? "移出个人生词本" : "加入个人生词本"}</button><small>只改变个人收藏标记，不删除词条或复习记录。请先保存其他编辑再切换。</small></div>` : ""}
      <label>英文例句 <span class="muted">/ 可选</span><textarea name="example" rows="2" maxlength="2000" placeholder="用你自己的生活场景，写一个例句。">${esc(c?.example)}</textarea></label>
      <label>例句翻译 <span class="muted">/ 可选</span><input name="translation" maxlength="2000" value="${esc(c?.translation)}"></label>
      <label>记忆笔记 <span class="muted">/ 可选</span><textarea name="note" rows="2" maxlength="2000" placeholder="词根、搭配、易错点，或者一次真实的使用经历。">${esc(c?.note)}</textarea></label>
      <div class="form-actions"><button class="button primary" type="submit">保存词条</button><button type="button" class="text-button" data-nb="close">取消</button></div><p class="fineprint">${c ? "编辑内容会保留当前复习进度。" : "新词条加入未学习列表，首次评分后安排复习。相同英文可以收录不同释义。"}</p></form>`,
    );
  }
  function showCategories() {
    showModal(
      "管理分类",
      `<form id="category-add" class="inline-form"><label class="sr-only" for="category-name">新分类名称</label><input id="category-name" name="name" maxlength="30" required placeholder="例如：工作沟通、旅行口语"><button class="button primary" type="submit">添加分类</button></form>
      <div class="category-manager">${getData()
        .categories.map(
          (c) =>
            `<form class="category-edit" data-id="${c.id}"><input name="name" value="${esc(c.name)}" maxlength="30" required aria-label="分类 ${esc(c.name)}"><button class="text-button" type="submit">重命名</button><button class="text-button" type="button" data-nb="remove-category" data-id="${c.id}">移除</button></form>`,
        )
        .join(
          "",
        )}</div><p class="fineprint">移除分类后，词条会移入“未分类”，不会删除词条或复习记录。</p>`,
    );
  }
  function showReminders() {
    const r = getData().reminders;
    const permission = !("Notification" in window)
      ? "当前浏览器不支持系统通知"
      : Notification.permission === "granted"
        ? "浏览器通知已允许"
        : Notification.permission === "denied"
          ? "浏览器通知已被阻止，可在网站设置中修改"
          : "浏览器通知尚未允许";
    showModal(
      "给复习留一点时间",
      `<form id="reminder-form" class="notebook-form"><p class="reminder-intro">到点时，如果还有到期词条，就提醒你练一小组。</p><label class="checkbox-label"><input name="enabled" type="checkbox" ${r.enabled ? "checked" : ""}> 开启每日提醒</label><label>每天提醒时间<input name="time" type="time" value="${esc(r.time)}" required></label><button class="button primary" type="submit">保存提醒</button></form>
      <div class="notification-permission"><p>${permission}</p><button class="button outline" data-nb="permission">允许浏览器通知</button></div><p class="fineprint">按当前设备本地时间提醒。页面和本地服务需保持运行；关闭页面或电脑休眠时无法推送。未允许系统通知时，仍会显示站内提示。每台设备每天最多提醒一次。</p>`,
    );
  }
  function saveSessionId() {
    try {
      if (session) sessionStorage.setItem("english.practice", session.id);
      else sessionStorage.removeItem("english.practice");
    } catch {
      /* 禁用存储时可从最近练习继续。 */
    }
  }
  function formSettings(form) {
    const input = Object.fromEntries(new FormData(form));
    input.limit = Number(input.limit);
    input.categoryId =
      input.categoryId === "uncategorized"
        ? input.categoryId
        : input.categoryId
          ? Number(input.categoryId)
          : null;
    return input;
  }
  async function submit(form) {
    // 表单中的 name="id" 会遮蔽 DOM 的 id 属性，使用显式属性读取。
    const formId = form.getAttribute("id");
    if (
      ![
        "book-filter-form",
        "card-form",
        "category-add",
        "practice-setup",
        "practice-answer",
        "reminder-form",
      ].includes(formId) &&
      !form.matches(".category-edit, .book-page-jump")
    )
      return false;
    if (operation) return true;
    operation = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(form));
      switch (form.matches(".book-page-jump") ? "book-page-jump" : formId) {
        case "book-page-jump":
          await goToBookPage(Number(input.page));
          break;
        case "book-filter-form":
          bookFilters = { ...input, pageSize: Number(input.pageSize), page: 1 };
          await loadPreview();
          render();
          break;
        case "card-form":
          if (!input.id && !input.partOfSpeech.trim())
            delete input.partOfSpeech;
          input.categoryId = input.categoryId ? Number(input.categoryId) : null;
          if (input.id) input.id = Number(input.id);
          await api("notebook/save", input);
          await refresh();
          modal.close();
          render();
          toast("词条已保存");
          break;
        case "category-add":
          await api("categories/save", input);
          await refresh();
          render();
          showCategories();
          break;
        case "practice-setup":
          settings = formSettings(form);
          session = await api("practice/start", settings);
          saveSessionId();
          render();
          break;
        case "practice-answer":
          session = await api("practice/check", {
            id: session.id,
            position: session.position,
            answer: input.answer,
          });
          render();
          break;
        case "reminder-form":
          await api("reminders", {
            enabled: new FormData(form).has("enabled"),
            time: input.time,
          });
          await refresh();
          modal.close();
          render();
          toast("提醒设置已保存");
          break;
        default:
          await api("categories/save", {
            id: Number(form.dataset.id),
            name: input.name,
          });
          await refresh();
          render();
          showCategories();
      }
    } catch (error) {
      if (modal.open)
        modal.querySelector(".modal-error").textContent = error.message;
      else toast(error.message);
    } finally {
      operation = false;
      button.disabled = false;
    }
    return true;
  }
  async function click(button) {
    const action = button.dataset.nb;
    if (!action) return false;
    if (operation) return true;
    const id = Number(button.dataset.id);
    try {
      switch (action) {
        case "add":
          editCard();
          break;
        case "edit":
          editCard(id);
          break;
        case "close":
          modal.close();
          break;
        case "categories":
          showCategories();
          break;
        case "reminders":
          showReminders();
          break;
        case "scope":
          scope = button.dataset.value;
          notebookPageNumber = 1;
          render();
          break;
        case "view-progress":
          source = button.dataset.book || "all";
          scope =
            button.dataset.status === "unlearned"
              ? "new"
              : button.dataset.status;
          category = "all";
          kind = "all";
          query = "";
          notebookPageNumber = 1;
          await navigate("notebook");
          document
            .querySelector(".notebook-tools")
            ?.scrollIntoView({ block: "start" });
          break;
        case "book-progress":
          operation = true;
          bookFilters = {
            query: "",
            section: "",
            status: button.dataset.status,
            page: 1,
          };
          await loadPreview(button.dataset.book);
          await navigate("books");
          document
            .querySelector("#book-filter-form")
            ?.scrollIntoView({ block: "start" });
          break;
        case "category":
          category = button.dataset.value;
          notebookPageNumber = 1;
          render();
          break;
        case "hide":
          hideMeanings = !hideMeanings;
          render();
          break;
        case "peek":
          button.replaceWith(
            Object.assign(document.createElement("p"), {
              textContent: allCards().find((c) => c.id === id)?.meaning || "",
            }),
          );
          break;
        case "quick":
          advancedOpen = true;
          settings = {
            ...settings,
            direction: button.dataset.direction,
            mode:
              scope === "due"
                ? "due"
                : scope === "new"
                  ? "learn"
                  : ["learning", "weak"].includes(scope)
                    ? "free"
                    : "smart",
            categoryId: category === "all" ? "" : category,
            scope: ["weak", "starred"].includes(scope) ? scope : "all",
            kind,
            source,
          };
          session = null;
          saveSessionId();
          navigate("practice");
          break;
        case "practice-book":
          choosePractice(button.dataset.book);
          break;
        case "learn-new":
          choosePractice(button.dataset.book || "all", "learn");
          break;
        case "review-due":
          choosePractice(button.dataset.book || "all", "due");
          break;
        case "practice-personal":
          choosePractice("personal");
          break;
        case "view-book-cards":
          source = button.dataset.book;
          notebookPageNumber = 1;
          category = "all";
          scope = "all";
          query = "";
          kind = "all";
          navigate("notebook");
          break;
        case "back-books":
          preview = null;
          bookScan = false;
          selectedFamiliar.clear();
          selectedEntries.clear();
          render();
          break;
        case "book-scan-mode":
        case "book-import-mode":
          bookScan = action === "book-scan-mode";
          selectedEntries.clear();
          selectedFamiliar.clear();
          render();
          document
            .querySelector(".book-browse-mode")
            ?.scrollIntoView({ block: "start" });
          break;
        case "select-familiar-page":
          for (const entry of preview.entries)
            if (!entry.archived) selectedFamiliar.add(entry.id);
          render();
          break;
        case "clear-familiar-page":
          selectedFamiliar.clear();
          render();
          break;
        case "select-book-entries":
          for (const entry of preview.entries)
            if (!entry.imported) selectedEntries.add(entry.id);
          render();
          break;
        case "notebook-page":
          notebookPageNumber = Math.max(1, Number(button.dataset.page));
          render();
          document
            .querySelector(".notebook-filters")
            ?.scrollIntoView({ block: "start" });
          break;
        case "setup":
          advancedOpen = true;
          session = null;
          saveSessionId();
          await refresh();
          render();
          break;
        case "permission":
          if (!("Notification" in window))
            throw new Error("当前浏览器不支持系统通知，站内提醒仍可使用。");
          await Notification.requestPermission();
          showReminders();
          break;
        default:
          operation = true;
          button.disabled = true;
          if (action === "flow-start") {
            session = await api("practice/start", {
              ...flowPreferences,
              mode: "smart",
              adaptive: true,
              limit: 10,
            });
            saveSessionId();
            await navigate("practice");
          }
          if (action === "flow-pace") {
            session = await api("practice/pace", {
              id: session.id,
              position: session.position,
            });
            render();
          }
          if (action === "flow-continue") {
            session = await api("practice/continue", { id: session.id });
            saveSessionId();
            render();
          }
          if (action === "flow-closing" || action === "flow-read") {
            session = await api("practice/closing", {
              id: session.id,
              complete: action === "flow-read",
            });
            render();
            document
              .querySelector(".flow-reading")
              ?.scrollIntoView({ block: "start" });
          }
          if (action === "flow-stop") {
            session = null;
            saveSessionId();
            await refresh();
            navigate("notebook");
            toast("今天的积累已保存，休息一下吧。");
          }
          if (action === "familiar") {
            await api("notebook/flag", {
              id,
              field: "familiar",
              value: button.dataset.value === "true",
            });
            await refresh();
            if (session)
              session = await api("practice/get", { id: session.id });
            if (preview) await loadPreview();
            render();
            toast(
              button.dataset.value === "true"
                ? "已标记熟悉，停止复习和提醒"
                : "已恢复学习；学过的词进入待复习，未学词回到新词列表",
            );
          }
          if (action === "preview-book") {
            bookScan = false;
            bookFilters = { query: "", section: "", status: "all", page: 1 };
            await loadPreview(button.dataset.book);
            render();
          }
          if (action === "book-page") {
            await goToBookPage(Number(button.dataset.page));
          }
          if (action === "bulk-familiar" || action === "bulk-restore") {
            const value = action === "bulk-familiar";
            const entryIds = familiarSelection(value).map((e) => e.id);
            if (!entryIds.length) return true;
            const result = await api("books/familiar", {
              bookId: preview.id,
              entryIds,
              value,
            });
            await refresh();
            if (session)
              session = await api("practice/get", { id: session.id });
            await loadPreview();
            render();
            toast(
              `${value ? "已标熟悉" : "已恢复学习"} ${result.changed} 个词条${result.unchanged ? `，${result.unchanged} 个状态未变` : ""}${result.archived ? `；跳过 ${result.archived} 个归档词` : ""}`,
            );
          }
          if (
            ["import-selected", "import-next", "import-all"].includes(action)
          ) {
            const result = await api("books/import", {
              bookId: preview.id,
              mode:
                action === "import-next"
                  ? "next"
                  : action === "import-all"
                    ? "all"
                    : "selected",
              limit: 10,
              ...bookFilters,
              entryIds: [...selectedEntries],
            });
            await refresh();
            await loadPreview();
            render();
            toast(
              `新增 ${result.added} 条，复用 ${result.reused} 条，跳过 ${result.skipped} 条${result.archived ? `；${result.archived} 条仍在归档中` : ""}`,
            );
          }
          if (action === "personal") {
            const card = allCards().find((c) => c.id === id);
            await api("notebook/flag", {
              id,
              field: "personal",
              value: !card.personal,
            });
            await refresh();
            modal.close();
            render();
            toast(
              card.personal
                ? "已移出个人收藏，词条与进度保留"
                : "已加入个人生词本",
            );
          }
          if (action === "star" || action === "archive") {
            const card = allCards().find((c) => c.id === id);
            const field = action === "star" ? "starred" : "archived";
            await api("notebook/flag", { id, field, value: !card[field] });
            await refresh();
            render();
            if (action === "archive")
              toast(
                card.archived ? "词条已恢复" : "词条已归档，可在“已归档”中恢复",
              );
          }
          if (action === "remove-category") {
            await api("categories/remove", { id });
            if (category === String(id)) category = "all";
            await refresh();
            render();
            showCategories();
          }
          if (action === "resume") {
            session = await api("practice/get", { id: button.dataset.id });
            if (session.config) settings = session.config;
            saveSessionId();
            await navigate("practice");
          }
          if (action === "reveal") {
            session = await api("practice/check", {
              id: session.id,
              position: session.position,
              reveal: true,
            });
            render();
          }
          if (action === "grade") {
            session = await api("practice/grade", {
              id: session.id,
              position: session.position,
              rating: button.dataset.rating,
            });
            await refresh();
            render();
            saveSessionId();
          }
          if (action === "retry") {
            session = await api("practice/start", {
              mode: "free",
              direction: session.direction,
              exercise: session.exercise,
              limit: 100,
              retrySessionId: session.id,
            });
            saveSessionId();
            render();
          }
      }
    } catch (error) {
      if (modal.open)
        modal.querySelector(".modal-error").textContent = error.message;
      else toast(error.message);
    } finally {
      operation = false;
      button.disabled = false;
    }
    return true;
  }
  function input(event) {
    if (event.target.id !== "vocab-search") return;
    const cursor = event.target.selectionStart;
    query = event.target.value;
    notebookPageNumber = 1;
    render();
    const field = document.querySelector("#vocab-search");
    field.focus();
    field.setSelectionRange(cursor, cursor);
  }
  function change(event) {
    if (event.target.dataset.familiarEntry) {
      const id = event.target.dataset.familiarEntry;
      if (event.target.checked) selectedFamiliar.add(id);
      else selectedFamiliar.delete(id);
      document.querySelector("#familiar-selection-count").textContent =
        `已选 ${selectedFamiliar.size} 个`;
      document.querySelector('[data-nb="bulk-familiar"]').disabled =
        !familiarSelection(true).length;
      document.querySelector('[data-nb="bulk-restore"]').disabled =
        !familiarSelection(false).length;
    }
    if (event.target.dataset.flowPref) {
      flowPreferences[event.target.dataset.flowPref] = event.target.value;
      try {
        localStorage.setItem(
          "english.practice.preferences",
          JSON.stringify(flowPreferences),
        );
      } catch {
        /* 偏好只保留在本次页面，也不影响练习。 */
      }
      const summary = document.querySelector(".flow-preferences > summary");
      if (summary) summary.textContent = "练习偏好 · 已应用";
    }
    if (event.target.id === "vocab-source") {
      source = event.target.value;
      notebookPageNumber = 1;
      render();
    }
    if (event.target.dataset.bookEntry) {
      const id = event.target.dataset.bookEntry;
      if (event.target.checked) selectedEntries.add(id);
      else selectedEntries.delete(id);
      document.querySelector("#book-selection-count").textContent =
        `已选 ${selectedEntries.size} 个`;
      document.querySelector('[data-nb="import-selected"]').disabled =
        selectedEntries.size === 0;
    }
    if (event.target.id === "vocab-kind") {
      kind = event.target.value;
      notebookPageNumber = 1;
      render();
    }
    if (event.target.id === "vocab-sort") {
      sort = event.target.value;
      notebookPageNumber = 1;
      render();
    }
  }
  async function restore() {
    try {
      const id = sessionStorage.getItem("english.practice");
      if (id) session = await api("practice/get", { id });
      if (session && !session.current && !session.flow) {
        openPracticeSetup();
        return;
      }
      if (session?.config) settings = session.config;
    } catch {
      session = null;
      saveSessionId();
    }
  }
  async function openClosing(id) {
    session = await api("practice/closing", { id });
    saveSessionId();
    await navigate("practice");
    document.querySelector(".flow-reading")?.scrollIntoView({ block: "start" });
  }
  async function remind() {
    if (reminderBusy) return;
    reminderBusy = true;
    try {
      const data = await api("state");
      if (!data.reminders.enabled || !data.dueCards.length) return;
      const now = new Date();
      const localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (localTime < data.reminders.time) return;
      const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const key = `english.reminded.${day}`;
      const notify = async () => {
        if (localStorage.getItem(key)) return;
        const message = `${data.dueCards.length} 个词条到期了，来练一小组吧。`;
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const notification = new Notification("Small Steps · 复习时间", {
              body: message,
              tag: "english-daily-review",
            });
            notification.onclick = () => {
              window.focus();
              navigate("notebook");
              notification.close();
            };
          } catch {
            /* 移动端可能不支持构造系统通知，继续显示站内提示。 */
          }
        }
        toast(message);
        localStorage.setItem(key, "1");
      };
      // 同一浏览器打开多个页面时，通过锁与本地标记合并提醒。
      if (navigator.locks)
        await navigator.locks.request("english-reminder", notify);
      else await notify();
    } catch {
      /* 网络或本地存储不可用时不循环弹窗，下一次定时检查重试。 */
    } finally {
      reminderBusy = false;
    }
  }
  modal.addEventListener("close", () => {
    document.body.append(document.querySelector("#toast"));
  });
  return {
    openClosing,
    openPracticeSetup,
    posTag,
    booksPage,
    progressPanel,
    reloadBookPreview: () =>
      preview && previewCards !== getData().cards ? loadPreview() : undefined,
    notebookPage,
    practicePage,
    click,
    submit,
    input,
    change,
    restore,
    remind,
  };
}
