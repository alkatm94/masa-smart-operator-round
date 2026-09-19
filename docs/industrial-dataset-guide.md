# MASA industrial dataset guide

## Capture and annotation

- Capture varied distances, rotations, glare, low light, occlusion and backgrounds through Settings → Data Collection.
- Select only the real class. For valves, record a known 0/25/50/75/100 position when available.
- Draw tight boxes. Valve body, indicator and handwheel are separate objects. A nameplate box contains only the plate.
- Do not infer hidden objects or collect sensitive people/documents without approval.

The fixed class order is in `datasets/masa-industrial/data.yaml`. YOLO rows are `class x_center y_center width height`, normalized to 0–1.

Keep frames from one capture session in one split to avoid leakage. Aim for 70% train, 20% validation and 10% test, balanced across stations and lighting.

```powershell
python scripts/dataset/split_dataset.py exported-folder
python scripts/dataset/validate_labels.py
python scripts/dataset/stats.py
python scripts/dataset/check_dataset.py
```

Before release, review false positives on circular signs, printed gauge digits, handwheels without indicators and cluttered panels.
