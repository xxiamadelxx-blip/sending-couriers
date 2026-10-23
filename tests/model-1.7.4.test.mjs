import test from 'node:test';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {emptyForecast,saveDay,parseWindows,addDays,predict,planDay,normalizeForecast} from '../web/forecast.mjs';
import {emptyState,forecastFinances} from '../web/core.mjs';import {exposureBins,countDiagnostics,resetCountModels,prepareCountModel,exportCountModels,installCountModels,setCountTraining,validCountModel} from '../web/forecast-count.mjs';
import {weatherCache,weatherParts,weatherSymbol,weatherDescription} from '../web/weather.mjs';
const date='2026-10-23';
function history(n=28){let f=emptyForecast();for(let i=1;i<=n;i++){const d=addDays(date,-i);f=saveDay(f,{date:d,orders:10,ordersConfirmed:true,workConfirmed:true,precision:'intervals',intervals:parseWindows('09:00–10:00;18:00–19:00'),orderEvidence:Array.from({length:10},(_,j)=>({id:d+'-'+j,deliveredMin:j<9?541+j*5:1085,acceptedMin:j<9?540+j*5:1080,confirmed:true}))});}return f;}
test('weather distinguishes each WMO cloud state and three time points use their own codes',()=>{
 assert.equal(new Set([0,1,2,3].map(weatherSymbol)).size,4);assert.equal(weatherDescription(2),'Переменная облачность');
 const p={weatherCity:'QA',timezone:'Europe/Moscow'},now=new Date(date+'T06:00:00Z'),raw={provider:'Open-Meteo',requestedCity:'QA',timezone:p.timezone,hourly:{time:[date+'T09:00',date+'T14:00',date+'T20:00'],temperature_2m:[5,6,7],weather_code:[0,2,61]}};
 assert.deepEqual(weatherParts(weatherCache(raw,p,now),p,now).parts.map(v=>weatherSymbol(v.code)),['☀','⛅','☂']);
});
test('one completion series: adding acceptance times does not move completed events between buckets',()=>{
 const f=history(4),d=Object.values(f.days)[0],a=exposureBins(d,'deliveredMin');const changed={...d,orderEvidence:d.orderEvidence.map(o=>({...o,acceptedMin:600}))};assert.deepEqual(exposureBins(changed,'deliveredMin'),a);
 const partial={...d,orderEvidence:d.orderEvidence.map((o,i)=>i?o:{...o,deliveredMin:null})};assert.deepEqual(exposureBins(partial,'deliveredMin'),[]);
});
test('hourly baseline predicts a stronger morning at equal exposure and refuses conflicted work',()=>{
 const f=history(),a=predict(f,date,{workingMin:60,intervals:parseWindows('09:00–10:00')}),b=predict(f,date,{workingMin:60,intervals:parseWindows('18:00–19:00')});assert.ok(a.central>b.central);assert.equal(a.timeKind,'deliveredMin');assert.equal(a.coverageTarget,.9);
 const bad={...f,days:Object.fromEntries(Object.entries(f.days).map(([key,d],i)=>[key,i<25?{...d,conflicts:['Pause intersects delivery']}:d]))};const p=predict(bad,date,{workingMin:120,intervals:parseWindows('09:00–10:00;18:00–19:00')});assert.equal(p.comparableN,3);assert.ok(!p.fit||p.fit.days===3);
});
test('prepared model reuses coefficients and survives serialization; changing plans never fits',()=>{
 resetCountModels();const f=history();prepareCountModel(f.days,date);const fitted=countDiagnostics().fitRuns;assert.ok(fitted>0);
 const s=emptyState();s.forecast=f;const begin=performance.now();for(let i=0;i<15;i++)forecastFinances(s,date,{[date]:{workingMin:60,intervals:parseWindows(i%2?'09:00–10:00':'18:00–19:00'),accountedMin:840}},date);assert.equal(countDiagnostics().fitRuns,fitted);assert.ok(performance.now()-begin<1500);
 const saved=JSON.parse(JSON.stringify(exportCountModels())),before=predict(f,date,{workingMin:60,intervals:parseWindows('09:00–10:00')});resetCountModels();installCountModels(saved);setCountTraining(false);assert.deepEqual(predict(f,date,{workingMin:60,intervals:parseWindows('09:00–10:00')}),before);assert.equal(countDiagnostics().fitRuns,0);setCountTraining(true);
});
test('saved multiple windows, rest, unknown and midnight remain plans rather than training facts',()=>{
 const before=history(),plans={[date]:{workingMin:540,slotMin:840,precision:'intervals',intervals:parseWindows('10:00–15:00;17:00–21:00')}},f=normalizeForecast({...before,plans});assert.equal(planDay(f,date).workingMin,540);assert.deepEqual(planDay(f,date).intervals.map(v=>[v.start,v.end]),[[600,900],[1020,1260]]);assert.deepEqual(f.days,before.days);assert.deepEqual(normalizeForecast(f).plans,f.plans);
 const overnight=normalizeForecast({...f,plans:{[date]:{workingMin:240,slotMin:240,precision:'intervals',intervals:parseWindows('22:00–02:00')}}});assert.equal(planDay(overnight,date).workingMin,120);assert.ok(planDay(overnight,addDays(date,1)).intervals.some(v=>v.start===0&&v.end===120));
});
test('confirmed subwindows support a coarse forecast without inventing full day orders or hours',()=>{
 let f=emptyForecast();for(let i=1;i<=4;i++){const d=addDays(date,-i);f=saveDay(f,{date:d,orders:null,ordersConfirmed:false,precision:'unknown',workConfirmed:false,exposureBlocks:[{start:540,end:780,state:'WORK',orders:8,status:'CONFIRMED',source:'explicit subwindow'}],orderEvidence:Array.from({length:8},(_,j)=>({id:d+'-'+j,deliveredMin:545+j*28,confirmed:true}))});}
 const before=JSON.stringify(f.days),p=predict(f,date,{workingMin:60,intervals:parseWindows('09:00–10:00')});assert.equal(p.central,2);assert.equal(p.confidence,'low');assert.equal(JSON.stringify(f.days),before);assert.equal(Object.values(f.days).every(d=>d.orders==null&&d.workingMin==null),true);
});

test('invalid derived model cache is discarded without changing facts, plans or morning snapshots',()=>{
 resetCountModels();const f=history(),a=JSON.parse(JSON.stringify(prepareCountModel(f.days,date)));assert.equal(validCountModel(a),true);
 for(const mutate of [a=>{a.fits.hourly=[null];},a=>{a.choice.results=[null];},a=>{a.fits.step=0;},a=>{a.fits.bins[0].exposure=-1;},a=>{a.choice.results[0].fact='bad';},a=>{a.fits.poisson.alpha='bad';}]){
  const bad=structuredClone(a);mutate(bad);assert.equal(validCountModel(bad),false);const restored=normalizeForecast({...f,trainedModel:bad});assert.equal(restored.trainedModel,null);assert.deepEqual(restored.days,f.days);assert.deepEqual(restored.plans,f.plans);assert.deepEqual(restored.snapshots,f.snapshots);
 }
});
