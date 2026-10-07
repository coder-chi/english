export function createListening({
  api,
  render,
  navigate,
  esc,
  heading,
  toast,
}) {
  let shelf = null;
  let current = null;
  let busy = false;
  let version = 0;
  let filters = { query: "", scope: "all" };

  const outside = (url, label, style = "text-button") =>
    `<a class="${style}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const key = (form) => `listening.draft.${current?.id || "new"}.${form}`;
  function draft(form, defaults = {}) {
    try {
      return {
        ...defaults,
        ...JSON.parse(sessionStorage.getItem(key(form)) || "{}"),
      };
    } catch {
      return defaults;
    }
  }
  function input(form) {
    if (!form?.matches("[data-listening-form]")) return;
    sessionStorage.setItem(
      key(form.dataset.listeningForm),
      JSON.stringify(Object.fromEntries(new FormData(form))),
    );
  }
  const options = (items, selected) =>
    Object.entries(items)
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");

  async function enter() {
    const own = ++version;
    shelf = null;
    current = null;
    const next = await api("listening/list", filters);
    if (own !== version) return;
    shelf = next;
    const id = sessionStorage.getItem("listening.active");
    if (!id) return;
    try {
      const detail = await api("listening/get", { id });
      if (own === version) current = detail;
    } catch {
      sessionStorage.removeItem("listening.active");
    }
  }

  function importForm() {
    const d = draft("save");
    return `<details class="listen-import"><summary>添加 YouTube 单集</summary>
      <form data-listening-form="save" class="listen-form">
        <label class="wide">YouTube 链接<input name="url" type="url" value="${esc(d.url)}" placeholder="https://www.youtube.com/watch?v=…" maxlength="1500" required></label>
        <button class="text-button" type="button" data-listen="preview">读取标题</button>
        <label>标题<input name="title" value="${esc(d.title)}" maxlength="300" required></label>
        <label>频道<input name="channel" value="${esc(d.channel || "BBC · 6 Minute English")}" maxlength="160" required></label>
        <button class="button primary" type="submit">添加</button>
      </form>
    </details>`;
  }

  function listPage() {
    if (!shelf) return '<p class="loading">正在打开听力手册…</p>';
    const s = shelf.stats;
    return `${heading("LISTENING NOTES", "听力手册", "听过、文稿、笔记，仅此而已。")}
      <div class="listen-toolbar">
        ${outside(shelf.channel.url, "打开节目列表", "button outline")}
        <button class="text-button" data-listen="sync">同步单集</button>
        ${importForm()}
      </div>
      <section class="listen-stats" aria-label="听力概览">
        <div><strong>${s.total}</strong><span>全部</span></div>
        <div><strong>${s.heard}</strong><span>已听</span></div>
        <div><strong>${s.transcripts}</strong><span>有逐字稿</span></div>
        <div><strong>${s.notes}</strong><span>有笔记</span></div>
      </section>
      <form data-listening-form="filter" class="listen-filter">
        <label>搜索<input name="query" value="${esc(filters.query)}" placeholder="标题 / 频道" maxlength="160"></label>
        <label>状态<select name="scope">${options({ all: "全部", queued: "未听", heard: "已听" }, filters.scope)}</select></label>
        <button class="button outline" type="submit">筛选</button>
      </form>
      <div class="listen-list">${
        shelf.items
          .map((episode) => {
            const listened = episode.status !== "queued";
            return `<article class="listen-row">
            <button class="listen-check ${listened ? "checked" : ""}" data-listen="quick-status" data-id="${esc(episode.id)}" data-listened="${!listened}" aria-label="${listened ? "标记为未听" : "标记为已听"}">${listened ? "✓" : ""}</button>
            <button class="listen-row-main" data-listen="open" data-id="${esc(episode.id)}">
              <strong>${esc(episode.title)}</strong>
              <span>${esc(episode.channel)}</span>
            </button>
            <div class="listen-row-state">
              <span>${listened ? "已听" : "未听"}</span>
              <span>${episode.hasTranscript ? "有逐字稿" : "无逐字稿"}</span>
              <span>${episode.hasNote ? "有笔记" : "无笔记"}</span>
            </div>
          </article>`;
          })
          .join("") || '<p class="empty">没有匹配的单集。</p>'
      }</div>`;
  }

  function transcriptPanel() {
    if (!current.transcript)
      return `<section class="listen-simple-section">
        <div><h2>逐字稿</h2><p>尚未获取。</p></div>
        <button class="button outline" data-listen="fetch-transcript">获取 YouTube 逐字稿</button>
      </section>`;
    const d = draft("transcript", { transcript: current.transcript });
    const analysis = current.transcriptAnalysis;
    return `<details class="listen-transcript">
      <summary><span>逐字稿</span><strong>已保存</strong></summary>
      <div class="listen-transcript-meta">${current.transcript_source ? outside(current.transcript_source, "查看来源") : ""}<span>${esc(current.resources?.transcript?.kind || "手动保存")}</span></div>
      <form data-listening-form="transcript" class="listen-transcript-form">
        <input type="hidden" name="transcriptSource" value="${esc(current.transcript_source)}">
        <label>编辑逐字稿<textarea name="transcript" rows="16" maxlength="60000">${esc(d.transcript)}</textarea></label>
        <div class="listen-transcript-actions">
          <button class="button outline" type="submit">保存修改</button>
          <button class="text-button" type="button" data-listen="analyze-transcript">${analysis ? "重新提取重点词语" : "提取重点词语"}</button>
        </div>
      </form>
      ${
        analysis
          ? `<section class="listen-keywords"><h3>重点词语与词组</h3>
            <div>${analysis.items
              .map(
                (item) => `<article>
                  <div><strong>${esc(item.term)}</strong><span>${item.type === "phrase" ? "词组" : "单词"}</span>${item.inNotebook ? "<small>已在生词本</small>" : ""}</div>
                  ${item.meaning ? `<p>${esc(item.meaning)}</p>` : ""}
                  <blockquote>${esc(item.context)}</blockquote>
                  ${item.wordId ? `<button class="text-button" data-k="word" data-word="${esc(item.wordId)}">查看词条</button>` : ""}
                </article>`,
              )
              .join("")}</div>
          </section>`
          : ""
      }
    </details>`;
  }

  function detailPage() {
    const d = draft("note", { note: current.note });
    const listened = current.status !== "queued";
    return `${heading("LISTENING NOTE", esc(current.title), esc(current.channel), '<button class="text-button" data-listen="back">← 返回列表</button>')}
      <div class="listen-detail-actions">
        ${outside(current.url, "打开 YouTube", "button primary")}
        <span>${current.transcript ? "有逐字稿" : "无逐字稿"}</span>
      </div>
      <form data-listening-form="note" class="listen-note">
        <label class="listen-checkbox">
          <input type="checkbox" name="listened" ${listened ? "checked" : ""}>
          <span>我听过这一集</span>
        </label>
        <label>听力笔记
          <textarea name="note" rows="10" maxlength="12000" placeholder="记下听懂的内容、没听清的地方，或想复习的词句。">${esc(d.note)}</textarea>
        </label>
        <button class="button primary" type="submit">保存</button>
      </form>
      ${transcriptPanel()}`;
  }

  function page() {
    return current ? detailPage() : listPage();
  }

  async function click(button) {
    const action = button.dataset.listen;
    if (!action) return false;
    if (busy) return true;
    busy = true;
    button.disabled = true;
    const original = button.textContent;
    try {
      switch (action) {
        case "open":
          current = await api("listening/get", { id: button.dataset.id });
          sessionStorage.setItem("listening.active", current.id);
          navigate("listening", true);
          break;
        case "back":
          sessionStorage.removeItem("listening.active");
          shelf = await api("listening/list", filters);
          current = null;
          render();
          break;
        case "quick-status":
          await api("listening/update", {
            id: button.dataset.id,
            listened: button.dataset.listened === "true",
          });
          shelf = await api("listening/list", filters);
          render();
          break;
        case "sync": {
          button.textContent = "同步中…";
          const result = await api("listening/sync", {});
          shelf = await api("listening/list", filters);
          render();
          toast(result.error || `已同步，新增 ${result.added} 集`);
          break;
        }
        case "preview": {
          const form = button.closest("form");
          button.textContent = "读取中…";
          const result = await api("listening/preview", {
            url: form.elements.url.value,
          });
          if (result.title) form.elements.title.value = result.title;
          if (result.channel) form.elements.channel.value = result.channel;
          input(form);
          toast(result.warning || "标题已读取");
          break;
        }
        case "fetch-transcript":
          button.textContent = "正在读取 YouTube 字幕…";
          current = await api("listening/transcript-fetch", { id: current.id });
          render();
          toast("逐字稿已保存");
          break;
        case "analyze-transcript":
          button.textContent = "正在提取…";
          current = await api("listening/transcript-analyze", {
            id: current.id,
          });
          render();
          document
            .querySelector(".listen-transcript")
            ?.setAttribute("open", "");
          toast("重点词语已更新");
          break;
      }
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = original;
    }
    return true;
  }

  async function submit(form) {
    if (busy) return;
    busy = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    input(form);
    const kind = form.dataset.listeningForm;
    const draftKey = key(kind);
    const values = Object.fromEntries(new FormData(form));
    try {
      if (kind === "filter") {
        filters = values;
        shelf = await api("listening/list", filters);
      } else if (kind === "save") {
        current = await api("listening/save", values);
        sessionStorage.setItem("listening.active", current.id);
        toast(current.duplicate ? "已存在，打开原记录" : "已添加");
      } else if (kind === "note") {
        current = await api("listening/update", {
          id: current.id,
          listened: form.elements.listened.checked,
          note: values.note,
        });
        toast("已保存");
      } else if (kind === "transcript") {
        current = await api("listening/update", {
          id: current.id,
          transcript: values.transcript,
          transcriptSource: values.transcriptSource,
        });
        toast("逐字稿已保存");
      }
      sessionStorage.removeItem(draftKey);
      render();
      if (kind === "transcript")
        document.querySelector(".listen-transcript")?.setAttribute("open", "");
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  return { enter, page, click, submit, input };
}
