import{copyFile,mkdir}from"node:fs/promises";import{join}from"node:path";
const out=join(process.cwd(),"public","models","ocr");await mkdir(out,{recursive:true});
for(const[src,name]of[["node_modules/tesseract.js/dist/worker.min.js","worker.min.js"],["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js","tesseract-core-simd-lstm.wasm.js"],["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm","tesseract-core-simd-lstm.wasm"],["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz","eng.traineddata.gz"]])await copyFile(join(process.cwd(),src),join(out,name));
console.log("Local OCR assets copied to public/models/ocr");
