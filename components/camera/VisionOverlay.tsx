import type { VisionDetection } from "@/lib/vision";
export function VisionOverlay({
  detections,
  selected,
  onSelect,
  showConfidence = true,
  debugMode = false,
}: {
  detections: VisionDetection[];
  selected: string | null;
  onSelect: (id: string) => void;
  showConfidence?: boolean;
  debugMode?: boolean;
}) {
  return (
    <div className="vision-overlay">
      {detections.map((d) => (
        <button
          key={d.id}
          className={`vision-box ${selected === d.id ? "selected" : ""}`}
          style={{
            left: `${d.box.x * 100}%`,
            top: `${d.box.y * 100}%`,
            width: `${d.box.width * 100}%`,
            height: `${d.box.height * 100}%`,
          }}
          onClick={() => onSelect(d.id)}
          aria-label={`Select ${d.label}`}
        >
          <span>
            {d.label}
            {d.value != null ? ` · ${d.value.toFixed(2)}` : ""}
            {showConfidence ? ` · ${Math.round(d.confidence * 100)}%` : ""}
          </span>
          {d.needleAngle != null && (
            <i
              className="needle-selected"
              style={{ transform: `rotate(${d.needleAngle}deg)` }}
            />
          )}
          {debugMode && d.debug && (
            <>
              {d.debug.candidates.map((candidate) => (
                <i
                  key={candidate.angle}
                  className="needle-candidate"
                  style={{
                    transform: `rotate(${candidate.angle}deg)`,
                    opacity: 0.15 + candidate.score * 0.45,
                  }}
                />
              ))}
              <i
                className="needle-rejected"
                style={{ transform: `rotate(${d.debug.oppositeAngle}deg)` }}
              />
              <em className="gauge-debug-circle" />
              <em className="gauge-debug-hub" />
            </>
          )}
        </button>
      ))}
    </div>
  );
}
