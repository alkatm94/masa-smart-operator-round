import type { InferenceSession } from "onnxruntime-web";
import type { VisionBox, VisionDetection, VisionQuality } from "./vision";
import { intersectionOverUnion } from "./vision-orchestrator";

export interface IndustrialModelMetadata {
  name: string;
  version: string;
  format: "onnx";
  inputSize: number;
  classes: string[];
  trainedAt?: string;
  datasetVersion?: string;
  modelPath?: string;
  confidenceThreshold?: number;
  iouThreshold?: number;
}
export interface RawIndustrialDetection {
  classId: number;
  label: string;
  confidence: number;
  bbox: VisionBox;
  source: "masa-industrial";
}
export interface LetterboxTransform {
  inputSize: number; scale: number; padX: number; padY: number;
  resizedWidth: number; resizedHeight: number;
}

const emptyQuality: VisionQuality = { brightness: 0, contrast: 0, sharpness: 0, glare: 0, score: 1, warnings: [] };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function calculateLetterbox(width: number, height: number, inputSize = 640): LetterboxTransform {
  const scale = Math.min(inputSize / width, inputSize / height);
  const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
  return { inputSize, scale, resizedWidth, resizedHeight, padX: (inputSize - resizedWidth) / 2, padY: (inputSize - resizedHeight) / 2 };
}

export function imageDataToNchw(image: ImageData) {
  const pixels = image.width * image.height, output = new Float32Array(pixels * 3);
  for (let i = 0, p = 0; p < pixels; p++, i += 4) {
    output[p] = image.data[i] / 255;
    output[pixels + p] = image.data[i + 1] / 255;
    output[pixels * 2 + p] = image.data[i + 2] / 255;
  }
  return output;
}

function outputValue(data: Float32Array, dimensions: readonly number[], item: number, feature: number, featuresFirst?: boolean) {
  const rows = dimensions.length === 3 ? dimensions[1] : dimensions[0];
  const cols = dimensions.length === 3 ? dimensions[2] : dimensions[1];
  return (featuresFirst ?? rows < cols) ? data[feature * cols + item] : data[item * cols + feature];
}

export function nonMaximumSuppression(detections: RawIndustrialDetection[], threshold = 0.45) {
  const kept: RawIndustrialDetection[] = [];
  for (const detection of [...detections].sort((a, b) => b.confidence - a.confidence))
    if (!kept.some((existing) => existing.classId === detection.classId && intersectionOverUnion(existing.bbox, detection.bbox) > threshold)) kept.push(detection);
  return kept;
}

export function parseYoloOutput(data: Float32Array, dimensions: readonly number[], metadata: IndustrialModelMetadata, transform: LetterboxTransform, sourceWidth: number, sourceHeight: number, confidenceThreshold = metadata.confidenceThreshold ?? 0.45) {
  const rows = dimensions.length === 3 ? dimensions[1] : dimensions[0];
  const cols = dimensions.length === 3 ? dimensions[2] : dimensions[1];
  const expectedFeatures = 4 + metadata.classes.length;
  const featuresFirst = rows === expectedFeatures || (cols !== expectedFeatures && rows < cols);
  const count = featuresFirst ? cols : rows, features = featuresFirst ? rows : cols;
  const classes = Math.min(metadata.classes.length, features - 4), detections: RawIndustrialDetection[] = [];
  for (let i = 0; i < count; i++) {
    let classId = -1, confidence = 0;
    for (let c = 0; c < classes; c++) {
      const score = outputValue(data, dimensions, i, 4 + c, featuresFirst);
      if (score > confidence) { confidence = score; classId = c; }
    }
    if (confidence < confidenceThreshold || classId < 0) continue;
    const cx = outputValue(data, dimensions, i, 0, featuresFirst), cy = outputValue(data, dimensions, i, 1, featuresFirst);
    const width = outputValue(data, dimensions, i, 2, featuresFirst), height = outputValue(data, dimensions, i, 3, featuresFirst);
    const x = (cx - width / 2 - transform.padX) / transform.scale;
    const y = (cy - height / 2 - transform.padY) / transform.scale;
    detections.push({ classId, label: metadata.classes[classId] || `class_${classId}`, confidence, source: "masa-industrial", bbox: {
      x: clamp(x / sourceWidth), y: clamp(y / sourceHeight),
      width: clamp(width / transform.scale / sourceWidth), height: clamp(height / transform.scale / sourceHeight),
    } });
  }
  return nonMaximumSuppression(detections, metadata.iouThreshold ?? 0.45);
}

