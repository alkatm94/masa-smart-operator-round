import JSZip from "jszip";
import type { DataCollectionRecord } from "./local-store";

function dataUrlBytes(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  return { mime, bytes: data, extension: mime.includes("png") ? "png" : "jpg" };
}
export async function exportDatasetZip(records: DataCollectionRecord[]) {
  const zip = new JSZip(), root = zip.folder("masa-industrial-dataset")!;
  const manifest = records.map(({ imageDataUrl, ...record }) => ({ ...record, imagePath: `images/unassigned/${record.id}.${dataUrlBytes(imageDataUrl).extension}` }));
  for (const record of records) {
    const file = dataUrlBytes(record.imageDataUrl);
    root.file(`images/unassigned/${record.id}.${file.extension}`, file.bytes, { base64: true });
  }
  root.file("manifest.json", JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: manifest }, null, 2));
  root.file("README.txt", "Images are intentionally unlabelled. Annotate them in YOLO format, then run scripts/dataset/split_dataset.py and validate_labels.py.\n");
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
