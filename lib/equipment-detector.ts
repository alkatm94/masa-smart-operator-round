import type { VisionDetection } from "./vision";
export interface ObjectDetectorAdapter {
  load(): Promise<boolean>;
  detect(source: CanvasImageSource): Promise<VisionDetection[]>;
  status(): string;
}
export class LocalModelAdapter implements ObjectDetectorAdapter {
  private available = false;
  async load() {
    try {
      const r = await fetch("/models/equipment/model.json", {
        cache: "force-cache",
      });
      this.available = r.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }
  async detect(_source: CanvasImageSource) {
    return [] as VisionDetection[];
  }
  status() {
    return this.available
      ? "Custom model loaded"
      : "AI model not trained for this equipment yet";
  }
}
