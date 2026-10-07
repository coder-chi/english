import { createHash } from "node:crypto";
import { db, transaction } from "./store.js";
import { AppError } from "./services.js";
import { fetchResource, resourceURL } from "./listening-fetch.js";
import { extractTranscriptKeywords } from "./listening-keywords.js";
import {
  BBC_FEED,
  parseBBC,
  parseFeed,
  parsePDF,
  parseCaptionMirror,
  fetchYouTubeTranscript,
  officialLinks,
  titleKey,
  episodeKey,
} from "./listening-extract.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS listening_resources (
    episode_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS listening_audio (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, content BLOB NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS listening_transcript_versions (
    id INTEGER PRIMARY KEY, episode_id TEXT NOT NULL, transcript TEXT NOT NULL,
    source TEXT NOT NULL, created_at INTEGER NOT NULL);
`);
const hash = (s) => createHash("sha256").update(s).digest("hex");
function episode(id) {
  if (typeof id !== "string") throw new AppError("请选择单集。");
  const row = db.prepare("SELECT * FROM listening_episodes WHERE id=?").get(id);
  if (!row) throw new AppError("这集尚未收藏。", 404);
  return row;
}
export function getResources(id) {
  const row = db
    .prepare("SELECT payload FROM listening_resources WHERE episode_id=?")
    .get(id);
  return row ? JSON.parse(row.payload) : {};
}
function save(id, value) {
  db.prepare("INSERT OR REPLACE INTO listening_resources VALUES(?,?)").run(
    id,
    JSON.stringify(value),
  );
  return value;
}
export function transcriptVersions(id) {
  return db
    .prepare(
      "SELECT id,source,created_at FROM listening_transcript_versions WHERE episode_id=? ORDER BY id DESC",
    )
    .all(id);
}
export function getTranscriptAnalysis(id, transcript) {
  const analysis = getResources(id).analysis;
  return analysis?.hash === hash(transcript) ? analysis : null;
}
export function analyzeTranscript(input) {
  const row = episode(input.id);
  if (!row.transcript) throw new AppError("请先获取或填写逐字稿。");
  const resources = getResources(row.id);
  const analysis = {
    hash: hash(row.transcript),
    analyzedAt: Date.now(),
    items: extractTranscriptKeywords(row.transcript, row.title),
  };
  resources.analysis = analysis;
  save(row.id, resources);
  return analysis;
}
function remember(row) {
  db.prepare(
    "INSERT INTO listening_transcript_versions(episode_id,transcript,source,created_at) VALUES(?,?,?,?)",
  ).run(row.id, row.transcript, row.transcript_source, Date.now());
}
export function useTranscript(input) {
  const row = episode(input.id);
  if (input.versionId != null && !Number.isSafeInteger(input.versionId))
    throw new AppError("文稿版本无效。");
  const resources = getResources(row.id);
  const value =
    input.versionId != null
      ? db
          .prepare(
            "SELECT transcript AS text,source AS url FROM listening_transcript_versions WHERE id=? AND episode_id=?",
          )
          .get(input.versionId, row.id)
      : resources.transcript;
  if (!value || typeof value.text !== "string")
    throw new AppError("没有可使用的文稿。");
  transaction(() => {
    remember(row);
    db.prepare(
      "UPDATE listening_episodes SET transcript=?,transcript_source=?,updated_at=? WHERE id=?",
    ).run(value.text, value.url, Date.now(), row.id);
  });
}

const collecting = new Set();
export async function collectYouTubeTranscript(input) {
  const row = episode(input.id);
  if (collecting.has(row.id))
    throw new AppError("这集正在读取字幕，请稍候。", 409);
  collecting.add(row.id);
  try {
    const transcript = await fetchYouTubeTranscript(row.video_id, row.title);
    const value = {
      text: transcript.text,
      url: `https://www.youtube.com/watch?v=${row.video_id}`,
      kind: `YouTube 官方英文字幕${transcript.kind === "manual" ? "（人工）" : "（自动生成）"}`,
      fetchedAt: Date.now(),
      hash: hash(transcript.text),
    };
    const resources = {
      ...getResources(row.id),
      attemptedAt: Date.now(),
      transcript: value,
      errors: [],
    };
    save(row.id, resources);
    db.prepare(
      "UPDATE listening_episodes SET transcript=?,transcript_source=?,updated_at=? WHERE id=? AND transcript=''",
    ).run(value.text, value.url, Date.now(), row.id);
    return resources;
  } catch (error) {
    throw new AppError(`YouTube 字幕获取失败：${error.message}`, 502);
  } finally {
    collecting.delete(row.id);
  }
}

