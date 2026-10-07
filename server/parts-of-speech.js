export const partsOfSpeech = {
  "n.": "名词",
  "v.": "动词",
  "vt.": "及物动词",
  "vi.": "不及物动词",
  "adj.": "形容词",
  "adv.": "副词",
  "pron.": "代词",
  "det.": "限定词",
  "art.": "冠词",
  "prep.": "介词",
  "conj.": "连词",
  "num.": "数词",
  "interj.": "感叹词",
  "aux.": "助动词",
  "modal.": "情态动词",
  "abbr.": "缩写",
  prefix: "前缀",
  suffix: "后缀",
  "n. phr.": "名词短语",
  "v. phr.": "动词短语",
  "adj. phr.": "形容词短语",
  "adv. phr.": "副词短语",
  "prep. phr.": "介词短语",
  "expr.": "表达",
};
const aliases = new Map(
  Object.entries(partsOfSpeech).flatMap(([code, label]) => [
    [code, code],
    [code.replaceAll(".", ""), code],
    [label, code],
  ]),
);
aliases.set("a.", "adj.");
aliases.set("a", "adj.");
aliases.set("名词性短语", "n. phr.");
aliases.set("动词性短语", "v. phr.");
// 单词/短语是词条形式；名词/动词等才是词性。多词性统一格式，防止显示和校验各用一套缩写。
export function normalizePartOfSpeech(value) {
  if (typeof value !== "string" || value.length > 160) return null;
  if (!value.trim()) return "";
  const codes = value
    .trim()
    .toLowerCase()
    .split(/\s*[/,，;；、]\s*/)
    .map((code) => aliases.get(code.trim().replace(/\s+/g, " ")));
  if (codes.some((code) => !code)) return null;
  return [...new Set(codes)].join(" / ");
}
