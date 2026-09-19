import test from "node:test";
import assert from "node:assert/strict";
import { calculateLetterbox, imageDataToNchw, nonMaximumSuppression, parseYoloOutput, type IndustrialModelMetadata } from "../lib/industrial-vision";
import { DetectionTracker } from "../lib/detection-tracker";
import { classifyValveState, describeValve, estimateValveIndicatorAngle, valvePositionPercent, type ValveCalibration } from "../lib/valve-vision";
import type { VisionDetection } from "../lib/vision";

const metadata: IndustrialModelMetadata = { name: "test", version: "1", format: "onnx", inputSize: 640, classes: ["pump", "valve"] };
const quality = { brightness: 0, contrast: 0, sharpness: 0, glare: 0, score: 1, warnings: [] };
const detection = (x: number): VisionDetection => ({ id: "raw", kind: "equipment", label: "Pump", box: { x, y: .1, width: .2, height: .2 }, confidence: .9, quality, source: "masa-industrial", metadata: { industrialClass: "pump" } });

test("letterbox preprocessing preserves aspect ratio and NCHW channels", () => {
  assert.deepEqual(calculateLetterbox(1280, 720), { inputSize: 640, scale: .5, resizedWidth: 640, resizedHeight: 360, padX: 0, padY: 140 });
  const pixels = imageDataToNchw({ width: 1, height: 1, data: new Uint8ClampedArray([255, 128, 0, 255]) } as ImageData);
  assert.equal(pixels[0], 1); assert.ok(Math.abs(pixels[1] - 128 / 255) < .0001); assert.equal(pixels[2], 0);
});

test("parses Ultralytics output and maps class metadata", () => {
  const data = new Float32Array([320, 100, 320, 100, 200, 50, 100, 40, .9, .1, .1, .8]);
  const output = parseYoloOutput(data, [1, 6, 2], metadata, calculateLetterbox(640, 640), 640, 640, .5);
  assert.equal(output.length, 2); assert.equal(output[0].label, "pump"); assert.equal(output[1].label, "valve"); assert.equal(output[0].source, "masa-industrial");
});

test("class-aware NMS suppresses duplicate boxes", () => {
  const first = { classId: 0, label: "pump", confidence: .9, bbox: { x: .1, y: .1, width: .4, height: .4 }, source: "masa-industrial" as const };
  assert.equal(nonMaximumSuppression([first, { ...first, confidence: .7, bbox: { x: .12, y: .12, width: .4, height: .4 } }]).length, 1);
});

test("IoU tracker keeps an ID across small motion", () => {
  const tracker = new DetectionTracker(); const first = tracker.update([detection(.1)])[0]; const second = tracker.update([detection(.12)])[0];
  assert.equal(first.id, second.id); assert.equal(second.metadata?.trackId, first.id);
});

test("valve wraparound and state classification are calibrated", () => {
  const calibration: ValveCalibration = { id: "v", stationId: "s", equipment: "V-1", closedAngle: 330, openAngle: 30, direction: "clockwise-opens" };
  assert.equal(Math.round(valvePositionPercent(0, calibration)!), 50); assert.equal(classifyValveState(50), "partially_open"); assert.equal(classifyValveState(100), "open");
  assert.equal(describeValve(0, calibration, false).percent, undefined);
  assert.match(describeValve(0, undefined, true).warning!, /calibration/i);
});

test("valve indicator estimator finds a dark radial direction", () => {
  const width = 100, height = 100, data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let x = 50; x < 95; x++) { const i = (50 * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 255; }
  const result = estimateValveIndicatorAngle({ width, height, data } as ImageData);
  assert.ok(result); assert.ok(result!.angle < 6 || result!.angle > 354);
});

test("model metadata requires a stable class order", () => {
  assert.deepEqual(metadata.classes, ["pump", "valve"]); assert.equal(metadata.version, "1");
});
