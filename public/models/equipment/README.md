# Equipment model slot

No pump/valve model is bundled. Add a validated on-device model as `model.json` plus its weights only after field dataset training and acceptance testing. The application intentionally reports “AI model not trained for this equipment yet” and returns no synthetic detections while this slot is empty.
