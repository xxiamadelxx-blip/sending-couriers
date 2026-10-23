import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyForecast,normalizeForecast,saveDay,planDay,predict,weekPlan,addDays,parseWindows,saveForecastHours} from '../web/forecast.mjs';
import {emptyState,forecastFinances} from '../web/core.mjs';
const start='2026-10-16';
function history(){let f=emptyForecast();for(let i=1;i<=28;i++)f=saveDay(f,{date:addDays(start,-i),orders:27,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total',completed:true,appAccountedMin:840,accountedConfirmed:true});return f;}
test('day plans retain nominal slot and actual working duration independently through backup',()=>{
 const before=history(),f=normalizeForecast({...before,plans:{[start]:{workingMin:540,slotMin:840},[addDays(start,1)]:{workingMin:null,slotMin:840},[addDays(start,2)]:{workingMin:0,slotMin:0}}});
 assert.equal(f.plans[start].slotMin,840);assert.equal(f.plans[start].workingMin,540);
 assert.deepEqual(normalizeForecast(f),f);assert.equal(planDay(f,start).slotMin,840);assert.equal(planDay(f,addDays(start,1)).workingMin,null);
 const precise=normalizeForecast({...f,plans:{[start]:{workingMin:547,slotMin:871}}});assert.equal(precise.plans[start].workingMin,547);assert.equal(precise.plans[start].slotMin,871);
 assert.equal(predict(f,start).central,27);assert.equal(predict(f,addDays(start,2)).central,0);
 assert.deepEqual(f.days,before.days);assert.deepEqual(f.snapshots,before.snapshots);
 assert.throws(()=>normalizeForecast({...f,plans:{[start]:{workingMin:900,slotMin:840}}}));
});
test('14-hour nominal slot predicts orders only for 9 working hours and changes payment risk separately',()=>{
 const f=history(),a={},b={},c={};for(let i=0;i<7;i++){const d=addDays(start,i);a[d]={workingMin:540,slotMin:840,accountedMin:840,intervals:[],precision:'total'};b[d]={...a[d],slotMin:540,accountedMin:540};c[d]={...a[d],workingMin:360};}
 const before=JSON.stringify(f),s=emptyState();s.forecast=f;
 assert.equal(predict(f,start,a[start]).central,27);assert.equal(predict(f,start,b[start]).central,27);assert.equal(predict(f,start,c[start]).central,18);
 const planned=weekPlan(f,start,a);assert.equal(planned.days.reduce((n,d)=>n+d.workingMin,0),63*60);
 const ra=forecastFinances(s,start,a,start).weekFinancial,rb=forecastFinances(s,start,b,start).weekFinancial,rc=forecastFinances(s,start,c,start).weekFinancial;
 assert.equal(ra.orders,189);assert.equal(ra.hours,98);assert.equal(rb.orders,189);assert.equal(rb.hours,63);assert.equal(rc.orders,126);assert.equal(rc.risk,'high');assert.equal(rb.risk,'high');assert.notEqual(ra.risk,'high');assert.equal(JSON.stringify(f),before);
});
test('simple daily duration includes an old overnight carry without inventing extra work or blocking the UI',()=>{
 const yesterday=addDays(start,-1),f=normalizeForecast({...history(),plans:{[yesterday]:{intervals:parseWindows('22:00–02:00'),precision:'intervals',workingMin:120,slotMin:240}}});
 assert.throws(()=>planDay(f,start,{[start]:{workingMin:480,slotMin:840,precision:'total',intervals:[]}}),/Ночная работа/);
 const chosen=saveForecastHours(f,start,840,480),restored=normalizeForecast(chosen);
 assert.equal(restored.plans[start].mode,'simple');
 assert.equal(planDay(restored,start).workingMin,480);
 assert.equal(planDay(restored,start).slotMin,840);
 assert.equal(planDay(restored,addDays(start,1)).workingMin,480);
 assert.equal(predict(restored,start).workingMin,480);
});
