import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyForecast,saveProfile,planDay,parseWindows,saveDay,saveTimeline,importDays,normalizeForecast,predict,backtest,ensureForecast,evaluateForecasts,weekPlan,saveScenario,localClock,addDays,syncSlots,forecastClock,mergeForecast,videoImportReceipt,restoreVideoOrderEvidence} from '../web/forecast.mjs';
import {emptyState,normalizeState,mergeImport,upsertEntry,calculate,forecastFinances,setPaymentTerms} from '../web/core.mjs';
const profile=(data=emptyForecast(),patch={})=>saveProfile(data,{effectiveFrom:'2026-01-01',timezone:'Europe/Moscow',zone:'Test',outsidePayment:'UNKNOWN',week:Array.from({length:7},()=>({intervals:parseWindows('09:00–14:00;17:00–21:00'),accountedMin:840})),...patch},'2026-01-01T00:00:00Z');
const confirmed=(date,orders=27)=>({date,orders,ordersConfirmed:true,precision:'intervals',intervals:[...parseWindows('09:00–14:00;17:00–21:00'),...parseWindows('07:00–09:00;14:00–17:00','UNAVAILABLE')],workConfirmed:true,appAccountedMin:840,accountedConfirmed:true});
function history(n=30) { let d=profile();for(let i=0;i<n;i++)d=saveDay(d,confirmed(addDays('2026-09-01',i),27+i%3));return d; }
test('schema 1–6 migration retains money, slots, unknowns, forecast backup and old merge',()=>{
 let s=emptyState();s=upsertEntry(s,{date:'2026-10-01',dailyHours:14,dailyOrders:27,reward:2400,tips:80});s.forecast=history(5);
 const before=calculate(s,'2026-09-18');const reloaded=normalizeState(JSON.parse(JSON.stringify(s)));
 assert.equal(reloaded.schemaVersion,6);assert.deepEqual(reloaded.forecast,s.forecast);assert.deepEqual(calculate(reloaded,'2026-09-18'),before);
 const merged=mergeImport(reloaded,{schemaVersion:5,entries:[],settings:{},closures:{}});assert.deepEqual(merged.forecast,s.forecast);
 for(const v of [1,2,3,4,5,6])assert.equal(normalizeState({schemaVersion:v,entries:[]}).schemaVersion,6);
 assert.throws(()=>normalizeState({...s,schemaVersion:7}));assert.throws(()=>normalizeForecast({...s.forecast,version:2}));
});
test('14-hour report / 9-hour work: pauses excluded from demand, financial axis unchanged',()=>{
 const data=saveDay(profile(),confirmed('2026-10-01'));const d=data.days['2026-10-01'];
 assert.equal(d.workingMin,540);assert.equal(d.unavailableMin,300);assert.equal(d.orders/(d.workingMin/60),3);assert.equal(d.orders/(d.appAccountedMin/60),27/14);
 assert.equal(d.availableNoOrderMin,null);assert.equal(d.countedNonWorkingMin,0);
 const unknown=saveDay(data,{date:d.date,appAccountedMin:null,accountedConfirmed:false}).days[d.date];assert.equal(unknown.appAccountedMin,null);
});
test('ready with no orders is WORK; offline switch does not remove ongoing delivery; pause conflict retained',()=>{
 let data=saveDay(profile(),{date:'2026-10-01',orders:0,ordersConfirmed:true,precision:'intervals',intervals:parseWindows('09:00–18:00'),workConfirmed:true,evidenceComplete:true});
 assert.equal(data.days['2026-10-01'].workingMin,540);assert.equal(data.days['2026-10-01'].unavailableMin,0);assert.equal(data.days['2026-10-01'].availableNoOrderMin,540);
 data=saveDay(data,{...confirmed('2026-10-02'),orderEvidence:[{id:'order',acceptedMin:13*60+50,deliveredMin:14*60+20,confirmed:true}],orders:1});
 assert.equal(data.days['2026-10-02'].orderEvidence.length,1);assert.equal(data.days['2026-10-02'].onOrderMin,30);assert.ok(data.days['2026-10-02'].conflicts.length);
 assert.equal(predict(data,'2026-10-03').comparableN,1);
});
test('total-only work never invents time bins; unknown and reconstruction never train',()=>{
 let data=profile();data=saveDay(data,{date:'2026-10-01',orders:27,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total'});
 assert.deepEqual(data.days['2026-10-01'].intervals,[]);assert.equal(predict(data,'2026-10-02').central,27);
 const changed=importDays(data,[{date:'2026-09-30',orders:1000,ordersConfirmed:true,workingMin:540,precision:'total',workConfirmed:false,source:'reconstruction'}]);assert.equal(predict(changed,'2026-10-02').central,27);
});
test('repeated imports preserve manual correction, show source disagreement and keep complete facts',()=>{
 const row={...confirmed('2026-10-01'),workConfirmed:false,intervals:[]};let data=importDays(profile(),[row],'test');data=saveDay(data,confirmed('2026-10-01'));
 const once=importDays(data,[row],'test');assert.deepEqual(once,data);
 const conflict=importDays(data,[{...row,orders:30}],'new-source');assert.equal(conflict.days[row.date].orders,27);assert.equal(conflict.days[row.date].workingMin,540);assert.ok(conflict.days[row.date].conflicts.length);
 const partial=importDays(data,[{date:row.date,orders:null,precision:'unknown'}],'partial');assert.equal(partial.days[row.date].orders,27);assert.equal(partial.days[row.date].appAccountedMin,840);
});
test('overlapping same-state intervals form a union; opposite states reject; overnight splits local days',()=>{
 let data=saveTimeline(profile(),{date:'2026-10-01',orders:0,ordersConfirmed:true,precision:'intervals',intervals:parseWindows('22:00–02:00'),workConfirmed:true});
 assert.equal(data.days['2026-10-01'].workingMin,120);assert.equal(data.days['2026-10-02'].workingMin,120);
 data=saveDay(data,{date:'2026-10-03',precision:'intervals',workConfirmed:true,intervals:parseWindows('09:00–12:00;11:00–15:00')});assert.equal(data.days['2026-10-03'].workingMin,360);
 assert.throws(()=>saveDay(data,{date:'2026-10-04',precision:'intervals',intervals:[...parseWindows('09:00–15:00'),...parseWindows('12:00–13:00','UNAVAILABLE')]}));
});
test('profile changes are versioned, future-only, with zero mandatory lunch and distinct payment time',()=>{
 let data=profile();const old=planDay(data,'2026-10-01');data=saveProfile(data,{...data.profiles[0],effectiveFrom:'2026-10-02',outsidePayment:'NO',week:Array.from({length:7},()=>({intervals:parseWindows('10:00–19:00')}))});
 assert.deepEqual(planDay(data,'2026-10-01'),old);assert.equal(planDay(data,'2026-10-02').workingMin,540);assert.equal(planDay(data,'2026-10-02').accountedMin,540);
 const fresh=emptyForecast();assert.equal(planDay(fresh,'2026-10-01').workingMin,null);
});
test('immutable daily snapshot, no future leakage, separate nowcast and evaluation revisions',()=>{
 let data=history();const now=new Date('2026-10-01T03:00:00Z');data=ensureForecast(data,now);const morning=JSON.stringify(data.snapshots[0]);
 assert.equal(data.snapshots[0].trainingCutoff,'2026-09-30');
 data=saveDay(data,{...confirmed('2026-10-01',300),completed:false,asOfMinute:1020});data=ensureForecast(data,new Date('2026-10-01T14:00:00Z'));assert.equal(data.snapshots.length,1);assert.equal(JSON.stringify(data.snapshots[0]),morning);
 data=ensureForecast(data,new Date('2026-10-01T14:00:00Z'),'NOWCAST');assert.equal(data.snapshots.length,2);assert.equal(data.snapshots[1].remainingMin,240);assert.equal(data.snapshots[1].factAtIssue,300);
 data=evaluateForecasts(data,new Date('2026-10-02T04:00:00Z'));assert.equal(data.evaluations.length,0,'unfinished day cannot evaluate a whole-day forecast');
 data=saveDay(data,{date:'2026-10-01',completed:true});data=evaluateForecasts(data,new Date('2026-10-02T04:00:00Z'));assert.equal(data.evaluations.length,1);data=saveDay(data,confirmed('2026-10-01',0));data=evaluateForecasts(data,new Date('2026-10-02T04:00:00Z'));assert.equal(data.evaluations.length,2);assert.equal(data.evaluations.at(-1).percentageError,null);assert.equal(JSON.stringify(data.snapshots[0]),morning);
 const withoutFuture=predict(data,'2026-10-01');data=saveDay(data,confirmed('2026-10-10',10000));assert.deepEqual(predict(data,'2026-10-01'),withoutFuture);
});
test('walk-forward has no in-sample error and reports baseline, sample size and calibration honestly',()=>{
 const data=history(),quality=backtest(data,'2026-10-01');assert.ok(quality.n>10);for(const k of ['mae','bias','wape','smape','coverage','baselineMAE'])assert.ok(Number.isFinite(quality[k]));
 assert.equal(backtest(profile(),'2026-10-01').n,0);assert.equal(predict(profile(),'2026-10-01').central,null);
});
test('week scenarios never train or change facts, rest is explicit zero, saved scenario stays separate',()=>{
 let data=history();const old=JSON.stringify(data.days),base=weekPlan(data,'2026-10-01'),overrides={'2026-10-01':{workingMin:0,accountedMin:240}};
 const edited=weekPlan(data,'2026-10-01',overrides);assert.equal(edited.days[0].forecast.central,0);assert.equal(edited.days[0].accountedMin,240);assert.ok(edited.central<base.central);
 data=saveScenario(data,'Test','2026-10-01',overrides);assert.equal(JSON.stringify(data.days),old);assert.equal(data.scenarios.length,1);assert.deepEqual(predict(data,'2026-10-01'),predict({...data,scenarios:[]},'2026-10-01'));
});
test('manual slot totals are recognized automatically; same-date slots are not double-counted in forecast finances',()=>{
 let s=upsertEntry(emptyState(),{date:'2026-10-01',dailyHours:14,dailyOrders:27,reward:0});s.forecast=syncSlots(profile(),s.entries);assert.equal(s.forecast.days['2026-10-01'].workConfirmed,false);assert.equal(s.forecast.days['2026-10-01'].ordersConfirmed,true);
 s.forecast=saveDay(s.forecast,confirmed('2026-10-01'));const f=forecastFinances(s,'2026-10-01',{},'2026-10-02');assert.equal(f.weekFinancial.rows[0].orders,27);assert.equal(f.weekFinancial.rows[0].accountedMin,840);
});
test('profile timezone is independent of VPN/device; minimum hours and critical pace version with existing terms',()=>{
 assert.equal(localClock('Asia/Vladivostok',new Date('2026-10-01T16:00:00Z')).date,'2026-10-02');
 let s=setPaymentTerms(emptyState(),{effectivePeriodStart:'2026-10-02',hourlyRate:400,basePace:1.85,premiumPace:2.8,paceBonusPercent:5,cycleBonusPercent:5,minimumHours:90,criticalPace:1.8});
 s=upsertEntry(s,{date:'2026-10-03',dailyHours:80,dailyOrders:148,reward:0});const c=calculate(s,'2026-10-02').paymentConditions;assert.equal(c.minimumHours,90);assert.equal(c.missingHours,10);assert.equal(c.paceMet,true);assert.equal(c.status,'risk');
});
test('a future timezone profile cannot shift the current date or snapshot',()=>{
 let data=profile();data=saveProfile(data,{...data.profiles[0],effectiveFrom:'2026-11-01',timezone:'Asia/Vladivostok'});
 const now=new Date('2026-10-01T19:30:00Z');assert.equal(forecastClock(data,now).date,'2026-10-01');data=saveDay(data,{...confirmed('2026-09-30'),zone:'Test'});data=ensureForecast(data,now);assert.equal(data.snapshots[0].date,'2026-10-01');assert.equal(data.snapshots[0].atMinute,1350);
});
test('a higher imported revision cannot replace manual time or a confirmed payment denominator',()=>{
 const data=saveDay(profile(),confirmed('2026-10-01'));
 let incoming=saveDay(profile(),{...confirmed('2026-10-01'),workingMin:300,precision:'total',intervals:[],appAccountedMin:540});incoming.days['2026-10-01'].revision=99;incoming.days['2026-10-01'].manualTime=false;
 const merged=mergeForecast(data,incoming);assert.equal(merged.days['2026-10-01'].workingMin,540);assert.equal(merged.days['2026-10-01'].appAccountedMin,840);assert.ok(merged.days['2026-10-01'].conflicts.length);
 const imported=importDays(data,[{...confirmed('2026-10-01'),appAccountedMin:540}]);assert.equal(imported.days['2026-10-01'].appAccountedMin,840);assert.ok(imported.days['2026-10-01'].conflicts.length);
});
test('forecast state merge unions video slots once and gives a daily total authority',()=>{
 const date='2026-10-13',slot=(slotId,orders,hash)=>({date,orders,ordersConfirmed:true,ordersScope:'video_slots',completed:true,workConfirmed:false,workingMin:null,precision:'unknown',slotId,source:`video:${hash}`,sourceHash:hash});
 const first=importDays(emptyForecast(),[slot('341234567',9,'a'.repeat(64))],'video_import','2026-10-31T12:00:00Z');
 const second=importDays(importDays(emptyForecast(),[slot('341234567',9,'a'.repeat(64))],'video_import','2026-10-31T12:00:00Z'),[slot('341234568',12,'b'.repeat(64))],'video_import','2026-10-31T12:01:00Z');
 const merged=mergeForecast(first,second),day=merged.days[date];
 assert.equal(day.orders,21);assert.equal(day.ordersScope,'video_slots');assert.equal(day.videoSlots.length,2);assert.deepEqual(day.sourceConflicts,[]);
 const daily=importDays(emptyForecast(),[{date,orders:26,ordersConfirmed:true,completed:true,workConfirmed:false,workingMin:481,precision:'total',estimatedExposureJustified:true,source:'sheets_import:history'}],'sheets_import:history');
 const reconciled=mergeForecast(merged,daily).days[date];
 assert.equal(reconciled.orders,26);assert.equal(reconciled.ordersScope,'daily');assert.equal(reconciled.videoSlots.length,2);assert.equal(reconciled.workingMin,481);assert.deepEqual(reconciled.sourceConflicts,[]);
});
test('today financial projection keeps the confirmed fact and predicts only the remaining plan',()=>{
 let s=emptyState();s.forecast=history();s.forecast=saveDay(s.forecast,{...confirmed('2026-10-01',100),completed:false,asOfMinute:17*60});
 let r=forecastFinances(s,'2026-10-01',{},'2026-10-01').weekFinancial.rows[0];assert.ok(r.orders>100&&r.orders<127);assert.equal(r.source,'fact+remaining');
 s.forecast=saveDay(s.forecast,{date:'2026-10-01',completed:true});r=forecastFinances(s,'2026-10-01',{},'2026-10-01').weekFinancial.rows[0];assert.equal(r.orders,100);assert.equal(r.source,'fact');
});
test('interval scenarios union overlaps and split midnight without shifting payment assumptions',()=>{
 const data=history(),start='2026-10-01';let week=weekPlan(data,start,{[start]:{workingMin:420,accountedMin:840,intervals:parseWindows('09:00–12:00;11:00–15:00')}});
 assert.equal(week.days[0].workingMin,360);
 week=weekPlan(data,start,{[start]:{workingMin:240,accountedMin:840,intervals:parseWindows('22:00–02:00')}});
 assert.equal(week.days[0].workingMin,120);assert.equal(week.days[1].workingMin,660);assert.equal(week.days[0].accountedMin,840);
});
test('first import can retain explicit source conflicts, and unfinished past totals remain incomplete',()=>{
 const imported=importDays(profile(),[{...confirmed('2026-10-01'),sourceConflicts:['Two sheets disagree']}]);assert.equal(imported.days['2026-10-01'].conflicts.length,1);
 let s=emptyState();s.forecast=saveDay(profile(),{...confirmed('2026-10-01',1),completed:false,asOfMinute:600});const rows=forecastFinances(s,'2026-10-01',{},'2026-10-02').weekFinancial.rows;assert.equal(rows[0].orders,null);
});
test('zero-count work retains uncertainty, and explicit historical zone supports later forecasts',()=>{
 let d=saveProfile(emptyForecast(),{effectiveFrom:'2026-10-02',zone:'My zone',week:Array.from({length:7},()=>({intervals:parseWindows('09:00–18:00'),accountedMin:540}))});
 d=saveDay(d,{date:'2026-10-01',zone:'My zone',timezone:'Europe/Moscow',orders:0,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total'});
 const p=predict(d,'2026-10-02');assert.equal(p.central,0);assert.ok(p.upper>0);assert.equal(p.comparableN,1);
 const unknown=importDays({...d,days:{}},[{date:'2026-10-01',orders:27,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total'}]);assert.equal(predict(unknown,'2026-10-02').central,null,'unknown zone is not mixed with selected district');
});
test('default-equivalent old payment rules can restore after new optional rule fields were saved',()=>{
 const rule={effectivePeriodStart:'2026-10-02',hourlyRate:400,basePace:1.85,premiumPace:2.8,paceBonusPercent:5,cycleBonusPercent:5};
 const s=setPaymentTerms(emptyState(),{...rule,minimumHours:80,criticalPace:1.85});assert.deepEqual(mergeImport(s,{schemaVersion:5,entries:[],settings:{paymentRules:[rule]}}).settings.paymentRules,s.settings.paymentRules);
});
test('invalid forecast record fields reject before state replacement',()=>{
 const data=history();assert.throws(()=>saveDay(data,{date:'2026-10-01',orders:true}));assert.throws(()=>normalizeForecast({...data,evaluations:[{id:'bad',forecastId:'x',factDate:'2026-10-01',factRevision:1,evaluatedAt:'2026-10-02T00:00:00Z',fact:'<img src=x>',signedError:0,absoluteError:0}]}));
});
test('video receipt survives persisted state reload and distinguishes rows from the slot total',()=>{
 const date='2026-11-01',hash='a'.repeat(64),source=`video:${hash}`;
 const imported={date,slotId:'341234567',source,sourceHash:hash,orders:28,slotOrderCount:28,
  ordersConfirmed:true,completed:true,workConfirmed:false,workingMin:null,precision:'unknown',
  orderEvidence:Array.from({length:28},(_,i)=>({id:`video-row-${i}`,visibleMin:480+i,
   source,confidence:'LIST_ROW_CROSSCHECKED',confirmed:false}))};
 const first=importDays(emptyForecast(),[imported],source,'2026-11-01T20:00:00Z');
 const saved=normalizeForecast(JSON.parse(JSON.stringify(first)));
 assert.deepEqual(videoImportReceipt(saved,hash,imported.slotId),{
  date,slotId:imported.slotId,sourceHash:hash,orders:28,rows:28,paired:0,
  dayOrders:28,workConfirmed:false,conflict:false});
 assert.equal(videoImportReceipt(saved,'b'.repeat(64),imported.slotId),null);
 assert.deepEqual(importDays(saved,[imported],source,'2026-11-01T20:01:00Z'),saved);
 assert.equal(predict(saved,'2026-11-02').comparableN,0,'unknown work must not train the hourly model');
});
test('an existing daily total no longer discards video rows, and old 0/28 state repairs from native facts',()=>{
 const date='2026-11-01',hash='b'.repeat(64),source=`video:${hash}`;
 const base=importDays(emptyForecast(),[{date,orders:28,ordersConfirmed:true,source:'manual'}],'manual');
 const slot={date,slotId:'348093482',source,sourceHash:hash,orders:28,ordersConfirmed:true,
  startedAt:'2026-11-01T09:58',completedAt:'2026-11-01T22:00'};
 const rows=Array.from({length:28},(_,i)=>({id:`m5-${i}`,date,visibleMin:720+i*20,source,
  acceptedMin:i<18?710+i*20:null,deliveredMin:i<18?720+i*20:null,confirmed:i<18}));
 const direct=importDays(base,[{...slot,orderEvidence:rows}],source);
 assert.equal(videoImportReceipt(direct,hash,slot.slotId).rows,28);
 assert.equal(videoImportReceipt(direct,hash,slot.slotId).paired,18);
 const broken=importDays(base,[slot],source);
 assert.equal(videoImportReceipt(broken,hash,slot.slotId).rows,0);
 const repaired=restoreVideoOrderEvidence(broken,hash,rows);
 const saved=normalizeForecast(JSON.parse(JSON.stringify(repaired)));
 assert.equal(videoImportReceipt(saved,hash,slot.slotId).rows,28);
 assert.equal(videoImportReceipt(saved,hash,slot.slotId).paired,18);
 assert.equal(saved.days[date].orders,28);
 assert.deepEqual(restoreVideoOrderEvidence(saved,hash,rows).days,saved.days);
 assert.equal(predict(saved,'2026-11-02').comparableN,0);
});
test('two video slots retain their separate rows under one confirmed daily count',()=>{
 const date='2026-11-01',first='a'.repeat(64),second='b'.repeat(64);
 let data=importDays(emptyForecast(),[{date,orders:2,ordersConfirmed:true,source:'manual'}]);
 for(const [index,hash] of [first,second].entries()) {
  const source=`video:${hash}`;
  data=importDays(data,[{date,slotId:`slot-${index}`,sourceHash:hash,source,orders:1,
   ordersConfirmed:true,orderEvidence:[{id:`order-${index}`,source,visibleMin:600+index*30}]}],source);
 }
 assert.equal(data.days[date].orders,2);
 assert.equal(data.days[date].orderEvidence.length,2);
 assert.equal(videoImportReceipt(data,second,'slot-1').rows,1);
});
test('window forecasts exclude pauses, preserve total counts and remain absent for total-only time',()=>{
 const d=history(),p=predict(d,'2026-10-01');assert.equal(p.intervalForecasts.length,2);assert.equal(p.intervalForecasts.reduce((n,w)=>n+w.central,0),p.central);assert.deepEqual(p.intervalForecasts.map(w=>[w.start,w.end]),[[540,840],[1020,1260]]);assert.deepEqual(predict(d,'2026-10-01',{workingMin:540}).intervalForecasts,[]);
});
test('imported interval forecasts reject malformed lists, booleans and reversed bands before replacement',()=>{
 const d=ensureForecast(history(),new Date('2026-10-01T03:00:00Z'));
 for(const intervals of [{length:1},[{start:true,end:840,central:10,lower:5,upper:15}],[{start:840,end:540,central:10,lower:5,upper:15}],[{start:540,end:840,central:10,lower:15,upper:5}]]) {
   assert.throws(()=>normalizeForecast({...d,snapshots:[{...d.snapshots[0],intervalForecasts:intervals}]}));
 }
 assert.deepEqual(normalizeForecast(d).snapshots[0].intervalForecasts,d.snapshots[0].intervalForecasts);
});
