import { parentPort, workerData } from "node:worker_threads";
import { getTranscript } from "get-youtube-transcript";

try {
  const metadataResponse = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${workerData.videoId}`)}&format=json`,
  );
  if (!metadataResponse.ok)
    throw new Error(`YouTube 元数据 HTTP ${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  const titleKey = (value) =>
    String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(
        /\s*(?:[-–—|:]|⏲️?|⏱️?)\s*(?:learn english with )?(?:bbc )?6 minute english.*$/i,
        "",
      )
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  if (
    metadata.author_name !== "BBC Learning English" ||
    titleKey(metadata.title) !== titleKey(workerData.title)
  )
    throw new Error("YouTube 视频的频道或标题与当前 BBC 单集不匹配");
  const result = await getTranscript(workerData.videoId, {
    languages: ["en-GB", "en"],
  });
  parentPort.postMessage({
    ...result,
    title: metadata.title,
    channel: metadata.author_name,
  });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
