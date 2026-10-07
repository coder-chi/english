"""从固定校验值的开放数据构建词库；仅运行此脚本时联网，应用运行时离线读取产物。"""
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".artifacts/lexicon-sources"
OUTPUT = ROOT / "server/data"
COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
SOURCES = {
    "ecdict.csv": (
        f"https://raw.githubusercontent.com/skywind3000/ECDICT/{COMMIT}/ecdict.csv",
        "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf",
    ),
    "ngsl.csv": (
        "https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv",
        "2098bab8955a120a9766c6282a51d7d578c6cb0a7d946600d2ffb73ba25a0b44",
    ),
    "nawl.csv": (
        "https://www.newgeneralservicelist.com/s/NAWL_12_lemmatized_for_teaching.csv",
        "1790b0fa22c5815ebf5a9a15c9363c03a6e906c77bf217f99033734f1459137b",
    ),
    "ECDICT-LICENSE": (
        f"https://raw.githubusercontent.com/skywind3000/ECDICT/{COMMIT}/LICENSE",
        "f8552dd246f61a4e064569eae6194a01c6b3d63b03bf27c6ca863593c549ed0f",
    ),
}

# 高频虚词的词典原数据混有字母/技术缩写义，明确修订常用义。
OVERRIDES = {
    "a": "一个；一（不定冠词）", "the": "这；那（定冠词，表示特指）",
    "i": "我", "be": "是；存在；处于", "am": "是（be 的第一人称单数现在式）",
    "have": "有；拥有", "do": "做；干（也用作助动词）",
    "may": "可能；可以", "can": "能够；可以", "will": "将；愿意",
    "would": "将会；愿意（用于假设或委婉表达）", "shall": "将；应当",
    "should": "应该；应当", "must": "必须；一定",
    "ought": "应当；应该（常与 to 连用）", "us": "我们（宾格）",
    "it": "它", "its": "它的", "as": "作为；像；当……时；因为",
    "online": "在线的；联网的", "descriptor": "描述符；描述性词语",
    "globalization": "全球化", "micro": "微小的；微型的（常作构词成分）",
    "multi": "多；多个（构词成分）", "neo": "新的；新型的（构词成分）",
    "semi": "半；部分（构词成分）", "trans": "跨越；转变（构词成分）",
    "recycling": "回收利用", "internet": "互联网",
    "drop-out": "辍学者；退出者", "keyword": "关键词",
    "low-risk": "低风险的", "mathematic": "数学的（较少用，通常用 mathematical）",
    "psycholinguistic": "心理语言学的", "water-proof": "防水的",
}
LEXICAL = re.compile(r"[a-z]+(?:[-'][a-z]+)*")
CHINESE = re.compile(r"[\u4e00-\u9fff]")
POS_ALIASES = {
    "n": "n.", "pl": "n.", "v": "v.", "vt": "vt.", "vi": "vi.",
    "a": "adj.", "adj": "adj.", "adv": "adv.", "prep": "prep.",
    "pron": "pron.", "conj": "conj.", "art": "art.", "num": "num.",
    "interj": "interj.", "aux": "aux.", "abbr": "abbr.",
}
# 与人工补订释义一致；词典缺少词性时仅明确补订，不依赖词尾猜测。
POS_OVERRIDES = {
    "a": "art.", "the": "art.", "i": "pron.", "be": "v.", "am": "v.",
    "have": "v.", "do": "v. / aux.", "may": "modal.", "can": "modal.",
    "will": "modal.", "would": "modal.", "shall": "modal.", "should": "modal.",
    "must": "modal.", "ought": "modal.", "us": "pron.", "it": "pron.",
    "its": "det.", "as": "prep. / conj.", "online": "adj. / adv.",
    "descriptor": "n.", "globalization": "n.", "micro": "prefix",
    "multi": "prefix", "neo": "prefix", "semi": "prefix", "trans": "prefix",
    "tv": "n. / abbr.", "recycling": "n.", "cola": "n.", "internet": "n.",
    "booklist": "n.", "drop-out": "n.", "fund-raise": "v.", "hard-work": "n.",
    "keyword": "n.", "low-risk": "adj.", "mathematic": "adj.",
    "psycholinguistic": "adj.", "water-proof": "adj.", "wollongong": "n.",
}


def part_of_speech(row):
    word = row["word"].lower()
    if word in POS_OVERRIDES:
        return POS_OVERRIDES[word]
    codes = []
    # 只抽取实际保留的前三行中文释义所带的词性，排除另行剔除的专业释义。
    lines = [line.strip() for line in row["translation"].replace("\\n", "\n").splitlines()
             if CHINESE.search(line) and not line.strip().startswith("[")]
    for line in lines[:3]:
        prefix = re.match(r"^((?:[a-z]+\.\s*(?:[,/&]\s*)?)+)", line)
        if prefix:
            for token in re.findall(r"([a-z]+)\.", prefix[1]):
                code = POS_ALIASES.get(token)
                if code and code not in codes:
                    codes.append(code)
    return " / ".join(codes)


def acquire(name):
    url, expected = SOURCES[name]
    path = CACHE / name
    if not path.exists():
        temporary = path.with_suffix(".part")
        with urllib.request.urlopen(url, timeout=40) as response, temporary.open("wb") as f:
            while chunk := response.read(1024 * 1024):
                f.write(chunk)
        temporary.replace(path)
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError(f"{name}: 源文件校验值变化，请审查后更新，禁止静默替换")
    return raw


