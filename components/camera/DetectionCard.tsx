import type { VisionDetection } from "@/lib/vision";
export function DetectionCard({
  detection,
  threshold = 0.6,
  unit,
}: {
  detection?: VisionDetection;
  threshold?: number;
  unit?: string;
}) {
  if (!detection)
    return (
      <div className="detection-card">
        <b>Searching...</b>
        <small>Live AI is looking for the current check.</small>
      </div>
    );
  const low = detection.confidence < threshold;
  return (
    <div className={`detection-card ${low ? "warn" : ""}`}>
      <div>
        <b>{detection.label}</b>
        <strong>
          {detection.value != null
            ? `${detection.value.toFixed(2)}${unit ? ` ${unit}` : ""}`
            : detection.kind === "gauge" && detection.needleAngle != null
              ? `${Math.round(detection.needleAngle)}°`
              : "—"}
        </strong>
      </div>
      {detection.kind === "gauge" && (
        <p>
          Needle detected · Angle: {Math.round(detection.needleAngle || 0)}°
        </p>
      )}
      <p>
        Confidence {Math.round(detection.confidence * 100)}% · Quality{" "}
        {Math.round(detection.quality.score * 100)}%
      </p>
      <small>
        {detection.warning ||
          (low
            ? "Low confidence"
            : detection.stable || detection.debug?.stable
              ? "Stable"
              : "Reading... Hold steady")}
      </small>
    </div>
  );
}
