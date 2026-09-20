import { analyseGaugeDetailed, type GaugeCalibration, type VisionDetection } from "../lib/vision";
self.onmessage = (
  event: MessageEvent<{
    id: number;
    image: ImageData;
    calibration?: GaugeCalibration;
    suppressions?: VisionDetection[];
  }>,
) => {
  const { id, image, calibration, suppressions } = event.data;
  const result = analyseGaugeDetailed(image, calibration, { fullFrame: true, suppressions });
  postMessage({ id, ...result });
};
