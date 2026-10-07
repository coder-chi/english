const labels = { meaning: "近义辨析", spelling: "形近易混", family: "同词族" };
export function renderAssociations(
  value,
  currentId,
  esc,
  { compact = false } = {},
) {
  const groups = [...(value?.curated || []), ...(value?.personal || [])];
  if (compact && !groups.length) return "";
  const link = (w) =>
    w.id === currentId
      ? `<strong class="association-current">${esc(w.term)}</strong>`
      : `<button class="word-link" data-k="word" data-word="${esc(w.id)}">${esc(w.term)} ↗</button>`;
  const cards = groups
    .map(
      (
        group,
        index,
      ) => `<details class="association-card" ${!compact && index === 0 ? "open" : ""}>
    <summary><span class="tag">${labels[group.type]}</span><span>${group.words.map((w) => esc(w.term)).join(" ↔ ")}</span><small>${group.origin === "personal" ? "个人整理" : "用法对照"}</small></summary>
    <div class="association-body"><p class="association-common">${esc(group.common)}</p>
    <div class="association-pair">${group.words.map((w) => `<article class="${w.id === currentId ? "is-current" : ""}"><h3>${link(w)}</h3><p>${esc(w.meaning)}</p>${w.usage.length ? `<ul>${w.usage.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}${w.example ? `<blockquote><p lang="en">${esc(w.example)}</p><p>${esc(w.translation)}</p></blockquote><button class="text-button" data-speak="${esc(w.example)}">朗读 ${esc(w.term)} 例句</button>` : ""}</article>`).join("")}</div>
    <div class="association-distinction"><strong>${group.origin === "personal" ? "我的记法" : "怎么区分"}</strong><p>${esc(group.contrast)}</p></div>
    ${group.origin === "curated" ? `<p class="fineprint">辨析与例句为学习用原创整理 · 释义参考：${group.words.map((w) => `<a href="${esc(w.reference)}" target="_blank" rel="noopener noreferrer">Cambridge · ${esc(w.term)} ↗</a>`).join(" / ")}</p>` : !compact ? `<div class="association-controls"><button class="text-button" data-k="association-edit" data-id="${esc(group.id)}">编辑联想笔记</button><button class="text-button" data-k="association-remove" data-id="${esc(group.id)}">移除这条联想</button></div>` : ""}
    </div></details>`,
    )
    .join("");
  const terms = [
    ...new Set(
      groups.flatMap((g) =>
        g.words.filter((w) => w.id !== currentId).map((w) => w.term),
      ),
    ),
  ];
  return compact
    ? `<details class="association-mini"><summary>联想一下 · ${terms.map(esc).join(" / ")}</summary><p class="fineprint">想多记一点时再展开；相近不表示可以直接替换。</p>${cards}</details>`
    : `<section class="word-associations" aria-label="联想与辨析"><div class="section-heading"><h2>联想与辨析 <span>WORDS CONNECT</span></h2></div><p class="fineprint">把相近的意思、易混的拼写和同词族分开看。展开一组，对照常见搭配。</p>${cards || '<p class="association-empty">这个词还没有整理好的联想。可以在下面写下自己的关联和区别。</p>'}</section>`;
}
export function associationForm(esc, term) {
  return `<details class="association-editor"><summary>+ 记一组自己的联想</summary><form id="association-form" class="notebook-form">
    <p>当前词：<strong>${esc(term)}</strong>。保存后，从两个词都能看到这条笔记。</p>
    <div class="form-row"><label>联想到的英文词或短语<input name="relatedTerm" maxlength="160" required placeholder="例如 preservation" autocomplete="off"></label>
    <label>联想类型<select name="type"><option value="meaning">近义辨析</option><option value="spelling">形近易混</option><option value="family">同词族</option></select></label></div>
    <label>我的联想与区别<textarea name="note" maxlength="1600" rows="3" required placeholder="哪里相近？分别在哪种场景使用？也可以写下自己的记法。"></textarea></label>
    <p class="fineprint">关联词须已在统一词库中。同一对词、同一种类型再次保存会更新原笔记；个人整理不会被当作词典释义，也不增加已学词数。</p>
    <div class="form-actions"><button type="submit" class="button primary">保存联想</button><button type="button" class="text-button" data-k="association-reset">清空重填</button></div></form></details>`;
}
