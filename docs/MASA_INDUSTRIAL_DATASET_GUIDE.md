# MASA Industrial Dataset Guide

Collect through **Settings → Industrial Data Collection**. Images stay local until ZIP export. Do not collect identifiable people or sensitive documents without approval.

## Recommended coverage

| Class | Minimum images | Required variation |
|---|---:|---|
| pump, motor | 500 each | front/side/three-quarter, 1–8 m, operating/stopped, clean/dirty |
| valve | 800 | all common valve types, partial occlusion, dense pipework |
| valve_indicator | 1,000 | 0/25/50/75/100%, clockwise/counterclockwise, glare/rust |
| handwheel | 500 | size/color variation; never infer position without indicator |
| analog_gauge | 1,000 | face rotations, ranges, needles, glare, printed scales |
| digital_meter | 800 | seven-segment/LCD, units, bloom, oblique viewing |
| control_panel | 500 | open/closed, indoor/outdoor, cluttered panels |
| generator, tank | 400 each | near/far, partial views, multiple backgrounds |
| pipe, flange | 600 each | diameters, materials, insulation, corrosion |
| nameplate | 1,000 | readable/unreadable, oblique, worn, multiple tag formats |

For every class include day/night, harsh sun/shade, artificial light, near/far, high/low camera angle, clean/dirty equipment, different backgrounds and 10–30% occlusion. Keep blurred or unreadable examples but do not annotate a class that cannot be verified. For indicator-equipped valves, balance known 0/25/50/75/100 positions; mark uncertain positions `Unknown`.

Draw tight boxes. Valve body, indicator and handwheel are separate objects. A nameplate box contains only the plate. For panels, label the panel and visible meters/nameplates inside it. Never infer hidden objects. The class order is in `datasets/masa-industrial/data.yaml`; YOLO rows are `class x_center y_center width height`, normalized to 0–1.

Keep one capture session in one split to prevent leakage. Target 70% train, 20% validation and 10% test, balanced by station, equipment and lighting.

```powershell
python scripts/dataset/split_dataset.py exported-folder
python scripts/dataset/validate_labels.py
python scripts/dataset/stats.py
python scripts/dataset/check_dataset.py
```

Review false positives on circular signs, printed gauge digits, handwheels without indicators and cluttered panels before release.