export class MasaIndustrialDetector {
  private session?: InferenceSession;
  private metadata?: IndustrialModelMetadata;
  private canvas?: HTMLCanvasElement;
  private ready = false;
  private state = "MASA Industrial Model: Not Trained";
  stats = { inferenceMs: 0, detections: 0, modelVersion: "not-installed" };

  isReady() { return this.ready; }
  status() { return this.state; }
  getMetadata() { return this.metadata; }

  async load() {
    if (this.ready) return true;
    try {
      const response = await fetch("/models/masa-industrial/model.json", { cache: "no-cache" });
      if (!response.ok) return false;
      const metadata = await response.json() as IndustrialModelMetadata;
      if (!metadata.classes?.length || !metadata.inputSize) throw new Error("Invalid industrial model metadata");
      const ort = await import("onnxruntime-web");
      ort.env.wasm.wasmPaths = "/models/onnx/";
      ort.env.wasm.numThreads = 1;
      this.session = await ort.InferenceSession.create(metadata.modelPath || "/models/masa-industrial/model.onnx", { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      this.metadata = metadata;
      this.ready = true;
      this.state = `MASA Industrial Model: ${metadata.version}`;
      this.stats.modelVersion = metadata.version;
      return true;
    } catch {
      this.ready = false;
      this.state = "MASA Industrial Model: Not Trained";
      return false;
    }
  }

  async detect(source: CanvasImageSource): Promise<VisionDetection[]> {
    if (!this.ready || !this.session || !this.metadata || typeof document === "undefined") return [];
    const width = source instanceof HTMLVideoElement ? source.videoWidth : (source as { width: number }).width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : (source as { height: number }).height;
    if (!width || !height) return [];
    const transform = calculateLetterbox(width, height, this.metadata.inputSize);
    this.canvas ||= document.createElement("canvas");
    this.canvas.width = transform.inputSize; this.canvas.height = transform.inputSize;
    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.fillStyle = "#727272"; context.fillRect(0, 0, transform.inputSize, transform.inputSize);
    context.drawImage(source, transform.padX, transform.padY, transform.resizedWidth, transform.resizedHeight);
    const ort = await import("onnxruntime-web");
    const tensor = new ort.Tensor("float32", imageDataToNchw(context.getImageData(0, 0, transform.inputSize, transform.inputSize)), [1, 3, transform.inputSize, transform.inputSize]);
    const started = performance.now();
    const result = await this.session.run({ [this.session.inputNames[0]]: tensor });
    this.stats.inferenceMs = performance.now() - started;
    const output = result[this.session.outputNames[0]];
    const raw = parseYoloOutput(output.data as Float32Array, output.dims, this.metadata, transform, width, height);
    this.stats.detections = raw.length;
    return raw.map((detection, index) => ({
      id: `masa-${detection.classId}-${index}`,
      kind: detection.label === "analog_gauge" ? "gauge" : detection.label === "digital_meter" ? "digital" : detection.label === "nameplate" ? "tag" : /valve|handwheel/.test(detection.label) ? "valve" : "equipment",
      label: detection.label.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      box: detection.bbox, confidence: detection.confidence,
      quality: { ...emptyQuality, score: detection.confidence }, source: "masa-industrial",
      metadata: { classId: detection.classId, industrialClass: detection.label, modelVersion: this.metadata!.version },
    }));
  }

  dispose() { this.session?.release(); this.session = undefined; this.canvas = undefined; this.ready = false; }
}
