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
    const gauge = analyseGauge(ctx.getImageData(0, 0, c.width, c.height), {
      minValue: 0,
      maxValue: 10,
      minAngle: -135,
      maxAngle: 135,
    });
    try {
      const ocr = await recognizeLocal(c);
      if (ocr.value != null)
        gauge.push({
          ...gauge[0],
          id: "ocr",
          kind: "digital",
          label: "OCR reading",
          value: ocr.value,
          rawText: ocr.text,
          confidence: ocr.confidence,
          box: { x: 0.2, y: 0.35, width: 0.6, height: 0.3 },
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
          />
          <canvas ref={canvas} hidden />
        </div>
        <DetectionCard
          detection={detections.find((d) => d.id === selected) || detections[0]}
        />
      </div>
      <Link className="back-link" href="/">
        ‹ Back to application
      </Link>
    </main>
  );
}
