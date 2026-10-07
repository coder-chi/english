// 隔离服务通过可控响应覆盖外部失败、依据校验及重复计费保护，不调用真实模型。
let mode = "valid";
let calls = 0;
process.on("message", (message) => {
  mode = message.mode || mode;
  process.send({ mode, calls });
});
globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (mode === "timeout") {
    return new Promise((_, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  }
  if (parsed.pathname === "/oembed") {
    if (mode === "oversized") return new Response("x".repeat(1000001));
    return Response.json({
      title: "Mock episode title",
      author_name: "BBC test",
    });
  }
  if (parsed.pathname === "/feeds/videos.xml") {
    return new Response(
      `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>Feed episode</title></entry></feed>`,
    );
  }
  calls++;
  const body = JSON.parse(options.body);
  const input = JSON.parse(body.messages[1].content);
  const content = {
    summary:
      input.basis === "transcript"
        ? "根据所提供逐字稿的测试总结。"
        : "仅整理用户笔记，无法验证节目内容。",
    points: [
      mode === "invalid"
        ? "This was never in the source."
        : input.sourceText.slice(0, 50),
    ],
    feedback: "对照自己的复述，检查遗漏。",
  };
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
};
await import("../../server/index.js");
process.send({ ready: true });
