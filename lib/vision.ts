export type VisionKind = "gauge" | "digital" | "tag" | "equipment" | "valve";
export interface VisionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface VisionQuality {
  brightness: number;
  contrast: number;
  sharpness: number;
  glare: number;
  score: number;
  warnings: string[];
}
export interface RadialMetrics {
  angle: number;
  centerPassScore: number;
  lengthScore: number;
  thinnessScore: number;
  outerReachScore: number;
  continuityScore: number;
  radialDarknessScore: number;
  counterweightPenalty: number;
  tickMarkPenalty: number;
  score: number;
}
export interface VisionDebug {
  center: { x: number; y: number };
  radius: number;
  oppositeAngle: number;
  needleScore: number;
  oppositeDirectionScore: number;
  analogGaugeScore: number;
  digitalDisplayScore: number;
  circleConfidence: number;
  centerHubConfidence: number;
  radialNeedleConfidence: number;
  scaleRingEvidence: number;
  rectangleDisplayConfidence: number;
  stable?: boolean;
  ambiguity180?: boolean;
  candidates: RadialMetrics[];
}
export type GaugeRejectionReason =
  | "oversized_bbox"
  | "rectangular_region"
  | "circle_radius_out_of_range"
  | "circle_not_contained"
  | "insufficient_circle_coverage"
  | "high_text_density"
  | "inside_monitor"
  | "no_center_hub"
  | "no_tick_ring"
  | "no_valid_needle";
export interface GaugeValidationReport {
  accepted: boolean;
  reasons: GaugeRejectionReason[];
  candidateBox: VisionBox;
  metrics: {
    circularity: number;
    perimeterCoverage: number;
    concentricRingEvidence: number;
    centerHubConfidence: number;
    radialTickDensity: number;
    textDensity: number;
    needleConfidence: number;
  };
}
export interface GaugeAnalysisOptions {
  /** Set when the supplied pixels are the complete camera frame. */
  fullFrame?: boolean;
  /** Candidate coordinates in the complete frame, for detector-proposed ROIs. */
  candidateBox?: VisionBox;
  /** General-object detections from the same frame. */
  suppressions?: VisionDetection[];
}
export interface GaugeTemporalState { box: VisionBox; frames: number }
export function advanceGaugeTemporalState(previous: GaugeTemporalState | undefined, box: VisionBox, requiredFrames = 3) {
  const compatible = Boolean(previous && Math.hypot(box.x - previous.box.x, box.y - previous.box.y) < 0.06 && Math.abs(box.width - previous.box.width) < 0.08 && Math.abs(box.height - previous.box.height) < 0.08);
  const state = { box, frames: compatible ? previous!.frames + 1 : 1 };
  return { state, confirmed: state.frames >= requiredFrames, stabilityScore: clamp(state.frames / Math.max(requiredFrames, 5)) };
}
export interface VisionDetection {
  id: string;
  kind: VisionKind;
  label: string;
  box: VisionBox;
  confidence: number;
  value?: number;
  rawText?: string;
  needleAngle?: number;
  quality: VisionQuality;
  warning?: string;
  stable?: boolean;
  source?: "general" | "gauge" | "digital-ocr" | "equipment-ocr" | "masa-industrial";
  metadata?: Record<string, string | number | boolean | undefined>;
  debug?: VisionDebug;
}
export interface GaugeCalibration {
  minValue: number;
  maxValue: number;
  minAngle: number;
  maxAngle: number;
  center?: { x: number; y: number };
  radius?: number;
  orientation?: number;
}
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export function normalizeAngle(angle: number) {
  let a = angle % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}
