# MASA Industrial YOLO training

Python is used only to validate data, train YOLOv8 nano and export ONNX; it is never part of the web runtime.

```powershell
py -m venv .venv
.venv\Scripts\pip install -r training\requirements.txt
python scripts\dataset\check_dataset.py
python training\train_yolo.py --epochs 100
python training\export_model.py training\runs\masa-industrial\weights\best.pt --version 1.0.0
```

Export creates `public/models/masa-industrial/model.onnx` and `model.json`. Without them the app reports `MASA Industrial Model: Not Trained` and retains the gauge, OCR and MediaPipe fallbacks. The browser parser supports standard Ultralytics `[1, 4 + classes, anchors]` and transposed output, then applies class-aware NMS locally.
