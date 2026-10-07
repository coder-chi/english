import { load } from "cheerio";
import { Worker } from "node:worker_threads";
import { resourceURL } from "./listening-fetch.js";

export const BBC_FEED = "https://podcasts.files.bbci.co.uk/p02pc9tn.rss";
const clean = (s) =>
  s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
export const titleKey = (s) =>
  clean(s)
    .toLowerCase()
    .replace(
      /\s*(?:[-–—|:]|⏲️?|⏱️?)\s*(?:learn english with )?(?:bbc )?6 minute english.*$/i,
      "",
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const episodeKey = (url) => url?.match(/\/ep-(\d{6})(?:[/?#]|$)/)?.[1];

function safeLink(value, base) {
  try {
    return resourceURL(new URL(value, base).href);
  } catch {
    return "";
  }
}
export function officialLinks(text) {
  return [
    ...new Set(
      (
        text.match(
          /https?:\/\/(?:www\.)?bbc\.(?:co\.uk|com)\/learningenglish\/[^\s<>"\\]+/g,
        ) || []
      )
        .map((s) => safeLink(s.replace(/[).,]+$/, ""), BBC_FEED))
        .filter((s) => episodeKey(s)),
    ),
  ];
}
export function parseFeed(xml) {
  const $ = load(xml, { xml: true });
  return $("item")
    .toArray()
    .slice(0, 1000)
    .map((item) => {
      const entry = $(item);
      const description = entry.find("description").text();
      return {
        title: clean(entry.find("title").first().text()),
        page:
          officialLinks(`${description} ${entry.find("link").text()}`)[0] || "",
        audio: safeLink(entry.find("enclosure").attr("url") || "", BBC_FEED),
      };
    })
    .filter((item) => item.title && item.audio);
}
export function parseBBC(html, url) {
  const $ = load(html);
  $("script,style,nav,footer,header").remove();
  const blocks = $("h1,h2,h3,h4,p,li").toArray();
  const lines = [];
  let active = false;
  for (const block of blocks) {
    const value = clean($(block).text());
    if (/^transcript(?:\s*[:(].*)?$/i.test(value)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (
      /^(?:vocabulary|downloads|related content|more (?:from|episodes)|take our quiz|programme quiz|next episode)\b/i.test(
        value,
      )
    )
      break;
    if (value) lines.push(value);
  }
  const links = $("a[href]")
    .toArray()
    .map((a) => ({
      url: safeLink($(a).attr("href"), url),
      label: $(a).text(),
      context: $(a).parent().text().slice(0, 400),
    }))
    .filter((a) => a.url);
  const pdf =
    links.find(
      (a) =>
        /\.pdf(?:\?|$)/i.test(a.url) &&
        /transcript/i.test(`${a.label} ${a.url} ${a.context}`) &&
        !/worksheet/i.test(`${a.label} ${a.url}`),
    )?.url || "";
  const audio =
    links.find((a) => /\.mp3(?:\?|$)/i.test(a.url))?.url ||
    $("audio[src],audio source[src]")
      .toArray()
      .map((a) => safeLink($(a).attr("src"), url))
      .find(Boolean) ||
    "";
  const transcript = lines.join("\n\n");
  return {
    transcript:
      transcript.length >= 200 && transcript.length <= 60000 ? transcript : "",
    pdf,
    audio,
  };
}

export function parseCaptionMirror(html, url, videoId, expectedTitle) {
  const $ = load(html);
  const pageTitle = clean($("h1").first().text());
  const original = $("a[href]")
    .toArray()
    .map((a) => $(a).attr("href"))
    .find((href) => {
      try {
        const target = new URL(href, url);
        return (
          ["youtube.com", "www.youtube.com"].includes(target.hostname) &&
          target.pathname === "/watch" &&
          target.searchParams.get("v") === videoId
        );
      } catch {
        return false;
      }
    });
  if (!original || titleKey(pageTitle) !== titleKey(expectedTitle))
    throw new Error("字幕镜像与当前视频不匹配");
  const pieces = $(".subtitle .content_1")
    .toArray()
    .map((item) => clean($(item).text()))
    .filter(Boolean);
  if (pieces.length < 20) throw new Error("字幕镜像没有返回完整英文字幕");
  const sentences = pieces
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .match(/.*?(?:[.!?](?=\s|$)|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 5)
    paragraphs.push(sentences.slice(index, index + 5).join(" "));
  const transcript = paragraphs.join("\n\n");
  if (transcript.length < 500 || transcript.length > 60000)
    throw new Error("字幕镜像内容长度异常");
  return transcript;
}

export function fetchYouTubeTranscript(videoId, title) {
  if (!/^[\w-]{11}$/.test(videoId))
    return Promise.reject(new Error("YouTube 视频编号无效"));
  if (process.env.DISABLE_YOUTUBE_TRANSCRIPT === "true")
    return Promise.reject(new Error("当前测试环境已禁用 YouTube 直连字幕"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./listening-youtube-worker.js", import.meta.url),
      {
        workerData: { videoId, title },
        execArgv: process.execArgv.filter(
          (argument) => !argument.startsWith("--input-type"),
        ),
      },
    );
    const timer = setTimeout(() => {
      reject(new Error("YouTube 字幕读取超时"));
      void worker.terminate();
    }, 20000);
    const finish = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    worker.once("message", (result) => {
      finish();
      if (result.error) return reject(new Error(result.error));
      if (
        !Array.isArray(result.segments) ||
        result.segments.length < 20 ||
        typeof result.text !== "string" ||
        result.text.length < 500 ||
        result.text.length > 60000
      )
        return reject(new Error("YouTube 字幕内容不完整"));
      resolve(result);
    });
    worker.once("error", (error) => {
      finish();
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("YouTube 字幕读取未完成"));
    });
  });
}

// PDF 解析放在独立线程，限制页数和执行时长，坏文件不会阻塞 HTTP 服务。
export function parsePDF(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./listening-pdf.js", import.meta.url), {
      workerData: data,
    });
    const timer = setTimeout(() => {
      reject(new Error("PDF 解析超时"));
      void worker.terminate();
    }, 8000);
    const finish = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    worker.once("message", (result) => {
      finish();
      if (result.error) reject(new Error(result.error));
      else resolve(result.text);
    });
    worker.once("error", (error) => {
      finish();
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("PDF 解析未完成"));
    });
  });
}