export function angleDistance(a: number, b: number) {
  return Math.abs(normalizeAngle(a - b));
}
export function gaugeReading(angle: number, c: GaugeCalibration) {
  const start = normalizeAngle(c.minAngle),
    end = normalizeAngle(c.maxAngle);
  let span = end - start;
  if (span <= 0) span += 360;
  let position = normalizeAngle(angle) - start;
  if (position < 0) position += 360;
  return c.minValue + clamp(position / span) * (c.maxValue - c.minValue);
}
export function parseNumericReading(text: string) {
  const match = text.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
export function normalizeTag(text: string) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function fuzzyScore(a: string, b: string) {
  a = normalizeTag(a);
  b = normalizeTag(b);
  if (!a || !b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}
export function matchEquipment(
  text: string,
  equipment: string[],
  threshold = 0.62,
) {
  return equipment
    .map((label) => ({ label, score: fuzzyScore(text, label) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score >= threshold);
}
export function shouldRunDigitalOcr(detections: VisionDetection[]) {
  return !detections.some((d) => d.kind === "gauge");
}
export function hasOppositeAmbiguity(values: number[], tolerance = 18) {
  for (let i = 0; i < values.length; i++)
    for (let j = i + 1; j < values.length; j++)
      if (Math.abs(angleDistance(values[i], values[j]) - 180) <= tolerance)
        return true;
  return false;
}
export function isStable(values: number[], toleranceDegrees = 4) {
  if (values.length < 5) return false;
  const base = values[0];
  return (
    values.every((v) => angleDistance(v, base) <= toleranceDegrees) &&
    !hasOppositeAmbiguity(values)
  );
}
export function isNumericStable(
  values: number[],
  relativeTolerance = 0.02,
  minimumSamples = 5,
) {
  if (values.length < minimumSamples) return false;
  const sample = values.slice(-7);
  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const tolerance = Math.max(0.02, Math.abs(mean) * relativeTolerance);
  return sample.every((value) => Math.abs(value - mean) <= tolerance);
}
export function canConfirmLiveDetection(
  detection: VisionDetection | undefined,
  threshold = 0.6,
) {
  return Boolean(
    detection?.stable &&
      detection.value != null &&
      detection.confidence >= threshold,
  );
}
export function needleDirectionScore(m: Omit<RadialMetrics, "score">) {
  return clamp(
    m.centerPassScore * 0.08 +
      m.lengthScore * 0.22 +
      m.thinnessScore * 0.22 +
      m.outerReachScore * 0.22 +
      m.continuityScore * 0.18 +
      m.radialDarknessScore * 0.08 -
      m.counterweightPenalty * 0.32 -
      m.tickMarkPenalty * 0.14,
  );
}
export function selectNeedleDirection(a: RadialMetrics, b: RadialMetrics) {
  return a.score >= b.score ? a : b;
}
function quality(gray: Float32Array, w: number, h: number): VisionQuality {
  let sum = 0,
    sum2 = 0,
    glare = 0;
  for (const g of gray) {
    sum += g;
    sum2 += g * g;
    if (g > 248) glare++;
  }
  const mean = sum / gray.length,
    contrast = Math.sqrt(Math.max(0, sum2 / gray.length - mean * mean));
  let lap = 0,
    lap2 = 0,
    n = 0;
  for (let y = 1; y < h - 1; y += 2)
    for (let x = 1; x < w - 1; x += 2) {
      const p = y * w + x,
        v = 4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - w] - gray[p + w];
      lap += v;
      lap2 += v * v;
      n++;
    }
  const sharp = Math.sqrt(
      Math.max(0, lap2 / Math.max(1, n) - (lap / Math.max(1, n)) ** 2),
    ),
    warnings: string[] = [];
  if (mean < 42) warnings.push("Poor lighting");
  if (mean > 220 || glare / gray.length > 0.08) warnings.push("Reduce glare");
  if (sharp < 18) warnings.push("Hold phone steady");
  return {
    brightness: mean,
    contrast,
    sharpness: sharp,
    glare: glare / gray.length,
    score: clamp(
      (contrast / 55) * 0.4 +
        (sharp / 70) * 0.45 +
        (1 - glare / gray.length) * 0.15,
    ),
    warnings,
  };
}
function pixel(gray: Float32Array, w: number, h: number, x: number, y: number) {
  const ix = Math.round(x),
    iy = Math.round(y);
  return ix >= 0 && iy >= 0 && ix < w && iy < h ? gray[iy * w + ix] : 255;
}
function estimateFace(
  gray: Float32Array,
  w: number,
  h: number,
  override?: GaugeCalibration,
) {
  if (override?.center && override.radius)
    return {
      cx: override.center.x * w,
      cy: override.center.y * h,
      r: override.radius * Math.min(w, h),
      circleScore: 1,
    };
  const min = Math.min(w, h);
  let best = { cx: w / 2, cy: h / 2, r: min * 0.36, circleScore: 0 };
  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++)
      for (let ri = 0; ri < 5; ri++) {
        const cx = w / 2 + ox * min * 0.045,
          cy = h / 2 + oy * min * 0.045,
          r = min * (0.27 + ri * 0.04);
        let edge = 0,
          covered = 0;
        for (let deg = 0; deg < 360; deg += 12) {
          const a = (deg * Math.PI) / 180;
          let e = 0;
          // A real bezel is often thick: search the whole radial band instead
          // of comparing only two pixels that may both lie on the black rim.
          for (let band = -6; band <= 6; band += 2) {
            const inner = pixel(
              gray,
              w,
              h,
              cx + Math.cos(a) * (r + band - 2),
              cy + Math.sin(a) * (r + band - 2),
            );
            const outer = pixel(
              gray,
              w,
              h,
              cx + Math.cos(a) * (r + band + 2),
              cy + Math.sin(a) * (r + band + 2),
            );
            e = Math.max(e, Math.abs(inner - outer) * (1 - Math.abs(band) / 16));
          }
          edge += e;
          if (e > 20) covered++;
        }
        const centerPenalty = Math.hypot(cx - w / 2, cy - h / 2) / min * 0.08;
        const score = clamp(edge / (30 * 200)) * 0.45 + (covered / 30) * 0.55 - centerPenalty;
        if (score > best.circleScore) best = { cx, cy, r, circleScore: score };
      }
  return best;
}
function boxIntersection(a: VisionBox, b: VisionBox) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}
export function isGaugeSuppressedByScreen(candidate: VisionBox, detections: VisionDetection[]) {
  const cx = candidate.x + candidate.width / 2, cy = candidate.y + candidate.height / 2;
  return detections.some((item) => {
    if (!/^(tv|laptop|monitor|cell phone|keyboard)$/i.test(item.label.trim())) return false;
    const inside = cx >= item.box.x && cx <= item.box.x + item.box.width && cy >= item.box.y && cy <= item.box.y + item.box.height;
    const overlap = boxIntersection(candidate, item.box) / Math.max(1e-6, candidate.width * candidate.height);
    return inside || overlap > 0.4;
  });
}
function physicalDialMetrics(gray: Float32Array, w: number, h: number, cx: number, cy: number, r: number, faceMean: number) {
  const sectors = 72;
  let perimeter = 0, innerRing = 0, tickSectors = 0;
  for (let sector = 0; sector < sectors; sector++) {
    const angle = sector * Math.PI * 2 / sectors, cos = Math.cos(angle), sin = Math.sin(angle);
    let outerEdge = 0, innerEdge = 0, tickDark = 0;
    for (let band = -8; band <= 8; band += 2) {
      outerEdge = Math.max(outerEdge, Math.abs(pixel(gray, w, h, cx + cos * (r + band - 2), cy + sin * (r + band - 2)) - pixel(gray, w, h, cx + cos * (r + band + 2), cy + sin * (r + band + 2))));
    }
    for (let band = -5; band <= 5; band += 2) {
      const rr = r * 0.84 + band;
      innerEdge = Math.max(innerEdge, Math.abs(pixel(gray, w, h, cx + cos * (rr - 2), cy + sin * (rr - 2)) - pixel(gray, w, h, cx + cos * (rr + 2), cy + sin * (rr + 2))));
    }
    for (let radial = 0.72; radial <= 0.93; radial += 0.025)
      if (pixel(gray, w, h, cx + cos * r * radial, cy + sin * r * radial) < faceMean - 24) tickDark++;
    if (outerEdge > 22) perimeter++;
    if (innerEdge > 17) innerRing++;
    if (tickDark >= 3) tickSectors++;
  }
  // Text and monitor UI create many short horizontal runs throughout the face.
  // Gauge labels occupy only a minority of rows/sectors, so this rejects dense UI
  // without penalising normal printed scale numbers.
  let denseRows = 0, sampledRows = 0;
  for (let y = Math.floor(cy - r * 0.62); y <= cy + r * 0.62; y += 3) {
    let runs = 0, inRun = false;
    for (let x = Math.floor(cx - r * 0.72); x <= cx + r * 0.72; x += 2) {
      if (Math.hypot(x - cx, y - cy) > r * 0.76) continue;
      const dark = pixel(gray, w, h, x, y) < faceMean - 28;
      if (dark && !inRun) runs++;
      inRun = dark;
    }
    if (runs >= 7) denseRows++;
    sampledRows++;
  }
  return {
    perimeterCoverage: perimeter / sectors,
    concentricRingEvidence: innerRing / sectors,
    radialTickDensity: tickSectors / sectors,
    textDensity: denseRows / Math.max(1, sampledRows),
  };
}
function radialMetrics(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  faceMean: number,
): RadialMetrics {
  const rad = (angle * Math.PI) / 180,
    px = -Math.sin(rad),
    py = Math.cos(rad);
  let dark = 0,
    continuous = 0,
    longest = 0,
    reach = 0.18,
    thin = 0,
    wide = 0,
    innerWidth = 0,
    middleWidth = 0,
    outerOnly = 0,
    samples = 0;
  // The inner 20% is deliberately masked: hub and counterweight mass must not
  // win merely because they contain more black pixels than the pointer.
  for (let t = 0.2; t <= 0.92; t += 0.025) {
    const x = cx + Math.cos(rad) * r * t,
      y = cy + Math.sin(rad) * r * t,
      center = pixel(gray, w, h, x, y),
      side =
        (pixel(gray, w, h, x + px * 9, y + py * 9) +
          pixel(gray, w, h, x - px * 9, y - py * 9)) /
        2,
      darkness = clamp((Math.min(faceMean, side) - center) / 65);
    let width = 0;
    for (let offset = -8; offset <= 8; offset++)
      if (pixel(gray, w, h, x + px * offset, y + py * offset) < faceMean - 20)
        width++;
    const isLine = darkness > 0.1 && width > 0 && width <= 11;
    dark += darkness;
    samples++;
    if (isLine) {
      continuous++;
      longest = Math.max(longest, continuous);
      if (continuous >= 3) reach = t;
      if (width <= 5) thin++;
      if (width >= 8 && t < 0.55) wide++;
    } else continuous = 0;
    if (t < 0.38) innerWidth += width;
    else if (t < 0.68) middleWidth += width;
    if (t > 0.72 && isLine) outerOnly++;
  }
  const continuityScore = longest / Math.max(1, samples),
    lengthScore = clamp((reach - 0.22) / 0.68),
    outerReachScore = clamp((reach - 0.68) / 0.24),
    thinnessScore = clamp(thin / Math.max(1, samples * 0.72)),
    radialDarknessScore = dark / Math.max(1, samples),
    centerPassScore = clamp((radialDarknessScore + continuityScore) * 0.75),
    counterweightPenalty = clamp(
      wide / (samples * 0.3) + (innerWidth > middleWidth * 1.6 ? 0.35 : 0),
    ),
    tickMarkPenalty = clamp(
      outerOnly / Math.max(1, samples * 0.28) - continuityScore,
    ),
    bare = {
      angle: normalizeAngle(angle),
      centerPassScore,
      lengthScore,
      thinnessScore,
      outerReachScore,
      continuityScore,
      radialDarknessScore,
      counterweightPenalty,
      tickMarkPenalty,
    };
  return { ...bare, score: needleDirectionScore(bare) };
}
function digitalScore(
  gray: Float32Array,
  w: number,
  h: number,
  faceMean: number,
  circleScore: number,
) {
  // Digital evidence requires a rectangular bezel: four long edge bands plus
  // digit density inside it. OCR confidence alone is intentionally excluded.
  let top = 0,
    bottom = 0,
    left = 0,
    right = 0,
    insideDark = 0,
    count = 0;
  const x0 = Math.floor(w * 0.18),
    x1 = Math.floor(w * 0.82),
    y0 = Math.floor(h * 0.28),
    y1 = Math.floor(h * 0.72);
  for (let x = x0; x < x1; x += 2) {
    top += Math.abs(
      pixel(gray, w, h, x, y0 - 3) - pixel(gray, w, h, x, y0 + 3),
    );
    bottom += Math.abs(
      pixel(gray, w, h, x, y1 - 3) - pixel(gray, w, h, x, y1 + 3),
    );
  }
  for (let y = y0; y < y1; y += 2) {
    left += Math.abs(
      pixel(gray, w, h, x0 - 3, y) - pixel(gray, w, h, x0 + 3, y),
    );
    right += Math.abs(
      pixel(gray, w, h, x1 - 3, y) - pixel(gray, w, h, x1 + 3, y),
    );
  }
  for (let y = y0 + 8; y < y1 - 8; y += 3)
    for (let x = x0 + 8; x < x1 - 8; x += 3) {
      if (gray[y * w + x] < faceMean - 25) insideDark++;
      count++;
    }
  const horizontalSamples = Math.max(1, (x1 - x0) / 2),
    verticalSamples = Math.max(1, (y1 - y0) / 2);
  const edges = [
    top / horizontalSamples,
    bottom / horizontalSamples,
    left / verticalSamples,
    right / verticalSamples,
  ];
  const rectangleConfidence = clamp(Math.min(...edges) / 42);
  const glyphDensity = clamp((insideDark / Math.max(1, count)) * 3);
  return {
    score: clamp(
      rectangleConfidence * 0.72 + glyphDensity * 0.28 - circleScore * 0.35,
    ),
    rectangleConfidence,
  };
}
export function analyseGaugeDetailed(
  image: ImageData,
  calibration?: GaugeCalibration,
  options: GaugeAnalysisOptions = {},
): { detections: VisionDetection[]; report: GaugeValidationReport } {
  const { width: w, height: h, data } = image;
  const emptyBox = options.candidateBox || { x: 0, y: 0, width: 1, height: 1 };
  const emptyReport: GaugeValidationReport = { accepted: false, reasons: ["insufficient_circle_coverage"], candidateBox: emptyBox, metrics: { circularity: 0, perimeterCoverage: 0, concentricRingEvidence: 0, centerHubConfidence: 0, radialTickDensity: 0, textDensity: 0, needleConfidence: 0 } };
  if (w < 64 || h < 64) return { detections: [], report: emptyReport };
  const gray = new Float32Array(w * h);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4)
    gray[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const q = quality(gray, w, h),
    { cx, cy, r, circleScore } = estimateFace(gray, w, h, calibration);
  let faceSum = 0,
    faceN = 0;
  for (
    let y = Math.max(0, Math.floor(cy - r));
    y < Math.min(h, Math.ceil(cy + r));
    y += 3
  )
    for (
      let x = Math.max(0, Math.floor(cx - r));
      x < Math.min(w, Math.ceil(cx + r));
      x += 3
    ) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d < 0.95) {
        faceSum += gray[y * w + x];
        faceN++;
      }
    }
  const faceMean = faceSum / Math.max(1, faceN), candidates: RadialMetrics[] = [];
  let hubDark = 0,
    hubN = 0;
  for (let y = Math.floor(cy - r * 0.14); y <= cy + r * 0.14; y += 2)
    for (let x = Math.floor(cx - r * 0.14); x <= cx + r * 0.14; x += 2)
      if (Math.hypot(x - cx, y - cy) <= r * 0.14) {
        if (pixel(gray, w, h, x, y) < faceMean - 22) hubDark++;
        hubN++;
      }
  const centerHubConfidence = clamp((hubDark / Math.max(1, hubN) - 0.06) * 3.2);
  const inferredBox = {
    x: clamp((cx - r) / w), y: clamp((cy - r) / h),
    width: clamp((2 * r) / w), height: clamp((2 * r) / h),
  };
  const candidateBox = options.candidateBox || inferredBox;
  const dial = physicalDialMetrics(gray, w, h, cx, cy, r, faceMean);
  const reasons: GaugeRejectionReason[] = [];
  const spatialRulesApply = Boolean(options.fullFrame || options.candidateBox);
  const aspect = options.candidateBox
    ? w / Math.max(1, h)
    : (candidateBox.width * w) / Math.max(1e-6, candidateBox.height * h);
  if (spatialRulesApply && candidateBox.width * candidateBox.height > 0.35) reasons.push("oversized_bbox");
  if (spatialRulesApply && (aspect < 0.72 || aspect > 1.38)) reasons.push("rectangular_region");
  if (spatialRulesApply && (candidateBox.width < 0.03 || candidateBox.width > 0.45)) reasons.push("oversized_bbox");
  if (r / Math.min(w, h) < 0.2 || r / Math.min(w, h) > 0.48) reasons.push("circle_radius_out_of_range");
  if (cx - r < 1 || cy - r < 1 || cx + r >= w - 1 || cy + r >= h - 1) reasons.push("circle_not_contained");
  if (circleScore < 0.46 || dial.perimeterCoverage < 0.62 || dial.concentricRingEvidence < 0.12) reasons.push("insufficient_circle_coverage");
  if (dial.textDensity > 0.42) reasons.push("high_text_density");
  if (centerHubConfidence < 0.22) reasons.push("no_center_hub");
  if (dial.radialTickDensity < 0.18) reasons.push("no_tick_ring");
  if (options.suppressions && isGaugeSuppressedByScreen(candidateBox, options.suppressions)) reasons.push("inside_monitor");
  const baseReport: GaugeValidationReport = {
    accepted: false, reasons: [...new Set(reasons)], candidateBox,
    metrics: { circularity: circleScore, perimeterCoverage: dial.perimeterCoverage, concentricRingEvidence: dial.concentricRingEvidence, centerHubConfidence, radialTickDensity: dial.radialTickDensity, textDensity: dial.textDensity, needleConfidence: 0 },
  };
  // This is the hard boundary between candidate validation and gauge reading.
  // No radial candidate, needle, angle or calibration is produced before it.
  if (baseReport.reasons.length) return { detections: [], report: baseReport };
  for (let angle = -180; angle < 180; angle += 2)
    candidates.push(radialMetrics(gray, w, h, cx, cy, r, angle, faceMean));
  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates[0],
    target = normalizeAngle(selected.angle + 180),
    opposite = candidates.reduce(
      (best, c) =>
        angleDistance(c.angle, target) < angleDistance(best.angle, target)
          ? c
          : best,
      candidates[0],
    ),
    analogGaugeScore = clamp(
      circleScore * 0.18 +
        dial.perimeterCoverage * 0.15 +
        dial.concentricRingEvidence * 0.12 +
        centerHubConfidence * 0.17 +
        selected.score * 0.23 +
        dial.radialTickDensity * 0.15,
    ),
    digital = digitalScore(gray, w, h, faceMean, circleScore),
    digitalDisplayScore = digital.score,
    structuralAnalog =
      circleScore > 0.3 &&
      centerHubConfidence > 0.16 &&
      selected.score > 0.15 &&
      dial.radialTickDensity >= 0.18;
  if (!structuralAnalog || selected.score < 0.24 || selected.outerReachScore < 0.24 || selected.continuityScore < 0.12) {
    return { detections: [], report: { ...baseReport, reasons: ["no_valid_needle"], metrics: { ...baseReport.metrics, needleConfidence: selected.score } } };
  }
  if (
    !structuralAnalog &&
    (analogGaugeScore < 0.38 ||
      (digital.rectangleConfidence > 0.38 &&
        analogGaugeScore <= digitalDisplayScore + 0.08))
  )
    return { detections: [], report: { ...baseReport, reasons: ["no_valid_needle"], metrics: { ...baseReport.metrics, needleConfidence: selected.score } } };
  const ambiguous = Math.abs(selected.score - opposite.score) < 0.075,
    confidence = clamp(
      analogGaugeScore * 0.75 +
        q.score * 0.1 +
        Math.max(0, selected.score - opposite.score) * 0.35 -
        (ambiguous ? 0.12 : 0),
    ),
    debug: VisionDebug = {
      center: { x: cx / w, y: cy / h },
      radius: r / Math.min(w, h),
      oppositeAngle: opposite.angle,
      needleScore: selected.score,
      oppositeDirectionScore: opposite.score,
      analogGaugeScore,
      digitalDisplayScore,
      circleConfidence: circleScore,
      centerHubConfidence,
      radialNeedleConfidence: selected.score,
      scaleRingEvidence: dial.radialTickDensity,
      rectangleDisplayConfidence: digital.rectangleConfidence,
      ambiguity180: ambiguous,
      candidates: candidates.slice(0, 8),
    },
    warning = !calibration
      ? "Calibration required before numeric reading"
      : ambiguous
        ? "Needle direction is ambiguous — hold steady"
        : q.warnings[0];
  const detections: VisionDetection[] = [
    {
      id: "gauge-0",
      kind: "gauge",
      label: "Analog Gauge",
      source: "gauge",
      box: {
        x: clamp((cx - r) / w),
        y: clamp((cy - r) / h),
        width: clamp((2 * r) / w),
        height: clamp((2 * r) / h),
      },
      confidence,
      value:
        calibration && !ambiguous && q.score > 0.25
          ? gaugeReading(selected.angle, calibration)
          : undefined,
      needleAngle: selected.angle,
      quality: q,
      warning,
      debug,
    },
  ];
  return { detections, report: { ...baseReport, accepted: true, reasons: [], metrics: { ...baseReport.metrics, needleConfidence: selected.score } } };
}
export function analyseGauge(image: ImageData, calibration?: GaugeCalibration, options: GaugeAnalysisOptions = {}): VisionDetection[] {
  return analyseGaugeDetailed(image, calibration, options).detections;
}
export function imageDifference(a: ImageData, b: ImageData) {
  if (a.width !== b.width || a.height !== b.height)
    return { score: 1, changed: true };
  let total = 0;
  for (let i = 0; i < a.data.length; i += 16)
    total +=
      (Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])) /
      (255 * 3);
  const score = total / Math.ceil(a.data.length / 16);
  return { score, changed: score > 0.18 };
}
