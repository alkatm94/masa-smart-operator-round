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
          {detection.value == null ? "—" : detection.value.toFixed(2)}
        </strong>
      </div>
      <p>
        Confidence {Math.round(detection.confidence * 100)}% · Quality{" "}
        {Math.round(detection.quality.score * 100)}%
      </p>
      <small>
        {detection.warning ||
          (low
            ? "Low confidence — retake or enter manually"
            : "Stable result; operator confirmation is still required")}
      </small>
    </div>
  );
}
