from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[2] / "datasets/masa-industrial"
names = ["pump","motor","valve","valve_indicator","handwheel","analog_gauge","digital_meter","control_panel","generator","tank","pipe","flange","nameplate"]
for split in ("train", "val", "test"):
    counts = Counter()
    for label in (ROOT / "labels" / split).glob("*.txt"):
        for line in label.read_text(encoding="utf-8").splitlines():
            if line.strip(): counts[names[int(line.split()[0])]] += 1
    images = [p for p in (ROOT / "images" / split).iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    print(split, "images=", len(images), "labels=", dict(counts))
