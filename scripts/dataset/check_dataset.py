from pathlib import Path
from validate_labels import validate

ROOT = Path(__file__).resolve().parents[2] / "datasets/masa-industrial"
extensions = {".jpg", ".jpeg", ".png", ".webp"}
errors = validate(ROOT / "labels")
for split in ("train", "val", "test"):
    images = {p.stem for p in (ROOT / "images" / split).iterdir() if p.suffix.lower() in extensions}
    labels = {p.stem for p in (ROOT / "labels" / split).glob("*.txt")}
    errors += [f"{split}: missing label for {name}" for name in sorted(images - labels)]
    errors += [f"{split}: missing image for {name}" for name in sorted(labels - images)]
print("\n".join(errors) if errors else "Dataset structure and pairs valid")
raise SystemExit(bool(errors))
