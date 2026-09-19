import { parseNumericReading } from "./vision";
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function getWorker() {
  if (!workerPromise)
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        workerPath: "/models/ocr/worker.min.js",
        corePath: "/models/ocr/tesseract-core-simd-lstm.wasm.js",
        langPath: "/models/ocr",
      });
    })();
  return workerPromise;
}
export async function recognizeLocal(source: string | HTMLCanvasElement) {
  const worker = await getWorker();
  const result = await worker.recognize(source, {}, { blocks: true });
  const text = result.data.text.trim();
  const blocks = result.data.blocks || [];
  const boxes = blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) => line.words.map((word) => word.bbox)),
    ),
  );
  const width = typeof source === "string" ? 0 : source.width;
  const height = typeof source === "string" ? 0 : source.height;
  const bounds = boxes.length
    ? {
        x0: Math.min(...boxes.map((box) => box.x0)),
        y0: Math.min(...boxes.map((box) => box.y0)),
        x1: Math.max(...boxes.map((box) => box.x1)),
        y1: Math.max(...boxes.map((box) => box.y1)),
      }
    : undefined;
  return {
    text,
    value: parseNumericReading(text),
    confidence: result.data.confidence / 100,
    box:
      bounds && width && height
        ? {
            x: bounds.x0 / width,
            y: bounds.y0 / height,
            width: (bounds.x1 - bounds.x0) / width,
            height: (bounds.y1 - bounds.y0) / height,
          }
        : undefined,
  };
}
