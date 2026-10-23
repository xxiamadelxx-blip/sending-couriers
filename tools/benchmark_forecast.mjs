// Synthetic regression benchmark; no personal workbook is included.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {emptyState,forecastFinances} from '../web/core.mjs';
import {saveDay,parseWindows,addDays,planDay,weekPlan} from '../web/forecast.mjs';
import {prepareCountModel,validateCounts,countDiagnostics,setCountTraining} from '../web/forecast-count.mjs';
const date='2026-10-23',s=emptyState();
for(let i=1;i<=48;i++){const d=addDays(date,-i);s.forecast=saveDay(s.forecast,{date:d,zone:'QA',orders:27,ordersConfirmed:true,precision:'intervals',intervals:parseWindows('09:00–14:00;17:00–21:00'),workConfirmed:true,orderEvidence:Array.from({length:27},(_,j)=>({id:d+'-'+j,deliveredMin:j<15?542+j*19:1022+(j-15)*19,confirmed:true}))});}
const before=JSON.stringify(s),zone=planDay(s.forecast,date).zone,t=performance.now(),a=prepareCountModel(s.forecast.days,date,zone);
a.validation=validateCounts(s.forecast.days,date,'local-hourly-3',zone);const preparationMs=performance.now()-t,fitRuns=countDiagnostics().fitRuns;
setCountTraining(false);const samples=[];
for(let i=0;i<40;i++){
 const overrides={[date]:{workingMin:540,slotMin:840,accountedMin:840,precision:'intervals',intervals:parseWindows(i%2?'10:00–15:00;17:00–21:00':'09:00–14:00;17:00–21:00')}};
 const start=performance.now();weekPlan(s.forecast,date,overrides);forecastFinances(s,date,overrides,date);samples.push(performance.now()-start);
}
samples.sort((a,b)=>a-b);assert.equal(countDiagnostics().fitRuns,fitRuns);assert.equal(JSON.stringify(s),before);assert.ok(samples[38]<100);
console.log(JSON.stringify({result:'PASS',environment:'Node/container; not Android',fixture:{days:48,events:1296,profiles:0},preparationMs,preparedWeekAndFinances:{repetitions:40,p50Ms:samples[19],p95Ms:samples[38],maxMs:samples[39]},inferenceFitRuns:countDiagnostics().fitRuns-fitRuns,selection:a.choice.selected,validation:a.validation.n,factsPlansSnapshotsUnchanged:true},null,2));