def gloss(row):
    if row["word"].lower() in OVERRIDES:
        return OVERRIDES[row["word"].lower()]
    value = row["translation"].replace("\\r", "").replace("\\n", "\n")
    lines = []
    for line in value.splitlines():
        line = line.strip()
        if line.startswith("["):
            continue
        line = re.sub(r"^(?:(?:n|v|vt|vi|a|adj|adv|prep|pron|conj|art|num|interj|aux|pl)\.\s*)+", "", line)
        line = re.sub(r"\[[^\]]*\]", "", line).strip()
        if CHINESE.search(line):
            lines.append(line.replace(", ", "；"))
    # 不截断半个释义，最多保留三行；完整上游条目在词典源中可核查。
    return "；".join(lines[:3])[:800].strip("； ")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    raw = {name: acquire(name) for name in SOURCES}
    dictionary = {}
    for row in csv.DictReader(io.StringIO(raw["ecdict.csv"].decode("utf-8-sig"))):
        word = row["word"].lower()
        if not LEXICAL.fullmatch(word) or not CHINESE.search(row["translation"]):
            continue
        # 避免大写缩写覆盖相同拼写的日常词义。
        if word not in dictionary or row["word"] == word:
            dictionary[word] = row
    ngsl = list(csv.DictReader(io.StringIO(raw["ngsl.csv"].decode("utf-8-sig"))))
    nawl = [r[0] for r in csv.reader(io.StringIO(raw["nawl.csv"].decode("cp1252"))) if r]
    # 旧条目是唯一权威来源，保持 ID、释义、例句和顺序逐字不变。
    original = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e",
         "import {ieltsCoreEntries} from './server/ielts-wordbook.js'; console.log(JSON.stringify(ieltsCoreEntries));"],
        cwd=ROOT, text=True, env={**os.environ, "BUILD_LEXICON": "1"},
    ))
    seen = {e["term"].lower() for e in original}
    output, missing, collapsed = [], [], []

    def add(word, tier, source):
        word = word.lower().strip()
        if word in seen:
            return
        row = dictionary.get(word)
        meaning = gloss(row) if row else ""
        if not meaning:
            missing.append({"word": word, "source": source})
            return
        pos = part_of_speech(row)
        if not pos:
            raise ValueError(f"{word} 缺少明确的词性，请核查后补订")
        seen.add(word)
        output.append({
            "id": word, "term": "I" if word == "i" else word,
            "meaning": meaning, "kind": "word", "example": "", "translation": "",
            "partOfSpeech": pos,
            "category": f"雅思·{tier}", "section": tier,
            "phonetic": row["phonetic"],
            "note": f"学习层：{tier}；选词来源：{source}。中文释义：{'Small Steps 人工补订' if word in OVERRIDES else 'ECDICT，经格式清洗，尚未逐条人工审校'}。请结合上下文选择义项。",
            "provenance": source,
        })

    for index, row in enumerate(ngsl):
        # 分层是本项目学习顺序，不宣称等同 IELTS 分数或 CEFR 等级。
        tier = "高频基础 1" if index < 1000 else "高频基础 2" if index < 2000 else "高频进阶"
        add(row["Lemma"], tier, "NGSL 1.2")
    for word in nawl:
        add(word, "学术阅读", "NAWL 1.2")
    candidates = [r for r in dictionary.values() if "ielts" in r["tag"].split()]
    candidates.sort(key=lambda r: (int(r["bnc"]) if r["bnc"].isdigit() and int(r["bnc"]) > 0 else 999999, r["word"]))
    for row in candidates:
        word = row["word"].lower()
        forms = dict(p.split(":", 1) for p in row["exchange"].split("/") if ":" in p)
        base = forms.get("0", "").lower()
        # 去除词典明确标注的屈折重复形式，不用复数/过去式凑数量。
        if base and base != word and base in dictionary and LEXICAL.fullmatch(base):
            collapsed.append({"form": word, "lemma": base})
            word = base
        add(word, "备考拓展", "ECDICT 社区 IELTS 标签")
    if missing:
        (OUTPUT / "ielts-missing.json").write_text(json.dumps(missing, ensure_ascii=False, indent=2), encoding="utf-8")
        raise ValueError(f"有 {len(missing)} 个源词缺少可用中文释义，先补齐或明确排除再发布")
    if len(output) + len(original) < 5000:
        raise ValueError("总词条不足 5000，禁止生成缩减版")
    result = {
        "entries": output,
        "manifest": {
            "version": 2, "sourceDate": "2026-09-30", "ecdictCommit": COMMIT,
            "sources": {name: {"url": url, "sha256": digest} for name, (url, digest) in SOURCES.items()},
            "originalEntries": len(original), "addedEntries": len(output), "totalEntries": len(original) + len(output),
            "uniqueHeadwordsAndPhrases": len(seen), "bySection": dict(Counter(e["section"] for e in output)),
            "sourceRows": {"NGSL": len(ngsl), "NAWL": len(nawl), "ECDICT_IELTS_candidates": len(candidates)},
            "collapsedInflections": collapsed, "missingChinese": 0,
            "glossOverrides": OVERRIDES,
            "partOfSpeechOverrides": POS_OVERRIDES,
            "missingPartOfSpeech": 0,
            "notes": "条目数不是词族数。NAWL 下载文件有959个词头，与官网概述957不同，按校验快照实际读取；层级仅用于学习安排。未提供例句的扩展条目保持为空，不制造模板例句。",
        },
    }
    (OUTPUT / "ielts-expanded.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "ielts-missing.json").unlink(missing_ok=True)
    notices = ROOT / "licenses"
    notices.mkdir(exist_ok=True)
    (notices / "ECDICT-MIT.txt").write_bytes(raw["ECDICT-LICENSE"])
    print(json.dumps({k: v for k, v in result["manifest"].items() if k not in ("sources", "collapsedInflections")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
