export function createLearningHub({
  api,
  render,
  navigate,
  esc,
  heading,
  notebook,
  toast,
  getData,
}) {
  let puzzle = null;
  let records = null;
  let busy = false;
  let selected = [];
  let answer = "";
  let dimension = "expression";
  const modeNames = {
    assemble: "词块拼句",
    cloze: "首字母补词",
    recall: "独立补关键词",
  };
  const outcomeNames = {
    independent: "独立完成",
    assisted: "借助提示完成",
    different: "已核对参考表达",
    skipped: "这次先跳过",
  };
  const date = (at) => new Date(at).toLocaleDateString("zh-CN");
  const storage = {
    get(key) {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        /* 存储不可用时仍可练习。 */
      }
    },
  };
  const draftKey = () =>
    `english.puzzle.draft.${puzzle?.id}.${puzzle?.position}`;
  function draft() {
    storage.set(draftKey(), JSON.stringify({ selected, answer }));
  }
  function adopt(value) {
    puzzle = value;
    storage.set("english.puzzle", puzzle.id);
    selected = [];
    answer = "";
    try {
      const saved = JSON.parse(storage.get(draftKey()) || "{}");
      selected = Array.isArray(saved.selected)
        ? saved.selected.filter((id) =>
            puzzle.current?.chunks.some((c) => c.id === id),
          )
        : [];
      answer = typeof saved.answer === "string" ? saved.answer : "";
    } catch {
      /* 损坏的草稿不影响服务端进度。 */
    }
  }
  async function enter(tab) {
    if (tab === "records") records = await api("learning/records", {});
    if (tab === "puzzle") {
      const id = storage.get("english.puzzle");
      if (id) {
        try {
          adopt(await api("puzzle/get", { id }));
        } catch (error) {
          toast(error.message);
        }
      }
    }
  }
  function today() {
    const recent = getData().recentSessions.find((s) => s.done < s.total);
    return `${heading("SMALL STEPS / YOUR DAILY PATH", "今天，也学一点英语。", "从一小轮开始，把认识的词变成用得出的表达。")}
      <section class="hub-hero"><div><span class="eyebrow">ONE SMALL ROUND</span><h2>想起一个词，<br>用好一句话。</h2><p>每轮最多 10 词，吃力时自动减负。<br>练完用同一批词玩拼图，再读一小段收尾。</p><div class="hub-actions"><button class="button primary" data-nb="flow-start">一键开练 <span aria-hidden="true">→</span></button>${recent ? `<button class="text-button" data-nb="resume" data-id="${esc(recent.id)}">继续上次 ${recent.done} / ${recent.total}</button>` : ""}</div></div><ol class="hub-path"><li><span>01</span><div><strong>回想 · 轻轻唤醒</strong><p>到期词优先，新词最多 3 个</p></div></li><li><span>02</span><div><strong>拼句 · 用一次看看</strong><p>最多 3 句，可提示、可跳过</p></div></li><li><span>03</span><div><strong>读懂 · 轻松收尾</strong><p>一段熟词短文，今天就很好</p></div></li></ol></section>
      <div class="hub-entry-grid"><button data-tab="explore"><span class="eyebrow">FOLLOW YOUR CURIOSITY</span><h2>自由探索 ↗</h2><p>想读、想听，还是想拼一句？</p></button><button data-tab="records"><span class="eyebrow">EVERY STEP LEAVES A TRACE</span><h2>我的积累 ↗</h2><p>看看学过的词、完成的句子与听懂的篇目。</p></button></div>
      ${notebook.progressPanel()}`;
  }
  function explore() {
    const groups = [
      [
        "用起来",
        "让熟词回到语境里",
        [
          ["puzzle", "语境拼图", "词块拼句 → 首字母补词 → 独立补词"],
          ["reading", "复习短文", "读一段包含熟词的短文"],
          ["sentences", "例句回顾", "从收藏的例句里回想表达"],
        ],
      ],
      [
        "读与听",
        "跟着兴趣走一小段",
        [
          ["listening", "听力手册", "听一篇，记录实际理解"],
          ["discover", "发现内容", "寻找感兴趣的话题"],
          ["library", "我的书架", "继续一篇读到一半的内容"],
          ["create", "生成练习", "按话题生成阅读材料"],
        ],
      ],
      [
        "词与记忆",
        "选择自己的学习范围",
        [
          ["practice", "双向练习", "自由选择词书、方向与练法"],
          ["review", "间隔复习", "回想到期词条"],
          ["books", "词书", "看进度，选词书"],
          ["notebook", "生词本", "整理个人收藏"],
          ["words", "统一词库", "跨词书查看释义与例句"],
        ],
      ],
    ];
    return `${heading("FOLLOW YOUR CURIOSITY", "今天，想怎么学？", "选一种喜欢的方式，学一点就有一点收获。")}
      ${groups.map(([title, description, links]) => `<section class="hub-explore"><div><h2>${title}</h2><p>${description}</p></div><div>${links.map(([tab, label, copy]) => `<button data-tab="${tab}"><strong>${label} <span>↗</span></strong><p>${copy}</p></button>`).join("")}</div></section>`).join("")}`;
  }
  function puzzlePage() {
    const intro = heading(
      "WORDS INTO CONTEXT",
      "语境拼图",
      "从学过的词出发，每轮最多三句。不计时，也不用一口气做完。",
    );
    if (!puzzle)
      return `${intro}<section class="hub-empty"><span class="hub-symbol">Aa</span><h2>把熟悉的词，拼成一句话。</h2><p>独立完成后，下次同一句会少一点提示。<br>随时可以看参考句，或者跳过。</p><button class="button primary" data-hub="start">开始一轮拼图 →</button></section>`;
    const c = puzzle.current;
    if (!c)
      return `${intro}<section class="hub-empty"><span class="hub-symbol">✓</span><h2>${puzzle.total ? "这一轮，收好了。" : "先给拼图攒一点材料。"}</h2><p>${puzzle.total ? `独立完成 ${puzzle.results.filter((r) => r.outcome === "independent").length} 句 · 借助提示完成 ${puzzle.results.filter((r) => r.outcome === "assisted").length} 句。` : "这一批词还没有适合拼图的已学例句。学几个词，或为熟词添加中英例句后再来。"}</p><div class="hub-actions">${puzzle.closingAvailable ? '<button class="button primary" data-hub="closing">读熟词短文收尾 →</button>' : '<button class="button primary" data-nb="flow-start">学一小轮 →</button>'}<button class="button outline" data-tab="records">看看我的积累</button><button class="text-button" data-hub="start">再玩一轮</button></div></section>${puzzle.results.map((r) => `<article class="hub-evidence"><span class="tag">${outcomeNames[r.outcome]}</span><p lang="en">${esc(r.english)}</p><small>${esc(r.chinese)}</small></article>`).join("")}`;
    const picked = selected
      .map((id) => c.chunks.find((chunk) => chunk.id === id))
      .filter(Boolean);
    const successMessage =
      c.mode === "recall"
        ? "这次独立补词已记录。可以换一句，也可以随时结束。"
        : "已留下这次具体记录。换到下一轮，同一句再少一点提示。";
    return `${intro}<div class="practice-progress"><span>第 ${puzzle.position + 1} / ${puzzle.total} 句</span><progress max="${puzzle.total}" value="${puzzle.position}" aria-label="拼图进度"></progress><button class="text-button" data-tab="today">暂停，稍后继续</button></div>
      <section class="puzzle-board"><div class="puzzle-top"><span class="tag">${modeNames[c.mode]}</span><small>${c.hinted ? "已使用提示 · 仍然是一次练习" : "提示随时都在"}</small></div><h2>${esc(c.chinese)}</h2><p class="fineprint">${c.mode === "assemble" ? "点击词块拼出参考句；点击已选词块可以撤回。" : c.mode === "cloze" ? `补上空缺的词或短语，首字母是 ${esc(c.initial)}。` : "试着独立补上空缺的词或短语。"}</p>
      ${c.mode === "assemble" ? `<div class="puzzle-slots" aria-label="已选词块">${picked.length ? picked.map((chunk) => `<button data-hub="remove" data-chunk="${chunk.id}" ${c.result ? "disabled" : ""}>${esc(chunk.text)} <span aria-hidden="true">×</span></button>`).join("") : "<span>句子从这里开始…</span>"}</div><div class="puzzle-bank" aria-label="可选词块">${c.chunks.map((chunk) => `<button data-hub="pick" data-chunk="${chunk.id}" ${selected.includes(chunk.id) || c.result ? "disabled" : ""}>${esc(chunk.text)}</button>`).join("")}</div>` : `<p class="puzzle-prompt" lang="en">${esc(c.prompt)}</p>`}
      ${!c.result ? `<form id="puzzle-answer">${c.mode !== "assemble" ? `<label for="puzzle-input">空缺的词或短语</label><input id="puzzle-input" name="answer" value="${esc(answer)}" autocomplete="off" spellcheck="false" maxlength="300" required>` : ""}<div class="hub-actions"><button class="button primary" type="submit" ${c.mode === "assemble" && picked.length !== c.chunks.length ? "disabled" : ""}>核对这句话</button><button class="button outline" type="button" data-hub="hint" ${c.hinted ? "disabled" : ""}>看参考句提示</button><button class="text-button" type="button" data-hub="skip">这句先跳过</button></div></form>` : ""}
      ${c.solution ? `<div class="puzzle-feedback" role="status"><strong>${c.result ? outcomeNames[c.result.outcome] : "参考句 · 看完还可以自己拼一次"}</strong><p lang="en">${esc(c.solution)}</p>${c.result ? `<p>${c.result.outcome === "different" ? "与参考表达不同不一定不合理。本次只记录核对，不计独立完成；下次保留当前难度。" : c.result.outcome === "independent" ? successMessage : "已记录这次辅助练习，下次仍保留当前难度。"}</p><button class="button primary" data-hub="next">${puzzle.position + 1 === puzzle.total ? "收好这一轮" : "下一句 →"}</button>` : ""}</div>` : ""}
      </section><p class="fineprint">记录的是参考句拼写与词块练习；独立拼句、补词分别展示，不等同于自由表达能力。</p>`;
  }
  function recordsPage() {
    if (!records) return '<p role="status">正在打开你的积累…</p>';
    const tabs = [
      ["memory", "记忆", records.counts.memory, "学过的词条 · 自评"],
      ["expression", "表达", records.counts.expression, "独立完成的不同句子"],
      [
        "listening",
        "听辨",
        records.counts.listening,
        "无字幕听懂的篇目 · 自评",
      ],
    ];
    const list = records[dimension];
    return `${heading("YOUR EVIDENCE, NOT A SCORE", "我的积累", "每一步都有具体内容。点击一个维度，看看你已经做过什么。")}
      <div class="ability-tabs">${tabs.map(([key, title, count, label]) => `<button data-hub="dimension" data-dimension="${key}" aria-pressed="${dimension === key}"><span>${title} ↗</span><strong>${count}<small>${key === "memory" ? "词条" : key === "expression" ? "句" : "篇"}</small></strong><p>${label}</p></button>`).join("")}</div>
      <section class="ability-detail"><h2>${dimension === "memory" ? "开始记住的词" : dimension === "expression" ? "用过的具体表达" : "听懂过的具体篇目"}</h2><p>${dimension === "memory" ? "完成过首次学习评分的未归档词条；评分是自评，不代表独立作答或长期掌握。" : dimension === "expression" ? `独立完成 ${records.counts.expression} 句，借助提示完成 ${records.counts.assisted} 句。两者可能包含同一句；上方按独立完成的句子去重，下方按句子、任务和辅助情况显示最近记录。` : "无字幕且自评听懂大意或大部分的篇目，重复听同一篇只计一次。这是理解自评。"} </p>
      ${list.length ? list.map((e) => `<article class="hub-evidence"><div><span class="tag">${dimension === "memory" ? "首次学习 · 自评" : dimension === "expression" ? `${modeNames[e.mode]} · ${outcomeNames[e.outcome]}` : `无字幕 · ${e.understanding === "most" ? "听懂大部分" : "听懂大意"} · 自评`}</span><time>${date(e.at)}</time></div><h3>${esc(e.english || e.term || e.title)}</h3><p>${esc(e.chinese || e.meaning || `实际听了 ${e.minutes} 分钟`)}</p>${dimension === "expression" ? `<small>练习词：${esc(e.term)}</small>` : ""}</article>`).join("") : `<div class="hub-empty"><h3>这里还没有记录，也没关系。</h3><p>${dimension === "expression" ? "试着拼一句，让学过的词留下新的痕迹。" : dimension === "memory" ? "完成一次词汇学习评分，这里就会留下词条。" : "在听力手册保存一次实际听力记录，从大意开始。"}</p><button class="button outline" data-tab="${dimension === "expression" ? "puzzle" : dimension === "memory" ? "practice" : "listening"}">开始一点点 →</button></div>`}</section>
      ${notebook.progressPanel()}`;
  }
  async function run(work) {
    if (busy) return;
    busy = true;
    try {
      await work();
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
    }
  }
  async function click(button) {
    const action = button.dataset.hub;
    if (action === "dimension") {
      dimension = button.dataset.dimension;
      render();
      return;
    }
    if (action === "pick" || action === "remove") {
      if (busy || puzzle?.current?.result) return;
      const id = Number(button.dataset.chunk);
      selected =
        action === "pick"
          ? [...new Set([...selected, id])]
          : selected.filter((c) => c !== id);
      draft();
      render();
      document
        .querySelector(
          `[data-hub="${action === "pick" ? "remove" : "pick"}"][data-chunk="${id}"]`,
        )
        ?.focus();
      return;
    }
    await run(async () => {
      if (action === "start") {
        const key = `english.puzzle.start.${button.dataset.practice || "free"}`;
        const startToken = storage.get(key) || crypto.randomUUID();
        storage.set(key, startToken);
        adopt(
          await api("puzzle/start", {
            token: startToken,
            practiceSessionId: button.dataset.practice || undefined,
          }),
        );
        storage.set(key, "");
        await navigate("puzzle");
      } else if (action === "closing")
        await notebook.openClosing(puzzle.practiceSessionId);
      else {
        adopt(
          await api("puzzle/act", {
            id: puzzle.id,
            position: puzzle.position,
            action,
          }),
        );
        render();
      }
    });
  }
  async function submit(form) {
    await run(async () => {
      answer = new FormData(form).get("answer") || "";
      draft();
      adopt(
        await api("puzzle/act", {
          id: puzzle.id,
          position: puzzle.position,
          action: "check",
          chunks: selected,
          answer,
        }),
      );
      render();
    });
  }
  function input(event) {
    if (event.target.id === "puzzle-input") {
      answer = event.target.value;
      draft();
    }
  }
  return {
    today,
    explore,
    puzzlePage,
    recordsPage,
    enter,
    click,
    submit,
    input,
  };
}
