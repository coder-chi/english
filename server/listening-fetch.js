import { AppError } from "./services.js";
import { ProxyAgent } from "undici";

let proxyAgent;
function dispatcher() {
  const value = process.env.OUTBOUND_PROXY?.trim();
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("OUTBOUND_PROXY 不是有效的代理地址。");
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname)
    throw new AppError("OUTBOUND_PROXY 仅支持 HTTP(S) 代理。");
  proxyAgent ||= new ProxyAgent(url.href);
  return proxyAgent;
}

// 每次跳转都检查白名单，不能借资源采集访问本机或任意第三方地址。
export function resourceURL(value, kind = "bbc") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("资源链接无效。");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new AppError("请使用标准 BBC 官方资源链接。");
  url.protocol = "https:";
  url.hash = "";
  const page =
    ["www.bbc.co.uk", "www.bbc.com", "bbc.co.uk", "bbc.com"].includes(
      url.hostname,
    ) && url.pathname.startsWith("/learningenglish/");
  const file =
    ["downloads.bbc.co.uk", "downloads.bbc.com"].includes(url.hostname) &&
    ["/learningenglish/", "/podcasts/"].some((prefix) =>
      url.pathname.startsWith(prefix),
    );
  const podcast = url.hostname === "podcasts.files.bbci.co.uk";
  const audio =
    url.hostname === "dts.podtrac.com" &&
    url.pathname.startsWith("/redirect.mp3/");
  const youtube =
    kind === "youtube" &&
    url.hostname === "www.youtube.com" &&
    url.pathname === "/watch";
  const captions =
    kind === "captions" &&
    url.hostname === "eng.lish.video" &&
    /^\/watch\/BBCLearningEnglish\/en\/[\w-]{11}\/?$/.test(url.pathname);
  if (!(page || file || podcast || audio || youtube || captions))
    throw new AppError(
      "仅支持 BBC Learning English 官方页面、文稿及播客资源。",
    );
  if (page)
    url.pathname = url.pathname.replace(
      "/learningenglish/features/",
      "/learningenglish/english/features/",
    );
  return url.href;
}

export async function fetchResource(
  value,
  { kind = "bbc", limit = 4000000, timeout = 8000 } = {},
) {
  let url = resourceURL(value, kind);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    for (let hop = 0; hop <= 4; hop++) {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        dispatcher: dispatcher(),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        url = resourceURL(
          new URL(response.headers.get("location"), url).href,
          kind,
        );
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > limit)
        throw new Error("资源超过大小限制");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) throw new Error("资源超过大小限制");
        chunks.push(chunk);
      }
      return {
        url,
        data: Buffer.concat(chunks),
        type: response.headers.get("content-type") || "",
      };
    }
    throw new Error("资源重定向次数过多");
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        kind === "bbc"
          ? "连接超时；当前网络无法直连 BBC，可配置 OUTBOUND_PROXY 后重试"
          : "连接超时",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
