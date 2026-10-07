import { createHash } from "node:crypto";
let mode = "html";
const requests = [];
const page =
  "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2024/ep-240222";
const audio = "https://downloads.bbc.co.uk/learningenglish/6min/brain.mp3";
const transcript =
  "Neil: Hello and welcome to 6 Minute English. Today we are talking about food and the brain. A balanced diet helps our bodies and supports the brain.\n\nBeth: We will hear how everyday food choices can affect our health, and learn useful vocabulary along the way.";
function pdf() {
  const lines = transcript.replace(/\n+/g, " ").match(/.{1,65}(?:\s|$)/g);
  const stream = `BT /F1 12 Tf 40 700 Td ${lines.map((line, i) => `${i ? "0 -18 Td " : ""}(${line}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
globalThis.fetch = async (url, options) => {
  requests.push(url);
  if (url.includes("eng.lish.video")) {
    if (mode !== "fallback") throw new Error("caption mirror unavailable");
    const videoId = new URL(url).pathname.split("/").pop();
    return new Response(`<main><h1>Feed your brain ⏲️ 6 Minute English</h1>
      <a href="https://www.youtube.com/watch?v=${videoId}">Original video on YouTube.com</a>
      <div class="transcript">${Array.from(
        { length: 24 },
        (_, index) =>
          `<div class="subtitle"><div class="content_1">Caption sentence ${index + 1} explains how a balanced diet supports the brain and everyday health.</div></div>`,
      ).join("")}</div></main>`);
  }
  if (mode === "fallback") throw new Error("BBC unavailable");
  if (mode === "timeout")
    return new Promise((_, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      ),
    );
  if (mode === "broken") throw new Error("network unavailable");
  if (mode === "redirect")
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    });
  if (mode === "oversized")
    return new Response("x", { headers: { "content-length": "9000001" } });
  if (url.includes("/watch?"))
    return new Response(
      `<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { shortDescription: mode === "ambiguous" ? "" : `Learn more at ${page}` } })};</script>`,
    );
  if (url.endsWith(".rss")) {
    if (mode === "partial") throw new Error("RSS unavailable");
    const item = (p) =>
      `<item><title>Feed your brain</title><description><![CDATA[<a href="${p}">Learn English</a>]]></description><enclosure url="${audio}" type="audio/mpeg"/></item>`;
    return new Response(
      `<rss><channel>${item(page)}${mode === "ambiguous" ? item(page.replace("240222", "250101")) : ""}</channel></rss>`,
    );
  }
  if (url.endsWith(".pdf"))
    return new Response(pdf(), {
      headers: { "content-type": "application/pdf" },
    });
  if (url.endsWith(".mp3")) {
    if (mode === "bad-audio")
      return new Response("<html>Not audio</html>", {
        headers: { "content-type": "text/html" },
      });
    // MPEG1 Layer III 静音帧，供真实浏览器验证媒体加载与拖动。
    const frame = Buffer.alloc(417);
    Buffer.from([0xff, 0xfb, 0x90, 0xc4]).copy(frame);
    return new Response(
      Buffer.concat(Array.from({ length: 200 }, () => frame)),
      { headers: { "content-type": "audio/mpeg" } },
    );
  }
  return new Response(
    `<main><h1>Feed your brain</h1><p>Introduction is not the transcript.</p>
    <a href="${audio}">Download audio</a>
    ${
      mode === "pdf"
        ? '<div><strong>Transcript</strong><a href="https://downloads.bbc.co.uk/learningenglish/6min/brain.pdf">Download PDF</a></div>'
        : `<h3>TRANSCRIPT</h3><p>${transcript.split("\n\n")[0]}</p><p>${transcript.split("\n\n")[1]}</p><h3>VOCABULARY</h3><p>Not part of transcript</p>`
    }
    </main>`,
    { headers: { "content-type": "text/html" } },
  );
};
await import("../../server/index.js");
const { db } = await import("../../server/store.js");
process.on("message", (message) => {
  mode = message.mode || mode;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        cards: db.prepare("SELECT * FROM cards ORDER BY id").all(),
        reviews: db.prepare("SELECT * FROM reviews ORDER BY id").all(),
      }),
    )
    .digest("hex");
  process.send({ mode, requests, fingerprint });
});
process.send({ ready: true });
