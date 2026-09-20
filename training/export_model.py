"""Export a trained Ultralytics checkpoint and browser metadata."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, shutil

ROOT = Path(__file__).resolve().parents[1]
CLASSES = ["pump","motor","valve","valve_indicator","handwheel","analog_gauge","digital_meter","control_panel","generator","tank","pipe","flange","nameplate"]

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", required=True)
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--dataset-version", default="1")
    parser.add_argument("--imgsz", type=int, default=640)
    args = parser.parse_args()
    from ultralytics import YOLO
    exported = Path(YOLO(args.weights).export(format="onnx", imgsz=args.imgsz, simplify=True, opset=17, dynamic=False))
    output = ROOT / "public/models/masa-industrial"
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(exported, output / "model.onnx")
    trained_at = datetime.now(timezone.utc).isoformat()
    metadata = {"name":"MASA Industrial YOLO","modelName":"MASA Industrial YOLO","version":args.version,"modelVersion":args.version,"format":"onnx","modelPath":"/models/masa-industrial/model.onnx","inputSize":args.imgsz,"classes":CLASSES,"trainedAt":trained_at,"trainingDate":trained_at,"datasetVersion":args.dataset_version,"confidenceThreshold":0.45,"iouThreshold":0.45}
    (output / "model.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (output / "classes.json").write_text(json.dumps(CLASSES, indent=2), encoding="utf-8")
    print(f"Exported {output / 'model.onnx'} and model.json")

if __name__ == "__main__":
    main()
