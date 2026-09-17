export type VisionResult<T>={value:T|null;confidence:number;rawText?:string;warning?:string};
export interface GaugeFrame{image:ImageData;calibration:{min:number;max:number;minAngle:number;maxAngle:number;center?:{x:number;y:number}}}

/** Uses the browser Shape Detection text API when available. Never returns a confirmed value. */
export async function detectDisplayText(source:ImageBitmapSource):Promise<VisionResult<number>>{
  const Detector=(globalThis as typeof globalThis & {TextDetector?:new()=>{detect:(s:ImageBitmapSource)=>Promise<{rawValue:string}[]>}}).TextDetector;
  if(!Detector)return{value:null,confidence:0,warning:"On-device OCR is unavailable. Enter the reading manually."};
  try{const blocks=await new Detector().detect(source);const rawText=blocks.map(b=>b.rawValue).join(" ");const match=rawText.replace(",",".").match(/-?\d+(?:\.\d+)?/);return match?{value:Number(match[0]),confidence:.72,rawText}:{value:null,confidence:0,rawText,warning:"No reliable numeric reading detected."}}catch{return{value:null,confidence:0,warning:"Unable to read this display. Retake or enter manually."}}
}

/** Lightweight prototype: validates image quality and keeps gauge math isolated for a future trained detector. */
export function assessGaugeFrame({image}:GaugeFrame):VisionResult<number>{
  const {data}=image;let sum=0,sumSq=0;
  for(let i=0;i<data.length;i+=16){const y=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=y;sumSq+=y*y}
  const samples=Math.ceil(data.length/16),mean=sum/samples,variance=sumSq/samples-mean*mean;
  if(mean<45)return{value:null,confidence:.15,warning:"Poor lighting detected. Use flash or retake."};
  if(mean>225)return{value:null,confidence:.12,warning:"Strong glare detected. Change the camera angle."};
  if(variance<260)return{value:null,confidence:.18,warning:"Image may be blurry. Hold steady and retake."};
  return{value:null,confidence:.35,warning:"Gauge detected, but needle reading needs confirmation or a trained detector."};
}

export function imageDifference(a:ImageData,b:ImageData){if(a.width!==b.width||a.height!==b.height)return{score:1,changed:true};let total=0;for(let i=0;i<a.data.length;i+=16)total+=(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]))/(255*3);const score=total/Math.ceil(a.data.length/16);return{score,changed:score>.18}}
