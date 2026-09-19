export type VisionKind = "gauge" | "digital" | "tag" | "equipment";
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
          for (let band = -10; band <= 10; band += 2) {
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
            e = Math.max(e, Math.abs(inner - outer));
          }
          edge += e;
          if (e > 20) covered++;
        }
        const score = clamp(edge / (30 * 55)) * 0.45 + (covered / 30) * 0.55;
        if (score > best.circleScore) best = { cx, cy, r, circleScore: score };
      }
  return best;
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
export function analyseGauge(
  image: ImageData,
  calibration?: GaugeCalibration,
): VisionDetection[] {
  const { width: w, height: h, data } = image;
  if (w < 64 || h < 64) return [];
  const gray = new Float32Array(w * h);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4)
    gray[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const q = quality(gray, w, h),
    { cx, cy, r, circleScore } = estimateFace(gray, w, h, calibration);
  let faceSum = 0,
    faceN = 0,
    ticks = 0;
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
      if (d > 0.72 && d < 0.94 && gray[y * w + x] < 95) ticks++;
    }
  const faceMean = faceSum / Math.max(1, faceN),
    tickScore = clamp(ticks / Math.max(1, faceN * 0.12)),
    candidates: RadialMetrics[] = [];
  let hubDark = 0,
    hubN = 0;
  for (let y = Math.floor(cy - r * 0.14); y <= cy + r * 0.14; y += 2)
    for (let x = Math.floor(cx - r * 0.14); x <= cx + r * 0.14; x += 2)
      if (Math.hypot(x - cx, y - cy) <= r * 0.14) {
        if (pixel(gray, w, h, x, y) < faceMean - 22) hubDark++;
        hubN++;
      }
  const centerHubConfidence = clamp((hubDark / Math.max(1, hubN) - 0.06) * 3.2);
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
      circleScore * 0.35 +
        centerHubConfidence * 0.2 +
        selected.score * 0.3 +
        tickScore * 0.15,
    ),
    digital = digitalScore(gray, w, h, faceMean, circleScore),
    digitalDisplayScore = digital.score,
    structuralAnalog =
      circleScore > 0.3 &&
      centerHubConfidence > 0.16 &&
      selected.score > 0.15 &&
      tickScore > 0.04;
  if (
    !structuralAnalog &&
    (analogGaugeScore < 0.38 ||
      (digital.rectangleConfidence > 0.38 &&
        analogGaugeScore <= digitalDisplayScore + 0.08))
  )
    return [];
  const ambiguous = Math.abs(selected.score - opposite.score) < 0.075,
    confidence = clamp(
      analogGaugeScore * 0.62 +
        q.score * 0.22 +
        Math.max(0, selected.score - opposite.score) * 0.5 -
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
      scaleRingEvidence: tickScore,
      rectangleDisplayConfidence: digital.rectangleConfidence,
      ambiguity180: ambiguous,
      candidates: candidates.slice(0, 8),
    },
    warning = !calibration
      ? "Calibration required before numeric reading"
      : ambiguous
        ? "Needle direction is ambiguous — hold steady"
        : q.warnings[0];
  return [
    {
      id: "gauge-0",
      kind: "gauge",
      label: "Analog Gauge",
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
