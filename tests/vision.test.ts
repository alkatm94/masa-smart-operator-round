import test from "node:test";
import assert from "node:assert/strict";
import {
  fuzzyScore,
  gaugeReading,
  isStable,
  matchEquipment,
  normalizeAngle,
  parseNumericReading,
  shouldRunDigitalOcr,
  angleDistance,
  needleDirectionScore,
  selectNeedleDirection,
  analyseGauge,
  analyseGaugeDetailed,
  advanceGaugeTemporalState,
  canConfirmLiveDetection,
  isNumericStable,
  type VisionDetection,
  type RadialMetrics,
} from "../lib/vision";
test("gauge calibration converts and clamps", () => {
  const c = { minValue: 0, maxValue: 10, minAngle: -135, maxAngle: 135 };
  assert.equal(gaugeReading(0, c), 5);
  assert.equal(gaugeReading(170, c), 10);
});
test("angles normalize", () => assert.equal(normalizeAngle(270), -90));
test("OCR numeric parser tolerates comma and O", () => {
  assert.equal(parseNumericReading("P O2,45 bar"), 2.45);
  assert.equal(parseNumericReading("none"), null);
});
test("equipment matching is station-scoped and fuzzy", () => {
  assert.ok(fuzzyScore("MP-4", "MP4") > 0.9);
  assert.equal(matchEquipment("MP 4", ["MP-4", "VALVE-2"])[0].label, "MP-4");
});
test("reading stability rejects moving samples", () => {
  assert.equal(isStable([5, 5.02, 4.99, 5.01, 5]), true);
  assert.equal(isStable([4, 9, 14, 19, 24]), false);
});
const metric = (angle: number, long = true): RadialMetrics => {
  const bare = {
    angle,
    centerPassScore: 0.9,
    lengthScore: long ? 0.95 : 0.35,
    thinnessScore: long ? 0.9 : 0.15,
    outerReachScore: long ? 0.95 : 0.2,
    continuityScore: long ? 0.9 : 0.45,
    radialDarknessScore: long ? 0.8 : 0.75,
    counterweightPenalty: long ? 0.05 : 0.85,
    tickMarkPenalty: 0.05,
  };
  return { ...bare, score: needleDirectionScore(bare) };
};
test("opposite angle handling wraps correctly", () =>
  assert.equal(angleDistance(170, -10), 180));
