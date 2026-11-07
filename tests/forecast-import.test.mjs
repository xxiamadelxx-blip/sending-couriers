import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkbook,parseForecastFile,importSummary,applyHistory} from '../web/forecast-import.mjs';
import {emptyForecast,importDays,normalizeForecast,saveDay,predict,parseWindows} from '../web/forecast.mjs';
import {prepareCountModel,resetCountModels} from '../web/forecast-count.mjs';
import {forecastModelLabel} from '../web/forecast-ui.mjs';

test('reimporting a conflicting video slot is idempotent and keeps one conflict fact',()=>{
 const date='2026-10-19',slot=(slotId,orderCount,digest)=>({date,orders:orderCount,ordersConfirmed:true,completed:true,
  workConfirmed:false,workingMin:null,precision:'unknown',intervals:[],slotId,source:`video:${digest}`,sourceHash:digest});
 let data=importDays(emptyForecast(),[slot('341234567',9,'a'.repeat(64))],'video_import','2026-10-31T12:00:00Z');
 const conflicting=slot('341234567',10,'d'.repeat(64));
 data=importDays(data,[conflicting],'video_import','2026-10-31T12:03:00Z');
 const day=data.days[date];
 assert.equal(day.orders,9);
 assert.equal(day.videoSlots[0].conflicts.length,1);
 assert.equal(day.videoSlots[0].conflicts[0].orderCount,10);
 assert.equal(day.fieldSources.orders.status,'CONFLICT');
 const repeated=importDays(data,[conflicting],'video_import','2026-10-31T12:04:00Z');
 assert.equal(repeated,data);
 assert.equal(repeated.days[date].revision,day.revision);
 assert.equal(repeated.days[date].videoSlots[0].conflicts.length,1);
});

