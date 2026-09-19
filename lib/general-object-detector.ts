import type { ObjectDetector as MediaPipeDetector } from "@mediapipe/tasks-vision";
import type { VisionDetection } from "./vision";

export const GENERAL_MODEL_NAME = "MediaPipe EfficientDet-Lite0 (COCO)";
export const GENERAL_MODEL_PATH = "/models/general-object/efficientdet_lite0.tflite";
export const GENERAL_MODEL_SIZE = 7_254_339;

export interface GeneralDetectorStats {
  loaded: boolean;
  modelName: string;
  inferenceMs: number;
  objectsFound: number;
  error?: string;
}

export class GeneralObjectDetector {
  private detector?: MediaPipeDetector;
  stats: GeneralDetectorStats = { loaded: false, modelName: GENERAL_MODEL_NAME, inferenceMs: 0, objectsFound: 0 };

  async load() {
    if (this.detector) return true;
    try {
      const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("/models/mediapipe");
      this.detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: GENERAL_MODEL_PATH },
        runningMode: "IMAGE",
        scoreThreshold: 0.42,
        maxResults: 12,
      });
      this.stats = { ...this.stats, loaded: true, error: undefined };
      return true;
    } catch (error) {
      this.stats = { ...this.stats, loaded: false, error: error instanceof Error ? error.message : "Model load failed" };
      return false;
    }
  }

  async detect(source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement) {
    if (!this.detector && !(await this.load())) return [];
    const started = performance.now();
    const result = this.detector!.detect(source);
    const width = "videoWidth" in source ? source.videoWidth : source.width;
    const height = "videoHeight" in source ? source.videoHeight : source.height;
    const detections: VisionDetection[] = result.detections.flatMap((entry, index) => {
      const category = entry.categories[0];
      const box = entry.boundingBox;
      if (!category || !box || !width || !height) return [];
      return [{
        id: `general-${index}-${category.categoryName}`,
        kind: "equipment" as const,
        label: category.categoryName || category.displayName || `Class ${category.index}`,
        confidence: category.score,
        box: { x: box.originX / width, y: box.originY / height, width: box.width / width, height: box.height / height },
        quality: { brightness: 0, contrast: 0, sharpness: 0, glare: 0, score: category.score, warnings: [] },
        source: "general" as const,
        metadata: { classIndex: category.index, model: GENERAL_MODEL_NAME },
      }];
    });
    this.stats = { ...this.stats, inferenceMs: performance.now() - started, objectsFound: detections.length };
    return detections;
  }

  close() { this.detector?.close(); this.detector = undefined; }
}
