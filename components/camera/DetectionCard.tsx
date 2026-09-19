import type { VisionDetection } from "@/lib/vision";
export function DetectionCard({
  detection,
  threshold = 0.6,
}: {
  detection?: VisionDetection;
  threshold?: number;
}) {
  if (!detection)
    return (
      <div className="detection-card">
        <b>Looking for a gauge or display…</b>
        <small>Keep the target inside the guide.</small>
      </div>
    );
  const low = detection.confidence < threshold;
  return (
    <div className={`detection-card ${low ? "warn" : ""}`}>
      <div>
        <b>{detection.label}</b>
        <strong>
          {detection.value != null
            ? detection.value.toFixed(2)
            : detection.kind === "gauge" && detection.needleAngle != null
              ? `${Math.round(detection.needleAngle)}°`
              : "—"}
        </strong>
      </div>
      {detection.kind === "gauge" && detection.value == null && (
        <p>Needle detected · Calibration required before numeric reading</p>
      )}
      <p>
        Confidence {Math.round(detection.confidence * 100)}% · Quality{" "}
        {Math.round(detection.quality.score * 100)}%
      </p>
      <small>
        {detection.warning ||
          (low
            ? "Low confidence — retake or enter manually"
            : detection.debug?.stable
              ? "Stable reading; operator confirmation is still required"
              : "Manual confirmation required")}
      </small>
    </div>
  );
}
