export interface UserSession{id:string;name:string;username:string;group:string}
export interface RoundItem{id:string;equipment:string;label:string;kind:"reading"|"inspection"|"observation";unit?:string;required:boolean;previous?:number;value?:number;status:"pending"|"completed"|"attention"|"skipped";photos:string[];notes:string;skipReason?:string}
export interface Round{id:string;stationId:string;stationName:string;operator:string;group:string;type:"Routine Round"|"Special Inspection"|"Follow-up Round";status:"active"|"completed";startedAt:string;finishedAt?:string;items:RoundItem[]}
export interface Calibration{id:string;stationId:string;equipment:string;min:number;max:number;minAngle:number;maxAngle:number;unit:string}
export interface AppState{session:UserSession|null;activeRound:Round|null;rounds:Round[];calibrations:Calibration[];settings:{cameraRecognition:boolean;voiceNotes:boolean;imageQuality:"balanced"|"high";pressureThreshold:number;tankThreshold:number;conductivityThreshold:number}}
const initial:AppState={session:null,activeRound:null,rounds:[],calibrations:[],settings:{cameraRecognition:true,voiceNotes:true,imageQuality:"balanced",pressureThreshold:15,tankThreshold:10,conductivityThreshold:12}};
const DB="masa-smart-round",STORE="app",KEY="state";
const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
export async function loadState(){try{const db=await open();return await new Promise<AppState>(resolve=>{const r=db.transaction(STORE).objectStore(STORE).get(KEY);r.onsuccess=()=>resolve(r.result||initial);r.onerror=()=>resolve(initial)})}catch{return initial}}
export async function saveState(state:AppState){try{const db=await open();db.transaction(STORE,"readwrite").objectStore(STORE).put(state,KEY)}catch{localStorage.setItem(KEY,JSON.stringify(state))}}
export async function resetState(){try{indexedDB.deleteDatabase(DB);localStorage.removeItem(KEY)}catch{}}
export function exportJson(state:AppState){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download=`masa-round-backup-${new Date().toISOString().slice(0,10)}.json`;a.click()}
export async function importJson(file:File){const parsed=JSON.parse(await file.text());if(!parsed.settings||!Array.isArray(parsed.rounds))throw new Error("Invalid backup");await saveState(parsed);return parsed as AppState}
