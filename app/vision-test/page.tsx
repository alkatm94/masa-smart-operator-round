"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { analyseGauge, type VisionDetection } from "@/lib/vision";
import { recognizeLocal } from "@/lib/ocr";
import { VisionOverlay } from "@/components/camera/VisionOverlay";
import { DetectionCard } from "@/components/camera/DetectionCard";
export default function VisionTest() {
  const [image, setImage] = useState("/test-vision/gauge.svg"),
    [detections, setDetections] = useState<VisionDetection[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = async () => {
    setBusy(true);
    const img = new Image();
    img.src = image;
    await img.decode();
    const c = canvas.current!;
    c.width = 640;
    c.height = Math.round((640 * img.height) / img.width);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const gauge = analyseGauge(ctx.getImageData(0, 0, c.width, c.height));
    if (!gauge.length)
      try {
        const ocr = await recognizeLocal(c);
        if (ocr.value != null)
          gauge.push({
            id: "ocr",
            kind: "digital",
            label: "Digital display",
            value: ocr.value,
            rawText: ocr.text,
            confidence: ocr.confidence,
            box: { x: 0.2, y: 0.35, width: 0.6, height: 0.3 },
            quality: {
              brightness: 0,
              contrast: 0,
              sharpness: 0,
              glare: 0,
              score: ocr.confidence,
              warnings: [],
            },
          });
      } catch {}
    setDetections(gauge);
    setSelected(gauge[0]?.id || null);
    setBusy(false);
  };
  return (
    <main className="vision-test">
      <p className="eyebrow">DEVELOPER TOOL</p>
      <h1>Vision Test Lab</h1>
      <p>
        Run the same local gauge and OCR pipeline against a test image. No
        upload leaves this browser.
      </p>
      <section className="panel">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setImage(URL.createObjectURL(f));
          }}
        />
        <div className="chips">
          <button onClick={() => setImage("/test-vision/gauge.svg")}>
            Synthetic gauge
          </button>
          <button onClick={() => setImage("/test-vision/digital-display.svg")}>
            Digital display
          </button>
        </div>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Processing…" : "Run local pipeline"}
        </button>
      </section>
      <div className="vision-lab">
        <div className="test-canvas">
          <img src={image} alt="Vision test input" />
          <VisionOverlay
            detections={detections}
            selected={selected}
            onSelect={setSelected}
            debugMode
          />
          <canvas ref={canvas} hidden />
        </div>
        <DetectionCard
          detection={detections.find((d) => d.id === selected) || detections[0]}
        />
      </div>
      {detections[0]?.debug && (
        <section className="panel">
          <h2>Gauge diagnostics</h2>
          <div className="details-grid">
            <div>
              <small>Classification</small>
              <b>Analog Gauge</b>
            </div>
            <div>
              <small>Gauge center</small>
              <b>
                {detections[0].debug.center.x.toFixed(3)},{" "}
                {detections[0].debug.center.y.toFixed(3)}
              </b>
            </div>
            <div>
              <small>Radius</small>
              <b>{detections[0].debug.radius.toFixed(3)}</b>
            </div>
            <div>
              <small>Selected needle angle</small>
              <b>{detections[0].needleAngle?.toFixed(1)}°</b>
            </div>
            <div>
              <small>Opposite angle</small>
              <b>{detections[0].debug.oppositeAngle.toFixed(1)}°</b>
            </div>
            <div>
              <small>Needle score</small>
              <b>{detections[0].debug.needleScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Counterweight score</small>
              <b>{detections[0].debug.oppositeDirectionScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Analog score</small>
              <b>{detections[0].debug.analogGaugeScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Digital score</small>
              <b>{detections[0].debug.digitalDisplayScore.toFixed(3)}</b>
            </div>
            <div>
              <small>Calibration</small>
              <b>Missing</b>
            </div>
          </div>
        </section>
      )}
      <Link className="back-link" href="/">
        ‹ Back to application
      </Link>
    </main>
  );
}
