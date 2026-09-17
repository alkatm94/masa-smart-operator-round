import test from "node:test";import assert from "node:assert/strict";import{calculateComparison,calculateTankRate,gaugeAngleToReading,validateRoundCompletion}from"../lib/calculations";
test("tank rate calculation",()=>{assert.deepEqual(calculateTankRate(9.5,8.5,2),{difference:-1,elapsedHours:2,rate:-.5,trend:"Falling"})});
test("pressure difference and percentage",()=>{const r=calculateComparison(3.1,2.5);assert.equal(r.difference,-.6000000000000001);assert.ok(Math.abs((r.percent??0)+19.3548)<.001)});
test("gauge angle converts to reading",()=>{assert.equal(gaugeAngleToReading(0,{min:0,max:10,minAngle:-135,maxAngle:135}),5)});
test("gauge clamps outside calibrated sweep",()=>{assert.equal(gaugeAngleToReading(200,{min:0,max:10,minAngle:-135,maxAngle:135}),10)});
test("required checks block finish",()=>{assert.deepEqual(validateRoundCompletion([{required:true,status:"pending"},{required:false,status:"pending"}]),{valid:false,remaining:1})});
test("skip is valid only with a reason",()=>{assert.equal(validateRoundCompletion([{required:true,status:"skipped",skipReason:"Access blocked"}]).valid,true)});