export async function collectResources(input) {
  const row = episode(input.id);
  if (collecting.has(row.id)) throw new AppError("这集正在采集，请稍候。", 409);
  let page = input.source
    ? resourceURL(input.source)
    : getResources(row.id).page || "";
  if (input.source && !(episodeKey(page) || /\.pdf(?:\?|$)/i.test(page)))
    throw new AppError("请填写这集的 BBC 官方单集页面或文稿 PDF 链接。");
  if (!page && row.transcript_source) {
    try {
      page = resourceURL(row.transcript_source);
    } catch {
      /* 手工稿允许其他来源，不自动抓取。 */
    }
    if (page && !episodeKey(page) && !/\.pdf(?:\?|$)/i.test(page)) page = "";
  }
  collecting.add(row.id);
  try {
    const old = getResources(row.id);
    // 明确更换来源时不把两集的资源拼在一起；原稿及已缓存音频仍保留。
    const result = page && old.page && page !== old.page ? {} : { ...old };
    result.attemptedAt = Date.now();
    result.errors = [];
    result.candidates = [];
    const attempt = async (label, action) => {
      try {
        return await action();
      } catch (error) {
        result.errors.push(`${label}：${error.message}`);
        return null;
      }
    };
    if (!page) {
      await attempt("YouTube 节目简介", async () => {
        const response = await fetchResource(
          `https://www.youtube.com/watch?v=${row.video_id}`,
          { kind: "youtube", limit: 4000000 },
        );
        const match = response.data
          .toString()
          .match(/"shortDescription"\s*:\s*("(?:\\.|[^"\\])*")/);
        const links = officialLinks(match ? JSON.parse(match[1]) : "");
        if (links.length === 1) page = links[0];
      });
    }
    const hasOfficialCopy =
      old.transcript?.text && !old.transcript.kind?.includes("字幕");
    let collectedTranscript = false;
    if (!hasOfficialCopy && row.channel.toLowerCase().includes("bbc")) {
      await attempt("YouTube 官方英文字幕", async () => {
        const transcript = await fetchYouTubeTranscript(
          row.video_id,
          row.title,
        );
        result.transcript = {
          text: transcript.text,
          url: `https://www.youtube.com/watch?v=${row.video_id}`,
          kind: `YouTube 官方英文字幕${transcript.kind === "manual" ? "（人工）" : "（自动生成）"}`,
          fetchedAt: Date.now(),
          hash: hash(transcript.text),
        };
        collectedTranscript = true;
        db.prepare(
          "UPDATE listening_episodes SET transcript=?,transcript_source=?,updated_at=? WHERE id=? AND transcript=''",
        ).run(transcript.text, result.transcript.url, Date.now(), row.id);
      });
    }
    let podcast;
    // 单集页可能只提供 PDF；播客是音频的独立来源，某一路失败不影响其他结果。
    await attempt("BBC 播客目录", async () => {
      const feed = parseFeed((await fetchResource(BBC_FEED)).data.toString());
      const key = episodeKey(page);
      const matches = feed.filter((item) =>
        key && episodeKey(item.page)
          ? episodeKey(item.page) === key
          : titleKey(item.title) === titleKey(row.title),
      );
      if (matches.length === 1) {
        podcast = matches[0];
        page ||= podcast.page;
      } else if (matches.length > 1) {
        result.candidates = matches.map(({ title, page }) => ({ title, page }));
        result.errors.push(
          "播客中存在同名节目，请填写正确的 BBC 单集链接后重试。",
        );
      } else {
        result.errors.push(
          "播客目录没有找到精确匹配的单集；不会使用相似标题代替。",
        );
      }
    });
    if (podcast) {
      result.audio = {
        url: podcast.audio,
        source: BBC_FEED,
        cacheId:
          old.audio?.url === podcast.audio ? old.audio.cacheId : undefined,
      };
    }
    if (page) {
      result.page = page;
      await attempt("BBC 官方文稿", async () => {
        let fetched = await fetchResource(page, { limit: 8000000 });
        let kind = "BBC 官方页面";
        let text;
        if (
          /\.pdf(?:\?|$)/i.test(page) ||
          fetched.type.includes("application/pdf")
        ) {
          text = await parsePDF(fetched.data);
          kind = "BBC 官方 PDF";
        } else {
          const parsed = parseBBC(fetched.data.toString(), fetched.url);
          if (parsed.audio)
            result.audio = {
              url: parsed.audio,
              source: fetched.url,
              cacheId:
                old.audio?.url === parsed.audio ? old.audio.cacheId : undefined,
            };
          text = parsed.transcript;
          if (!text && parsed.pdf) {
            fetched = await fetchResource(parsed.pdf, { limit: 8000000 });
            text = await parsePDF(fetched.data);
            kind = "BBC 官方 PDF";
          }
        }
        if (!text)
          throw new Error(
            "页面未发现完整 TRANSCRIPT 或可用文稿 PDF；可手动补充官方链接",
          );
        result.transcript = {
          text,
          url: fetched.url,
          kind,
          fetchedAt: Date.now(),
          hash: hash(text),
        };
        collectedTranscript = true;
        // 请求过程中用户可能编辑了文稿；提交时再次判断，绝不覆盖非空稿。
        db.prepare(
          "UPDATE listening_episodes SET transcript=?,transcript_source=?,updated_at=? WHERE id=? AND transcript=''",
        ).run(text, fetched.url, Date.now(), row.id);
      });
    } else {
      result.errors.push("未找到该集官方页面，请补充 BBC 单集链接后重试。");
    }
    if (
      !collectedTranscript &&
      !hasOfficialCopy &&
      row.channel.toLowerCase().includes("bbc")
    ) {
      await attempt("YouTube 英文字幕回退", async () => {
        const url = `https://eng.lish.video/watch/BBCLearningEnglish/en/${row.video_id}`;
        const fetched = await fetchResource(url, {
          kind: "captions",
          limit: 4000000,
        });
        const text = parseCaptionMirror(
          fetched.data.toString(),
          fetched.url,
          row.video_id,
          row.title,
        );
        result.transcript = {
          text,
          url: fetched.url,
          kind: "YouTube 英文字幕镜像（第三方）",
          fetchedAt: Date.now(),
          hash: hash(text),
        };
        db.prepare(
          "UPDATE listening_episodes SET transcript=?,transcript_source=?,updated_at=? WHERE id=? AND transcript=''",
        ).run(text, fetched.url, Date.now(), row.id);
      });
    }
    if (old.page && page !== old.page && !result.audio && !result.transcript) {
      return save(row.id, {
        ...old,
        attemptedAt: result.attemptedAt,
        errors: [`新来源未获取到资源，保留上次内容：${page}`, ...result.errors],
        candidates: result.candidates,
      });
    }
    // 另一个标签页可能在采集期间下载完音频，提交时合并最新缓存状态。
    const latestAudio = getResources(row.id).audio;
    if (result.audio?.url === latestAudio?.url && latestAudio?.cacheId)
      result.audio.cacheId = latestAudio.cacheId;
    return save(row.id, result);
  } finally {
    collecting.delete(row.id);
  }
}

