import { analyseGauge, type GaugeCalibration } from "../lib/vision";
self.onmessage = (
  event: MessageEvent<{
    id: number;
    image: ImageData;
    calibration?: GaugeCalibration;
  }>,
) => {
  const { id, image, calibration } = event.data;
  postMessage({ id, detections: analyseGauge(image, calibration) });
};
