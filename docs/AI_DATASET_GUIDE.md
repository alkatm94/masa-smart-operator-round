# MASA AI Camera dataset guide

## Status

Analog gauge reading uses deterministic local image processing and OCR uses locally cached Tesseract assets. Pump, valve and equipment-state recognition is an adapter only: it needs a field-trained model and must not be presented as production detection before validation.

## Capture and labels

Collect authorized images per station and equipment class across daylight, night shifts, glare, dirt, partial occlusion, distance, camera orientation, and normal/abnormal states. Remove people, badges, screens, and location metadata. Keep a separate site/time-based test set. Use boxes for `pump`, `valve`, `gauge`, `digital_display`, and `equipment_tag`. For gauges store center, radius, range, sweep, unit, needle angle and confirmed reading. Mark ambiguity as `unknown`.

Use names such as `JICH_pressure_001_3.1bar.jpg`: station, instrument/check name, sequence and verified reading. For every gauge include frontal, slight-left/right, bright, dim, glare, clean-glass, dirty-glass and varied-reading samples.

## Acceptance and deployment

Evaluate precision/recall, false-positive rate, gauge absolute error, OCR accuracy and latency on the oldest supported iPhone. Set thresholds from held-out data. Preserve operator confirmation and audit AI suggestions separately. Export a browser-compatible quantized model to `public/models/equipment`, update the adapter/cache/version, and complete a controlled field pilot. Models and images remain on-device.