test("long thin left pointer wins over short wide right counterweight", () => {
  const needle = metric(180, true),
    counter = metric(0, false);
  assert.equal(selectNeedleDirection(needle, counter).angle, 180);
  assert.ok(needle.score > counter.score);
});
test("line through center receives a stronger score", () => {
  const centered = metric(20, true),
    off = { ...metric(20, true), centerPassScore: 0 };
  off.score = needleDirectionScore(off);
  assert.ok(centered.score > off.score);
});
function syntheticGauge(withPrintedNumbers = false) {
  const w = 220,
    h = 220,
    data = new Uint8ClampedArray(w * h * 4);
  data.fill(255);
  const set = (x: number, y: number, v = 20) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = (y * w + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = v;
    data[p + 3] = 255;
  };
  const cx = 110,
    cy = 110,
    r = 78;
  for (let a = 0; a < Math.PI * 2; a += 0.006) {
    for (let t = -2; t <= 2; t++)
      set(
        Math.round(cx + Math.cos(a) * (r + t)),
        Math.round(cy + Math.sin(a) * (r + t)),
      );
  }
  for (let d = 14; d < 72; d++)
    for (let t = -1; t <= 1; t++) set(cx - d, cy + t);
  for (let d = 12; d < 32; d++)
    for (let t = -5; t <= 5; t++) set(cx + d, cy + t);
  for (let y = cy - 7; y <= cy + 7; y++)
    for (let x = cx - 7; x <= cx + 7; x++)
      if (Math.hypot(x - cx, y - cy) <= 7) set(x, y);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12)
    for (let d = 62; d < 73; d++)
      set(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d));
  if (withPrintedNumbers) {
    // Dense digit-like glyphs model scale labels such as 500..3500. They are
    // deliberately inside the circle and must never trigger digital OCR.
    for (const [gx, gy] of [
      [72, 72],
      [102, 58],
      [136, 72],
      [65, 132],
      [140, 132],
    ])
      for (let y = gy; y < gy + 9; y++)
        for (let x = gx; x < gx + 14; x++)
          if (
            y === gy ||
            y === gy + 4 ||
            y === gy + 8 ||
            x === gx ||
            x === gx + 13
          )
            set(x, y);
  }
  return { width: w, height: h, data } as ImageData;
}
test("analog circle and needle classification beats digital path", () => {
  const result = analyseGauge(syntheticGauge());
  assert.equal(result[0]?.kind, "gauge");
  assert.ok(Math.abs(Math.abs(result[0]?.needleAngle ?? 0)-180)<=12,JSON.stringify({angle:result[0]?.needleAngle,candidates:result[0]?.debug?.candidates}));
  assert.ok(
    (result[0]?.debug?.analogGaugeScore ?? 0) >
      (result[0]?.debug?.digitalDisplayScore ?? 1),
  );
});
test("missing calibration never produces a zero numeric reading", () => {
  const result = analyseGauge(syntheticGauge())[0];
  assert.equal(result?.value, undefined);
  assert.match(result?.warning || "", /Calibration required/);
});
test("printed scale numbers inside a circular gauge do not make it digital", () => {
  const result = analyseGauge(syntheticGauge(true));
  assert.equal(result[0]?.kind, "gauge");
  assert.equal(shouldRunDigitalOcr(result), false);
});
test("OCR digits cannot become an analog gauge measured value", () => {
  const result = analyseGauge(syntheticGauge(true));
  assert.equal(result[0]?.value, undefined);
  assert.equal(result[0]?.rawText, undefined);
});
function syntheticOfficeScene() {
  const width = 320, height = 180, data = new Uint8ClampedArray(width * height * 4); data.fill(235);
  const set = (x: number, y: number, value = 25) => { if (x < 0 || y < 0 || x >= width || y >= height) return; const p = (y * width + x) * 4; data[p] = data[p + 1] = data[p + 2] = value; data[p + 3] = 255; };
  // Monitor bezel plus dense application/text rows.
  for (let x = 48; x <= 272; x++) { set(x, 18); set(x, 112); }
  for (let y = 18; y <= 112; y++) { set(48, y); set(272, y); }
  for (let y = 30; y < 102; y += 7) for (let x = 60; x < 258; x++) if ((x + y) % 9 < 5) set(x, y, 70);
  // Keyboard grid and two cup rims on the desk.
  for (let y = 130; y < 166; y += 6) for (let x = 80; x < 242; x += 12) { set(x, y, 45); set(x + 7, y, 45); }
  for (const cx of [35, 285]) for (let a = 0; a < Math.PI * 2; a += .03) set(Math.round(cx + Math.cos(a) * 12), Math.round(142 + Math.sin(a) * 12), 55);
  return { width, height, data } as ImageData;
}
const qualityStub = { brightness: 0, contrast: 0, sharpness: 0, glare: 0, score: .8, warnings: [] };
test("monitor + keyboard + cups + desk never becomes an analog gauge", () => {
  const objects: VisionDetection[] = [
    { id: "monitor", kind: "equipment", label: "monitor", confidence: .91, box: { x: .14, y: .08, width: .72, height: .58 }, quality: qualityStub, source: "general" },
    { id: "keyboard", kind: "equipment", label: "keyboard", confidence: .74, box: { x: .24, y: .7, width: .52, height: .24 }, quality: qualityStub, source: "general" },
    { id: "cup-1", kind: "equipment", label: "cup", confidence: .73, box: { x: .04, y: .68, width: .14, height: .25 }, quality: qualityStub, source: "general" },
    { id: "cup-2", kind: "equipment", label: "cup", confidence: .44, box: { x: .82, y: .68, width: .14, height: .25 }, quality: qualityStub, source: "general" },
  ];
  const result = analyseGaugeDetailed(syntheticOfficeScene(), undefined, { fullFrame: true, suppressions: objects });
  assert.deepEqual(objects.filter((item) => /cup|keyboard/.test(item.label)).map((item) => item.label), ["keyboard", "cup", "cup"]);
  assert.equal(result.detections.length, 0);
  assert.ok(result.report.reasons.includes("inside_monitor") || result.report.reasons.includes("oversized_bbox") || result.report.reasons.includes("insufficient_circle_coverage"));
});
test("dense monitor UI, rectangular panels and screen-contained circular graphics are rejected", () => {
  const scene = syntheticOfficeScene();
  assert.equal(analyseGaugeDetailed(scene, undefined, { fullFrame: true }).detections.length, 0);
  const rectangular = analyseGaugeDetailed(scene, undefined, { candidateBox: { x: .1, y: .2, width: .42, height: .12 } });
  assert.equal(rectangular.detections.length, 0);
  assert.ok(rectangular.report.reasons.includes("rectangular_region"));
  const screen = [{ id: "phone", kind: "equipment" as const, label: "cell phone", confidence: .9, box: { x: .1, y: .1, width: .8, height: .8 }, quality: qualityStub, source: "general" as const }];
  assert.ok(analyseGaugeDetailed(syntheticGauge(), undefined, { candidateBox: { x: .25, y: .25, width: .3, height: .3 }, suppressions: screen }).report.reasons.includes("inside_monitor"));
});
test("validated physical gauge still supports calibration and panel context", () => {
  const calibration = { minValue: 0, maxValue: 100, minAngle: -180, maxAngle: 180 };
  const result = analyseGaugeDetailed(syntheticGauge(), calibration, { candidateBox: { x: .25, y: .2, width: .3, height: .3 }, suppressions: [{ id: "panel", kind: "equipment", label: "control panel", confidence: .9, box: { x: .1, y: .1, width: .8, height: .8 }, quality: qualityStub }] });
  assert.equal(result.report.accepted, true);
  assert.equal(result.detections[0]?.kind, "gauge");
  assert.equal(typeof result.detections[0]?.value, "number");
});
test("single unstable gauge candidate is not temporally confirmed", () => {
  const first = advanceGaugeTemporalState(undefined, { x: .2, y: .2, width: .25, height: .25 });
  assert.equal(first.confirmed, false);
  const moved = advanceGaugeTemporalState(first.state, { x: .5, y: .1, width: .25, height: .25 });
  assert.equal(moved.confirmed, false);
  const second = advanceGaugeTemporalState(undefined, { x: .2, y: .2, width: .25, height: .25 });
  const third = advanceGaugeTemporalState(second.state, { x: .21, y: .2, width: .25, height: .25 });
  const fourth = advanceGaugeTemporalState(third.state, { x: .2, y: .21, width: .25, height: .25 });
  assert.equal(fourth.confirmed, true);
});
test("live readings require a stable sliding window", () => {
  assert.equal(isNumericStable([55.1, 55.2, 55.2, 55.19]), false);
  assert.equal(isNumericStable([55.1, 55.2, 55.2, 55.19, 55.18]), true);
  assert.equal(isNumericStable([55.1, 55.2, 58, 55.19, 55.18]), false);
});
test("Confirm Reading is enabled only for a stable confident value", () => {
  const detection = {
    id: "live",
    kind: "gauge",
    label: "Analog Gauge",
    box: { x: 0, y: 0, width: 1, height: 1 },
    confidence: 0.89,
    value: 55.2,
    stable: true,
    quality: { brightness: 1, contrast: 1, sharpness: 1, glare: 0, score: 0.9, warnings: [] },
  } satisfies VisionDetection;
  assert.equal(canConfirmLiveDetection(detection, 0.6), true);
  assert.equal(canConfirmLiveDetection({ ...detection, stable: false }, 0.6), false);
  assert.equal(canConfirmLiveDetection({ ...detection, value: undefined }, 0.6), false);
});