const downloading = new Set();
export async function downloadAudio(input) {
  const row = episode(input.id);
  const audio = getResources(row.id).audio;
  if (!audio?.url) throw new AppError("请先采集该集官方音频链接。");
  if (downloading.has(row.id))
    throw new AppError("音频正在下载，请稍候。", 409);
  downloading.add(row.id);
  try {
    const id = hash(audio.url);
    if (!db.prepare("SELECT id FROM listening_audio WHERE id=?").get(id)) {
      const fetched = await fetchResource(audio.url, {
        limit: 32000000,
        timeout: 30000,
      });
      const b = fetched.data;
      if (
        !/audio\/|application\/octet-stream/i.test(fetched.type) ||
        !(
          b.subarray(0, 3).toString() === "ID3" ||
          (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
        )
      )
        throw new Error("返回的内容不是可播放的 MP3 音频");
      db.prepare("INSERT OR IGNORE INTO listening_audio VALUES(?,?,?,?)").run(
        id,
        fetched.url,
        b,
        Date.now(),
      );
    }
    const latest = getResources(row.id);
    if (latest.audio?.url === audio.url) {
      latest.audio.cacheId = id;
      delete latest.audio.error;
      save(row.id, latest);
    }
  } catch (error) {
    const latest = getResources(row.id);
    if (latest.audio?.url === audio.url) {
      latest.audio.error = `音频下载失败：${error.message}`;
      save(row.id, latest);
    }
    throw new AppError(`音频下载失败：${error.message}。可稍后重试。`, 502);
  } finally {
    downloading.delete(row.id);
  }
}

// GET 只读已下载内容，绝不借播放器请求触发外部抓取。
export function serveAudio(req, res, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError("音频不存在。", 404);
  const audio = db
    .prepare("SELECT content FROM listening_audio WHERE id=?")
    .get(id);
  if (!audio) throw new AppError("音频尚未下载。", 404);
  const content = audio.content,
    size = content.length;
  let start = 0,
    end = size - 1;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!range || (!range[1] && !range[2])) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    if (!range[1]) start = Math.max(0, size - Number(range[2]));
    else {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    }
    if (!Number.isSafeInteger(start) || start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
  }
  res.writeHead(req.headers.range ? 206 : 200, {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Cache-Control": "private, max-age=86400",
    ...(req.headers.range
      ? { "Content-Range": `bytes ${start}-${end}/${size}` }
      : {}),
  });
  res.end(req.method === "HEAD" ? undefined : content.subarray(start, end + 1));
}