test('video facts retain Yandex order ids and same-minute rows after forecast reload',()=>{
 const source=`video:${'a'.repeat(64)}`,date='2026-10-18';
 const orderEvidence=Array.from({length:33},(_,i)=>({
  id:`video-${i+1}`,visibleMin:i<2?18*60+57:19*60+i,
  acceptedMin:i===0?18*60+40:null,deliveredMin:i===0?18*60+57:null,
  orderNumber:i===0?'123456-1234567':null,source,confirmed:i===0,
  fieldSources:{visibleMin:{status:'CONFIRMED',source},acceptedMin:{status:i===0?'CONFIRMED':'UNKNOWN',source},deliveredMin:{status:i===0?'CONFIRMED':'UNKNOWN',source}}
 }));
 const row={date,timezone:'Europe/Moscow',orders:33,ordersConfirmed:true,completed:true,
  workConfirmed:true,precision:'intervals',intervals:[{start:18*60+40,end:18*60+57,state:'WORK'}],
  orderEvidence,source,sourceHash:'a'.repeat(64)};
 const imported=importDays(emptyForecast(),[row],source,'2026-10-30T17:00:00Z');
 const reloaded=normalizeForecast(JSON.parse(JSON.stringify(imported)));
 const day=reloaded.days[date];
 assert.equal(day.orders,33);
 assert.equal(day.orderEvidence.length,33);
 assert.equal(day.orderEvidence.filter(o=>o.visibleMin===18*60+57).length,2);
 assert.equal(day.orderEvidence[0].orderNumber,'123456-1234567');
 const repeated=importDays(reloaded,[row],source,'2026-10-30T17:00:01Z');
 assert.equal(repeated.days[date].orderEvidence.length,33);
 assert.equal(repeated.imports.length,1);
});
test('video slot facts do not replace a daily total or discard its work exposure',()=>{
 const date='2026-10-13',dates=['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05',date],rows=dates.map((dayDate,i)=>({
  date:dayDate,orders:dayDate===date?26:20+i,ordersConfirmed:true,completed:true,
  workingMin:dayDate===date?481:540,workConfirmed:dayDate!==date,precision:'total',
  estimatedExposureJustified:dayDate===date,source:'sheets_import:Courier Forecast.xlsx',sourceHash:`sheet-${i}`
 }));
 const before=importDays(emptyForecast(),rows,'sheets_import:Courier Forecast.xlsx');
 const target='2026-10-31',forecastBefore=predict(before,target,{workingMin:540});
 const video={date,orders:9,ordersConfirmed:true,completed:true,workConfirmed:false,workingMin:null,
  precision:'unknown',intervals:[],slotId:'341234567',source:`video:${'a'.repeat(64)}`,sourceHash:'a'.repeat(64)};
 const imported=importDays(before,[video],'video_import','2026-10-31T12:00:00Z');
 const day=normalizeForecast(JSON.parse(JSON.stringify(imported))).days[date];
 const forecastAfter=predict(imported,target,{workingMin:540});
 assert.equal(day.orders,26,'the daily total remains authoritative over one 9-order slot');
 assert.equal(day.ordersScope,'daily');assert.equal(day.videoSlots.length,1);assert.equal(day.videoSlots[0].orderCount,9);
 assert.equal(day.workingMin,481);assert.equal(day.workConfirmed,false);assert.equal(day.estimatedExposureJustified,true);assert.deepEqual(day.sourceConflicts,[]);
 assert.equal(day.fieldSources.orders.status,'CONFIRMED');
 assert.equal(forecastAfter.central,forecastBefore.central);assert.equal(forecastAfter.comparableN,forecastBefore.comparableN);
});
test('distinct video slots sum once and repeated imports stay idempotent',()=>{
 const date='2026-10-19',slot=(slotId,orderCount,digest)=>({date,orders:orderCount,ordersConfirmed:true,completed:true,
  workConfirmed:false,workingMin:null,precision:'unknown',intervals:[],slotId,source:`video:${digest}`,sourceHash:digest});
 let data=importDays(emptyForecast(),[slot('341234567',9,'a'.repeat(64))],'video_import','2026-10-31T12:00:00Z');
 data=importDays(data,[slot('341234568',12,'b'.repeat(64))],'video_import','2026-10-31T12:01:00Z');
 data=importDays(data,[slot('341234567',9,'c'.repeat(64))],'video_import','2026-10-31T12:02:00Z');
 let day=normalizeForecast(JSON.parse(JSON.stringify(data))).days[date];
 assert.equal(day.orders,21);assert.equal(day.ordersScope,'video_slots');assert.equal(day.videoSlots.length,2);
 const changedSameSlot=importDays(data,[slot('341234567',10,'d'.repeat(64))],'video_import','2026-10-31T12:03:00Z');
 assert.equal(changedSameSlot.days[date].orders,21);assert.equal(changedSameSlot.days[date].fieldSources.orders.status,'CONFLICT');
 const daily={date,orders:26,ordersConfirmed:true,completed:true,workConfirmed:false,workingMin:480,precision:'total',
  source:'sheets_import:Courier Forecast.xlsx',sourceHash:'sheet-day'};
 const reconciled=importDays(data,[daily],'sheets_import:Courier Forecast.xlsx','2026-10-31T12:04:00Z').days[date];
 assert.equal(reconciled.orders,26);assert.equal(reconciled.ordersScope,'daily');assert.equal(reconciled.videoSlots.length,2);
 assert.deepEqual(reconciled.sourceConflicts,[]);assert.equal(reconciled.workingMin,480);
});
test('one video batch imports evening then morning slots into the same forecast date',()=>{
 const date='2026-10-31',digest='c'.repeat(64),source=`video:${digest}`;
 const slot=(slotId,orderCount,startedAt,completedAt)=>({date,orders:orderCount,slotOrderCount:orderCount,
  ordersConfirmed:true,completed:true,workConfirmed:false,workingMin:null,precision:'unknown',intervals:[],
  slotId,startedAt,completedAt,source,sourceHash:digest});
 const rows=[slot('347889490',19,'2026-10-31T17:49','2026-10-31T22:00'),
  slot('347714773',12,'2026-10-31T12:01','2026-10-31T15:00')];
 const imported=importDays(emptyForecast(),rows,'video_import','2026-10-31T20:00:00Z');
 const day=normalizeForecast(JSON.parse(JSON.stringify(imported))).days[date];
 assert.equal(day.orders,31);assert.equal(day.ordersScope,'video_slots');
 assert.deepEqual(day.videoSlots.map(slot=>slot.slotId),['347889490','347714773']);
 assert.deepEqual(day.videoSlots.map(slot=>slot.orderCount),[19,12]);
 assert.equal(day.workConfirmed,false);assert.equal(day.workingMin,null);
 assert.equal(day.videoSlots.every(slot=>slot.sourceHash===digest),true);
 assert.equal(imported.imports.at(-1).days,2);assert.equal(imported.imports.at(-1).changed,2);
});
test('reimporting daily history repairs an older video-vs-day conflict without losing reconstructed exposure',()=>{
 const date='2026-10-13',source='Courier Forecast.xlsx:Дневные итоги!15';
 const stale=normalizeForecast({...emptyForecast(),days:{[date]:{
  date,orders:26,ordersConfirmed:true,completed:true,workingMin:null,workConfirmed:false,precision:'unknown',
  estimatedExposureJustified:false,source:`video:${'a'.repeat(64)}`,sourceHash:'old-video',
  sourceConflicts:['Заказы: сохранено 26, новый источник 9. Подтвердите итог дня.'],
  fieldSources:{orders:{source,status:'CONFLICT',kind:'FACT'},workingMin:{source,status:'UNKNOWN',kind:'UNKNOWN'}}
 }}});
 const pending=parseWorkbook({'sheets':{
  'Дневные итоги':{'2':{A:date,E:26,O:8.0166666667,N:'Реконструкция по графику'}},
  'Смены':{'2':{A:date,C:9/24,D:1021/1440,E:8.0166666667,G:26,O:'Реконструкция по графику'}}
 }},'Courier Forecast.xlsx');
 const fixed=applyHistory(stale,pending,'2026-10-31T12:00:00Z').days[date];
 assert.equal(fixed.orders,26);assert.equal(fixed.fieldSources.orders.status,'CONFIRMED');assert.deepEqual(fixed.sourceConflicts,[]);
 assert.equal(fixed.workingMin,481);assert.equal(fixed.workConfirmed,false);assert.equal(fixed.estimatedExposureJustified,true);
});
test('XLSX mapping excludes formula tails, reconstructed time, money and duplicate minute collapse',()=>{
 const grid={sheets:{'Дневные итоги':{'1':{A:'Дата',E:'Заказы'},'2':{A:'2026-10-01',E:2,F:900,G:14,O:9,Q:14},'500':{T:{formula:true}}},'Смены':{'2':{A:'2026-10-01',C:9/24,D:21/24,E:9,F:14,G:2}},'Заказы RAW':{'2':{A:'2026-10-01',C:12/24,D:1,E:100,L:11/24,M:12/24},'3':{A:'2026-10-01',C:12/24,D:2,E:100,L:11/24,M:12/24}}}};
 const result=parseWorkbook(grid);assert.equal(result.days.length,1);const d=result.days[0];assert.equal(d.orders,2);assert.equal(d.workingMin,540);assert.equal(d.workConfirmed,false);assert.equal(d.appAccountedMin,840);assert.equal(d.orderEvidence.length,2);assert.notEqual(d.orderEvidence[0].id,d.orderEvidence[1].id);assert.equal(d.reward,undefined);assert.equal(d.tips,undefined);assert.deepEqual(d.intervals,[]);
 let data=importDays(emptyForecast(),result.days);data=saveDay(data,{date:d.date,workingMin:540,precision:'total',workConfirmed:true});assert.deepEqual(importDays(data,result.days),data);
});
test('partial RAW does not claim full totals and slot boundaries never become availability',()=>{
 const r=parseWorkbook({sheets:{'Заказы RAW':{'2':{A:46300,C:.5,D:1}}}});assert.equal(r.days[0].orders,null);assert.equal(r.days[0].ordersConfirmed,false);assert.equal(r.days[0].workingMin,null);
 assert.throws(()=>parseForecastFile('{"entries":[]}'));
});
test('partial history cannot unset a previously confirmed daily total',()=>{
 const date='2026-10-12',base=importDays(emptyForecast(),[{date,orders:12,ordersConfirmed:true,appAccountedMin:840,accountedConfirmed:true,source:'complete'}],'complete');
 const partial=importDays(base,[{date,orders:null,ordersConfirmed:false,appAccountedMin:null,accountedConfirmed:false,precision:'unknown',source:'partial'}],'partial');
 const day=partial.days[date];
 assert.equal(day.orders,12);assert.equal(day.ordersConfirmed,true);assert.equal(day.ordersScope,'daily');
 assert.equal(day.appAccountedMin,840);assert.equal(day.accountedConfirmed,true);
});
test('acceptance and delivery survive XLSX import while missing work keeps the hourly model untrained',()=>{
 resetCountModels();
 const rows={};for(let i=0;i<4;i++)rows[String(i+2)]={A:i<2?'2026-10-01':'2026-10-02',C:'12:00',D:i%2+1,L:i%2?'12:10':null,M:i%2?'12:40':null,K:'Высокая'};
 const pending=parseWorkbook({sheets:{'Дневные итоги':{'2':{A:'2026-10-01',E:2,O:9,N:'Реконструкция по графику'},'3':{A:'2026-10-02',E:2,O:9,N:'Реконструкция по графику'}},'Смены':{'2':{A:'2026-10-01',C:'09:00',D:'18:00',E:9,G:2,O:'Реконструкция по графику'},'3':{A:'2026-10-02',C:'09:00',D:'18:00',E:9,G:2,O:'Реконструкция по графику'}},'Заказы RAW':rows}});
 assert.deepEqual(pending.summary.time,{visible:4,accepted:2,delivered:2,paired:2});
 const f=applyHistory(emptyForecast(),pending),d=f.days['2026-10-01'];
 assert.deepEqual(d.orderEvidence.map(o=>[o.visibleMin,o.acceptedMin,o.deliveredMin]),[[720,null,null],[720,730,760]]);
 assert.deepEqual(importSummary(Object.values(f.days)).time,pending.summary.time);
 assert.equal(d.workConfirmed,false);
 const model=prepareCountModel(f.days,'2026-10-23');assert.equal(model.fits.timeKind,null);assert.equal(model.fits.bins.length,0);
 const p=predict(f,'2026-10-23',{workingMin:540,intervals:parseWindows('10:00–15:00;17:00–21:00')});
 assert.equal(p.central,null,'reconstructed hours alone cannot justify a numeric forecast');assert.equal(p.confidence,'insufficient');assert.equal(forecastModelLabel(p),'');
 const anchored=saveDay(f,{date:'2026-10-03',orders:2,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total'});
 const a=predict(anchored,'2026-10-23',{workingMin:540});assert.equal(a.central,2);assert.equal(a.estimatedExposureN,2);
});
test('confirmed note window supersedes nominal slot; mismatch cannot become confirmed hourly exposure',()=>{
 const date='2026-10-10',raw={'2':{A:date,C:'10:05',D:1,L:'10:00',M:'10:25',K:'Высокая'}};
 const make=(work,note)=>parseWorkbook({sheets:{'Смены':{'2':{A:date,C:'07:00',D:'21:00',E:work,G:1,O:note}},'Заказы RAW':raw}});
 const confirmed=applyHistory(emptyForecast(),make(5,'Подтверждено пользователем: 10:00–15:00, работал без перерыва.'));
 const d=confirmed.days[date];assert.equal(d.workingMin,300);assert.equal(d.workConfirmed,true);
 assert.deepEqual(d.intervals.map(i=>[i.start,i.end]),[[600,900]]);
 assert.equal(d.exposureBlocks[0].end-d.exposureBlocks[0].start,300);
 const mismatch=applyHistory(emptyForecast(),make(4,'Подтверждено пользователем: 10:00–15:00, работал без перерыва.'));
 const m=mismatch.days[date];assert.equal(m.workingMin,240);assert.equal(m.workConfirmed,false);
 assert.deepEqual(m.intervals,[]);assert.deepEqual(m.exposureBlocks,[]);
});
test('overlapping confirmed shift windows stay conflicted instead of shortening stated hours',()=>{
 const date='2026-10-10',pending=parseWorkbook({sheets:{'Смены':{
  '2':{A:date,C:'07:00',D:'15:00',E:5,G:1,O:'Подтверждено пользователем: 10:00–15:00'},
  '3':{A:date,C:'13:00',D:'21:00',E:5,G:1,O:'Подтверждено пользователем: 13:00–18:00'}
 },'Заказы RAW':{
  '2':{A:date,C:'11:00',D:1,L:'10:55',M:'11:15',K:'Высокая'},
  '3':{A:date,C:'17:00',D:2,L:'16:55',M:'17:15',K:'Высокая'}
 }}});
 assert.equal(pending.days[0].workingMin,600);assert.equal(pending.days[0].workConfirmed,false);
 assert.match(pending.days[0].sourceConflicts.join(' '),/пересекаются/);
 const d=applyHistory(emptyForecast(),pending).days[date];
 assert.equal(d.workingMin,600);assert.equal(d.workConfirmed,false);assert.deepEqual(d.intervals,[]);
 assert.deepEqual(d.exposureBlocks,[]);assert.equal(d.fieldSources.workingMin.status,'CONFLICT');
 assert.equal(prepareCountModel({[date]:d},'2026-10-23').fits.bins.length,0);
});
test('reimport corrects earlier imported slot-as-WORK while preserving manual time',()=>{
 const date='2026-10-10',source='History.xlsx',corrected=parseWorkbook({sheets:{'Смены':{'2':{A:date,C:'07:00',D:'21:00',E:4,G:1,O:'Подтверждено пользователем: 10:00–15:00'}}}},source);
 const previous={...corrected.days[0],workConfirmed:true,workingMin:840,precision:'intervals',intervals:parseWindows('07:00–21:00'),fieldSources:{...corrected.days[0].fieldSources,workingMin:{status:'CONFIRMED',source:'old parser'}}};
 const old=importDays(emptyForecast(),[previous],source),fixed=applyHistory(old,corrected);
 assert.equal(old.days[date].workingMin,840);assert.equal(old.days[date].workConfirmed,true);
 assert.equal(fixed.days[date].workingMin,240);assert.equal(fixed.days[date].workConfirmed,false);
 assert.deepEqual(fixed.days[date].intervals,[]);
 const manuallyFixed=saveDay(old,{date,precision:'intervals',intervals:parseWindows('10:00–15:00'),workConfirmed:true});
 const kept=applyHistory(manuallyFixed,corrected);
 assert.equal(kept.days[date].workingMin,300);assert.equal(kept.days[date].workConfirmed,true);
 assert.deepEqual(kept.days[date].intervals.map(i=>[i.start,i.end]),[[600,900]]);
});
