import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

try {
  const document = await getDocument({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  if (document.numPages > 20) throw new Error("文稿 PDF 超过 20 页");
  const pages = [];
  for (let n = 1; n <= document.numPages; n++) {
    const page = await document.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => item.str + (item.hasEOL ? "\n" : " "))
        .join(""),
    );
  }
  await document.destroy();
  const text = pages.join("\n\n").trim();
  if (text.length < 200 || text.length > 60000)
    throw new Error("PDF 未包含可用的文字文稿");
  parentPort.postMessage({ text });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
