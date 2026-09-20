"""Train the MASA industrial detector. Python is never used by the web app."""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(ROOT / "datasets/masa-industrial/data.yaml"))
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default=None, help="cpu, 0, 0,1 or another Ultralytics device value")
    args = parser.parse_args()
    from ultralytics import YOLO
    YOLO(args.model).train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device, project=str(ROOT / "training/runs"), name="masa-industrial")

if __name__ == "__main__":
    main()
