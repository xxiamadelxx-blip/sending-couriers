import test from 'node:test';import assert from 'node:assert/strict';
import {emptyForecast,normalizeForecast,assertForecastCapacity,saveDay,parseWindows,predict,ensureForecast,evaluateForecasts,addDays,mergeForecast} from '../web/forecast.mjs';
import {parseWorkbook,applyHistory,parseForecastFile} from '../web/forecast-import.mjs';import {weatherLocation,weatherCache,weatherParts,weatherSymbol} from '../web/weather.mjs';import {fitPoisson} from '../web/forecast-count.mjs';
function source(){return {sheets:{'Смены':{'2':{A:'2026-09-11',C:'10:00',D:'15:00',E:5,F:5,G:2,M:'Test town',O:'Фактически отработан весь слот 10:00–15:00 без оффлайна.'},'3':{A:'2026-10-18',G:33,O:'Точные рабочие/учитываемые часы не подтверждены.'}},'Заказы RAW':Object.fromEntries(Array.from({length:33},(_,i)=>[String(i+2),{A:'2026-10-18',C:i<2?'18:57':`${String(10+Math.floor(i/6)).padStart(2,'0')}:${String(i%6*9).padStart(2,'0')}`,D:i+1,J:'Video',K:i%2?'Высокая':'Средняя',M:'21:57',O:'actual source'}])),'Прогнозы':{'2':{A:'2026-10-18',C:'09–15',D:19,E:10,F:28,M:20,Q:'restored',R:'old'}},'Точность':{'2':{A:'archive',B:3.5}}}};}
test('one import accepts strong sources automatically, preserves all RAW confidence and immutable archive',()=>{
 const p=parseWorkbook(source(),'source.xlsx');assert.equal(p.days[0].workConfirmed,true);assert.equal(p.days[0].workingMin,300);
 let f=applyHistory(emptyForecast(),p,'2026-10-23T03:00:00Z');const x=f.days['2026-10-18'];assert.equal(x.orders,33);assert.equal(x.orderEvidence.length,33);assert.equal(x.rawComplete,true);assert.equal(x.evidenceComplete,false);assert.equal(x.workingMin,null);assert.equal(x.appAccountedMin,null);assert.equal(x.fieldSources.workingMin.status,'UNKNOWN');assert.notEqual(x.orderEvidence[0].id,x.orderEvidence[1].id);assert.equal(x.orderEvidence[0].confidence,'Средняя');
 assert.equal(f.archive.forecasts[0].central,19);assert.equal(f.archive.forecasts[0].factAddedLater,20);assert.equal(f.archive.forecasts[0].prospective,false);assert.equal(f.snapshots.length,0);assert.deepEqual(applyHistory(f,p,'2026-10-24T03:00:00Z'),f);assert.deepEqual(normalizeForecast(f),f);
});
test('plans, ambiguous durations and contradictory sources never become confirmed exposure',()=>{
 const grid=source();grid.sheets['Смены']['2'].O='Плановый слот; фактические часы не подтверждены.';const p=parseWorkbook(grid);assert.equal(p.days[0].workConfirmed,false);assert.equal(p.days[0].fieldSources.workingMin.status,'RECONSTRUCTED');
 grid.sheets['Дневные итоги']={'2':{A:'2026-09-11',E:20,O:6,N:'Историческая реконструкция'}};const conflict=parseWorkbook(grid);assert.ok(conflict.days[0].sourceConflicts.length>0);
});
test('partial repeat import keeps manual geography, timezone, corrections and provenance',()=>{
 let f=saveDay(emptyForecast(),{date:'2026-10-01',zone:'My place',timezone:'Asia/Vladivostok',orders:27,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total'});
 const p=parseForecastFile({format:'forecast-history-1',days:[{date:'2026-10-01',orders:27,ordersConfirmed:true,workingMin:null,precision:'unknown'}]});f=applyHistory(f,p);const d=f.days['2026-10-01'];assert.equal(d.zone,'My place');assert.equal(d.timezone,'Asia/Vladivostok');assert.equal(d.workingMin,540);assert.equal(d.fieldSources.workingMin.status,'CONFIRMED');
 const restored=mergeForecast(f,normalizeForecast(f));assert.deepEqual(restored,f);
});
function hourlyHistory(move=false){let f=emptyForecast();for(let i=0;i<12;i++){
 const date=addDays('2026-09-01',i),times=move?[18*60+10,18*60+20,18*60+30,18*60+40,18*60+50,19*60+10]:[9*60+10,9*60+20,9*60+30,9*60+40,9*60+50,10*60+10];
 f=saveDay(f,{date,orders:6,ordersConfirmed:true,workingMin:240,precision:'intervals',workConfirmed:true,intervals:parseWindows('09:00–11:00;18:00–20:00'),orderEvidence:times.map((t,j)=>({id:`${date}-${j}`,acceptedMin:t,deliveredMin:t+5,confirmed:true})),evidenceComplete:true});}return f;}
test('same daily counts with shifted RAW times change hourly distribution; Poisson actually fits confirmed offset',()=>{
 const plan={workingMin:240,intervals:parseWindows('09:00–11:00;18:00–20:00')};const a=predict(hourlyHistory(false),'2026-09-14',plan),b=predict(hourlyHistory(true),'2026-09-14',plan);assert.equal(a.central,b.central);assert.ok(a.intervalForecasts[0].central>b.intervalForecasts[0].central);assert.equal(a.fit.type,'poisson-offset');assert.ok(a.fit.beta.some(x=>x!==0));assert.ok(a.fit.iterations>0);assert.equal(a.fit.offset,'log(confirmed exposure hours)');assert.equal(a.fit.days,12);
 const future=saveDay(hourlyHistory(),{date:'2026-10-18',orders:10000,ordersConfirmed:true,workingMin:10,precision:'total',workConfirmed:true});assert.deepEqual(predict(future,'2026-09-14',plan),a);
 assert.equal(fitPoisson([{date:'2026-09-01',count:10,exposure:1,confirmed:false}], '2026-09-14'),null);
});
test('first-open forecasts need no seven-day profile; nowcasts do not rewrite morning; zero-fact percentage is undefined',()=>{
 let f=hourlyHistory(),date='2026-09-14';f={...f,plans:{[date]:{workingMin:240}}};f=ensureForecast(f,new Date(date+'T03:00:00Z'));assert.equal(f.snapshots.length,1);const original=JSON.stringify(f.snapshots[0]);f=saveDay(f,{date,orders:0,ordersConfirmed:true,workingMin:0,workConfirmed:true,precision:'total',completed:true});f=ensureForecast(f,new Date(date+'T15:00:00Z'),'NOWCAST');assert.equal(f.snapshots.at(-1).central,0);assert.equal(JSON.stringify(f.snapshots[0]),original);f=evaluateForecasts(f,new Date('2026-09-15T05:00:00Z'));assert.equal(f.evaluations[0].percentageError,null);
});
test('all official WMO rain, snow, fog and thunder codes; automatic location and offline day rollover',()=>{
 for(const c of [51,53,55,56,57,61,63,65,66,67,80,81,82])assert.equal(weatherSymbol(c),'☂');for(const c of [71,73,75,77,85,86])assert.equal(weatherSymbol(c),'❄');for(const c of [95,96,99])assert.equal(weatherSymbol(c),'ϟ');for(const c of [45,48])assert.equal(weatherSymbol(c),'≋');assert.equal(weatherSymbol(0),'☀');assert.equal(weatherSymbol(4),'—');
 const f=applyHistory(emptyForecast(),parseWorkbook(source())),p=weatherLocation(f);assert.equal(p.weatherCity,'Test town');const now=new Date('2026-10-23T06:00:00Z');const cache=weatherCache({provider:'Open-Meteo',requestedCity:p.weatherCity,timezone:p.timezone,hourly:{time:['2026-10-23T09:00','2026-10-23T14:00','2026-10-23T20:00'],temperature_2m:[5,6,3],weather_code:[0,3,85]}},p,now);const stale=weatherParts(cache,p,new Date('2026-10-24T06:00:00Z'));assert.equal(stale.stale,true);assert.equal(stale.parts[0].temp,5);assert.equal(stale.sourceDate,'2026-10-23');assert.equal(weatherParts(null,p,now).available,false);
});
test('archive capacity rejects before saving and renamed workbooks do not duplicate forecast records',()=>{
 const one=parseWorkbook(source(),'history.xlsx'),two=parseWorkbook(source(),'history (1).xlsx'),a=applyHistory(emptyForecast(),one);const b=applyHistory(a,two);assert.equal(b.archive.forecasts.length,1);
 assert.throws(()=>applyHistory(a,{days:[],source:'large',archive:{forecasts:Array.from({length:5001},(_,i)=>({id:'a'+i,central:1}))}}));
 assert.throws(()=>applyHistory(a,{days:[],source:'malformed',archive:{forecasts:[{id:'x',central:'<b>hi</b>'}]}}));assert.equal(a.archive.forecasts.length,1);
});
test('sub-window evidence changes model provenance; known facts before a first issue exclude prospective evaluation',()=>{
 const f=hourlyHistory(),date='2026-09-14',plan={workingMin:240,intervals:parseWindows('09:00–11:00;18:00–20:00')};const before=predict(f,date,plan);
 const changed=saveDay(f,{date:'2026-08-30',orders:12,ordersConfirmed:true,precision:'unknown',exposureBlocks:[{start:540,end:660,state:'WORK',orders:12,status:'CONFIRMED',source:'explicit report'}],orderEvidence:Array.from({length:12},(_,i)=>({id:'extra-'+i,acceptedMin:541+i*5,deliveredMin:545+i*5,confirmed:true}))});assert.notEqual(predict(changed,date,plan).sourceHash,before.sourceHash);
 let d={...f,typicalPlan:{intervals:parseWindows('09:00–11:00'),timezone:'Europe/Moscow',zone:'',source:'test'}};d=saveDay(d,{date,orders:5,ordersConfirmed:true,completed:false,asOfMinute:420});d=ensureForecast(d,new Date(date+'T04:30:00Z'));assert.equal(d.snapshots[0].partialDayIssue,true);d=saveDay(d,{date,completed:true});d=evaluateForecasts(d,new Date('2026-09-15T05:00:00Z'));assert.equal(d.evaluations[0].prospective,false);
});
test('validation compares the same integer central predictions for baseline and selected baseline',async()=>{
 const {backtest}=await import('../web/forecast.mjs');const q=backtest(hourlyHistory(),'2026-09-14');assert.ok(q.n>0);for(const r of q.results)if(r.model==='weighted-count-baseline')assert.equal(r.predicted,r.baseline);
});
test('weekly slot/active settings round-trip and do not change training facts or money',()=>{
 const base=hourlyHistory(),facts=JSON.stringify(base.days),morning=JSON.stringify(base.snapshots),p=predict(base,'2026-09-14',{workingMin:240});const changed=normalizeForecast({...base,weekConfig:{workingMin:390,slotMin:840}});assert.equal(changed.weekConfig.workingMin,390);assert.equal(changed.weekConfig.slotMin,840);assert.equal(JSON.stringify(changed.days),facts);assert.equal(JSON.stringify(changed.snapshots),morning);assert.deepEqual(predict(changed,'2026-09-14',{workingMin:240}),p);assert.deepEqual(mergeForecast(changed,base).weekConfig,changed.weekConfig);assert.throws(()=>normalizeForecast({...base,weekConfig:{workingMin:900,slotMin:540}}));assert.throws(()=>assertForecastCapacity({...base,weekConfig:{workingMin:900,slotMin:540}}));
});
