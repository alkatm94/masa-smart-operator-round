# Operator observation model slot

No production detector is installed for `sight_glass`, `water_leak`, `water_pooling`, `corrosion`, `open_panel_door`, or `panel_indicator`.

A future validated model may provide `model.json` and its referenced local model file here. Until then Operator Vision Scan reports `Observation models: Not Trained` in debug mode and emits no detections or severities for these classes. Panel states can still be returned only when OCR explicitly reads a supported label together with `ON` or `OFF` inside a detected control-panel ROI.
