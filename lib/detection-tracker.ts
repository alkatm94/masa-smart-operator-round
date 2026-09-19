import type { VisionDetection } from "./vision";
import { intersectionOverUnion } from "./vision-orchestrator";

interface Track { id: string; label: string; box: VisionDetection["box"]; misses: number }

export class DetectionTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  constructor(private iouThreshold = 0.35, private maxMisses = 4) {}
  update(detections: VisionDetection[]): VisionDetection[] {
    const matched = new Set<string>();
    const result = detections.map((detection) => {
      const label = String(detection.metadata?.industrialClass || detection.label);
      const track = this.tracks
        .filter((candidate) => candidate.label === label && !matched.has(candidate.id))
        .map((candidate) => ({ candidate, iou: intersectionOverUnion(candidate.box, detection.box) }))
        .sort((a, b) => b.iou - a.iou)[0];
      const current = track?.iou >= this.iouThreshold ? track.candidate : { id: `track-${this.nextId++}`, label, box: detection.box, misses: 0 };
      current.box = detection.box; current.misses = 0; matched.add(current.id);
      if (!this.tracks.includes(current)) this.tracks.push(current);
      return { ...detection, id: current.id, metadata: { ...detection.metadata, trackId: current.id } };
    });
    this.tracks = this.tracks.filter((track) => matched.has(track.id) || ++track.misses <= this.maxMisses);
    return result;
  }
  reset() { this.tracks = []; this.nextId = 1; }
}
