import test from "node:test";
import assert from "node:assert/strict";
import { mergePipelineResults, prioritizeForContext } from "../lib/vision-orchestrator";
import type { VisionDetection } from "../lib/vision";

const detection = (id: string, label: string, source: VisionDetection["source"], x = 0.1): VisionDetection => ({
  id, label, source, kind: source === "gauge" ? "gauge" : "equipment", confidence: 0.9,
  box: { x, y: 0.1, width: 0.3, height: 0.3 },
  quality: { brightness: 0, contrast: 0, sharpness: 0, glare: 0, score: 0.9, warnings: [] },
});

test("general detections are never filtered by check-point context", () => {
  const person = detection("person", "person", "general", 0.55);
  const bottle = detection("bottle", "bottle", "general", 0.1);
  const ordered = prioritizeForContext([person, bottle], "Discharge Pressure bar");
  assert.deepEqual(new Set(ordered.map((item) => item.label)), new Set(["person", "bottle"]));
});

test("specialized gauge wins overlapping general detection", () => {
  const general = detection("clock", "clock", "general");
  const gauge = detection("gauge", "Analog Gauge", "gauge");
  const merged = mergePipelineResults([{ source: "general", detections: [general] }, { source: "gauge", detections: [gauge] }]);
  assert.deepEqual(merged.detections.map((item) => item.label), ["Analog Gauge"]);
  assert.equal(merged.dropped, 1);
});

test("industrial ROI keeps priority while receiving specialist gauge reading", () => {
  const industrial = detection("masa", "gauge", "masa-industrial");
  industrial.box = { x: .1, y: .1, width: .6, height: .6 };
  industrial.metadata = { industrialClass: "analog_gauge" };
  const gauge = { ...detection("needle", "gauge", "gauge"), box: industrial.box, needleAngle: 42, value: 55.2, stable: true };
  const merged = mergePipelineResults([{ source: "masa-industrial", detections: [industrial] }, { source: "gauge", detections: [gauge] }]);
  assert.equal(merged.detections[0].source, "masa-industrial"); assert.equal(merged.detections[0].value, 55.2); assert.equal(merged.detections[0].needleAngle, 42);
});

test("multiple non-overlapping pipelines reach the overlay together", () => {
  const merged = mergePipelineResults([
    { source: "general", detections: [detection("person", "person", "general", 0.05)] },
    { source: "gauge", detections: [detection("gauge", "Analog Gauge", "gauge", 0.6)] },
  ]);
  assert.equal(merged.detections.length, 2);
});
