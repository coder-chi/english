import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { state, db, lessons } from "./store.js";
import { syncKnowledge } from "./knowledge-index.js";
import {
  collectResources,
  collectYouTubeTranscript,
  analyzeTranscript,
  downloadAudio,
  useTranscript,
  serveAudio,
} from "./listening-resources.js";
import { saveAssociation, removeAssociation } from "./associations.js";
import {
  startPuzzle,
  getPuzzle,
  actPuzzle,
  learningRecords,
} from "./learning-hub.js";
import {
  listListening,
  getListening,
  saveListening,
  updateListening,
  previewListening,
  syncListening,
  logListening,
  clipListening,
  linkListening,
  reflectListening,
} from "./listening.js";
import {
  listWords,
  getWord,
  listSentences,
  saveSentence,
  flagSentence,
  startRecall,
  revealRecall,
  gradeRecall,
} from "./knowledge.js";
import {
  AppError,
  annotateArticle,
  automate,
  collect,
  complete,
  completeArticle,
  discover,
  generate,
  preferences,
  removeArticleAnnotation,
  review,
  saveArticle,
} from "./services.js";
import {
  saveCard,
  updateCardFlag,
  saveCategory,
  removeCategory,
  saveReminders,
  startSession,
  getSession,
  checkAnswer,
  gradeAnswer,
  lightenSession,
  continueSession,
  closingSession,
} from "./notebook.js";
import { previewBook, importBook, markBookFamiliar } from "./wordbooks.js";
import {
  getReviewReading,
  completeReviewReading,
  listReviewReadings,
} from "./review-reading.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const assets = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/learning-hub.js": ["learning-hub.js", "text/javascript; charset=utf-8"],
  "/learning-hub.css": ["learning-hub.css", "text/css; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/notebook.js": ["notebook.js", "text/javascript; charset=utf-8"],
  "/learning-progress.js": [
    "learning-progress.js",
    "text/javascript; charset=utf-8",
  ],
  "/notebook.css": ["notebook.css", "text/css; charset=utf-8"],
  "/knowledge.js": ["knowledge.js", "text/javascript; charset=utf-8"],
  "/associations.js": ["associations.js", "text/javascript; charset=utf-8"],
  "/knowledge.css": ["knowledge.css", "text/css; charset=utf-8"],
  "/listening.js": ["listening.js", "text/javascript; charset=utf-8"],
  "/listening.css": ["listening.css", "text/css; charset=utf-8"],
  "/review-reading.js": ["review-reading.js", "text/javascript; charset=utf-8"],
  "/review-reading.css": ["review-reading.css", "text/css; charset=utf-8"],
};
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 200000)
      throw new AppError("请求内容过长。", 413);
  }
  let data;
  try {
    data = JSON.parse(text || "{}");
  } catch {
    throw new AppError("请求不是有效的 JSON。");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new AppError("请求必须是对象。");
  return data;
}
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  try {
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (req.method === "GET" && assets[path]) {
      const [file, mime] = assets[path];
      const content = await readFile(
        fileURLToPath(new URL(`../public/${file}`, import.meta.url)),
      );
      res.writeHead(200, { "Content-Type": mime });
      return res.end(content);
    }
    if (req.method === "GET" && path === "/api/state")
      return json(res, 200, state());
    if (
      ["GET", "HEAD"].includes(req.method) &&
      path.startsWith("/api/listening/audio/")
    )
      return serveAudio(req, res, path.slice("/api/listening/audio/".length));
    if (req.method !== "POST" || !path.startsWith("/api/"))
      return json(res, 404, { error: "没有找到这个页面。" });
    // 本地单用户应用只接受同源 JSON 写入，避免第三方页面触发修改或模型调用。
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      throw new AppError("不允许跨站请求。", 403);
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new AppError("请使用 JSON 请求。", 415);
    const input = await body(req);
    let result;
    switch (path) {
      case "/api/listening/resources":
        await collectResources(input);
        result = getListening(input);
        break;
      case "/api/listening/transcript-fetch":
        await collectYouTubeTranscript(input);
        result = getListening(input);
        break;
      case "/api/listening/transcript-analyze":
        analyzeTranscript(input);
        result = getListening(input);
        break;
      case "/api/listening/download":
        await downloadAudio(input);
        result = getListening(input);
        break;
      case "/api/listening/transcript-use":
        useTranscript(input);
        result = getListening(input);
        break;
      case "/api/words/associations/save":
        result = saveAssociation(input);
        break;
      case "/api/words/associations/remove":
        result = removeAssociation(input);
        break;
      case "/api/learning/records":
        result = learningRecords();
        break;
      case "/api/puzzle/start":
        result = startPuzzle(input);
        break;
      case "/api/puzzle/get":
        result = getPuzzle(input);
        break;
      case "/api/puzzle/act":
        result = actPuzzle(input);
        break;
      case "/api/listening/list":
        result = listListening(input);
        break;
      case "/api/listening/get":
        result = getListening(input);
        break;
      case "/api/listening/preview":
        result = await previewListening(input);
        break;
      case "/api/listening/save":
        result = saveListening(input);
        break;
      case "/api/listening/update":
        result = updateListening(input);
        break;
      case "/api/listening/sync":
        result = await syncListening();
        break;
      case "/api/listening/log":
        result = logListening(input);
        break;
      case "/api/listening/clip":
        result = clipListening(input);
        break;
      case "/api/listening/link":
        result = linkListening(input);
        break;
      case "/api/listening/reflect":
        result = await reflectListening(input);
        break;
      case "/api/words/list":
        result = listWords(input);
        break;
      case "/api/words/get":
        result = getWord(input);
        break;
      case "/api/sentences/list":
        result = listSentences(input);
        break;
      case "/api/sentences/save":
        result = saveSentence(input);
        break;
      case "/api/sentences/flag":
        result = flagSentence(input);
        break;
      case "/api/sentences/start":
        result = startRecall(input);
        break;
      case "/api/sentences/reveal":
        result = revealRecall(input);
        break;
      case "/api/sentences/grade":
        result = gradeRecall(input);
        break;
      case "/api/review-reading/list":
        result = listReviewReadings();
        break;
      case "/api/review-reading/get":
        result = getReviewReading(input);
        break;
      case "/api/review-reading/complete":
        result = completeReviewReading(input);
        break;
      case "/api/books/preview":
        result = previewBook(input);
        break;
      case "/api/books/import":
        result = importBook(input);
        break;
      case "/api/books/familiar":
        result = markBookFamiliar(input);
        break;
      case "/api/notebook/save":
        result = saveCard(input);
        break;
      case "/api/notebook/flag":
        result = updateCardFlag(input);
        break;
      case "/api/categories/save":
        result = saveCategory(input);
        break;
      case "/api/categories/remove":
        result = removeCategory(input);
        break;
      case "/api/reminders":
        result = saveReminders(input);
        break;
      case "/api/practice/start":
        result = startSession(input);
        break;
      case "/api/practice/get":
        result = getSession(input);
        break;
      case "/api/practice/check":
        result = checkAnswer(input);
        break;
      case "/api/practice/grade":
        result = gradeAnswer(input);
        break;
      case "/api/practice/pace":
        result = lightenSession(input);
        break;
      case "/api/practice/continue":
        result = continueSession(input);
        break;
      case "/api/practice/closing":
        result = closingSession(input);
        break;
      case "/api/preferences":
        result = preferences(input);
        break;
      case "/api/discover":
        result = await discover();
        break;
      case "/api/articles/save":
        result = saveArticle(input);
        break;
      case "/api/articles/complete":
        result = completeArticle(input.sourceId);
        break;
      case "/api/articles/annotate":
        result = annotateArticle(input.sourceId, input);
        break;
      case "/api/articles/annotations/remove":
        result = removeArticleAnnotation(input.sourceId, input.annotationId);
        break;
      case "/api/generate":
        result = await generate(input);
        break;
      case "/api/collect":
        result = collect(input.lessonId, input.term);
        break;
      case "/api/complete":
        result = complete(input.lessonId);
        break;
      case "/api/review":
        if (!Number.isSafeInteger(input.cardId))
          throw new AppError("无效的卡片编号。");
        result = review(input.cardId, input.rating, input.revision);
        break;
      default:
        throw new AppError("接口不存在。", 404);
    }
    if (
      [
        "/api/books/import",
        "/api/books/familiar",
        "/api/notebook/save",
        "/api/collect",
        "/api/generate",
      ].includes(path)
    )
      syncKnowledge(db, lessons());
    json(res, 200, result);
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error.name === "TimeoutError"
          ? "外部服务响应超时，请稍后重试。"
          : "操作失败，请检查网络或服务端日志后重试。";
    if (!(error instanceof AppError))
      console.error("[request]", error.name, error.message);
    json(res, error.status || 500, { error: message });
  }
});
server.listen(port, host, () => {
  console.log(`Small Steps English → http://${host}:${port}`);
  if (process.env.DISABLE_AUTOMATION !== "true") {
    automate().catch((error) => console.error("[automation]", error.message));
    setInterval(
      () =>
        automate().catch((error) =>
          console.error("[automation]", error.message),
        ),
      60000,
    ).unref();
  }
});
