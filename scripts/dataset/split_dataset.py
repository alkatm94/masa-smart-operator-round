from pathlib import Path
import argparse, random, shutil

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("source"); parser.add_argument("--seed", type=int, default=42); parser.add_argument("--train", type=float, default=.7); parser.add_argument("--val", type=float, default=.2)
    args = parser.parse_args(); source = Path(args.source); root = Path(__file__).resolve().parents[2] / "datasets/masa-industrial"
    images = [p for p in (source / "images").iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    random.Random(args.seed).shuffle(images)
    for index, image in enumerate(images):
        ratio = index / max(1, len(images)); split = "train" if ratio < args.train else "val" if ratio < args.train + args.val else "test"
        label = source / "labels" / f"{image.stem}.txt"
        if not label.exists(): raise FileNotFoundError(label)
        shutil.copy2(image, root / "images" / split / image.name); shutil.copy2(label, root / "labels" / split / label.name)

if __name__ == "__main__": main()
