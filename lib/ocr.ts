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
  const result = await worker.recognize(source);
  const text = result.data.text.trim();
  return {
    text,
    value: parseNumericReading(text),
    confidence: result.data.confidence / 100,
  };
}
