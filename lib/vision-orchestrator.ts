import type { VisionBox, VisionDetection } from "./vision";

export interface PipelineResult {
  source: NonNullable<VisionDetection["source"]>;
  detections: VisionDetection[];
  inferenceMs?: number;
  status?: string;
}

export const INDUSTRIAL_MODEL_CLASSES = ["pump", "motor", "valve", "valve_indicator", "handwheel", "analog_gauge", "digital_meter", "control_panel", "generator", "tank", "pipe", "flange", "nameplate"] as const;

export function intersectionOverUnion(a: VisionBox, b: VisionBox) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union ? intersection / union : 0;
}

const priority = (d: VisionDetection) => d.source === "masa-industrial" ? 5 : d.source === "gauge" ? 4 : d.source === "equipment-ocr" ? 3 : d.source === "digital-ocr" ? 2 : 1;

export function mergePipelineResults(results: PipelineResult[], iouThreshold = 0.5) {
  const sorted = results.flatMap((result) => result.detections.map((d) => ({ ...d, source: d.source || result.source }))).sort((a, b) => priority(b) - priority(a) || b.confidence - a.confidence);
  const kept: VisionDetection[] = [];
  let dropped = 0;
  for (const detection of sorted) {
    const overlapping = kept.find((existing) => intersectionOverUnion(existing.box, detection.box) >= iouThreshold);
    if (overlapping) {
      dropped++;
      if (overlapping.source === "masa-industrial" && detection.source !== "general") {
        overlapping.value = detection.value ?? overlapping.value;
        overlapping.rawText = detection.rawText ?? overlapping.rawText;
        overlapping.needleAngle = detection.needleAngle ?? overlapping.needleAngle;
        overlapping.stable = detection.stable ?? overlapping.stable;
        overlapping.warning = detection.warning ?? overlapping.warning;
        overlapping.debug = detection.debug ?? overlapping.debug;
        overlapping.quality = detection.quality.score > overlapping.quality.score ? detection.quality : overlapping.quality;
        overlapping.metadata = { ...overlapping.metadata, specialistSource: detection.source };
      }
    } else kept.push(detection);
  }
  return { detections: kept, dropped };
}

export function prioritizeForContext(detections: VisionDetection[], context: string) {
  const pressure = /pressure|bar|psi/i.test(context);
  return [...detections].sort((a, b) => (pressure && b.source === "gauge" ? 1 : 0) - (pressure && a.source === "gauge" ? 1 : 0));
}
