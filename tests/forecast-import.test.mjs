import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkbook,parseForecastFile,importSummary,applyHistory} from '../web/forecast-import.mjs';
import {emptyForecast,importDays,saveDay,predict,parseWindows} from '../web/forecast.mjs';
import {prepareCountModel,resetCountModels} from '../web/forecast-count.mjs';
import {forecastModelLabel} from '../web/forecast-ui.mjs';
test('XLSX mapping excludes formula tails, reconstructed time, money and duplicate minute collapse',()=>{
 const grid={sheets:{'Дневные итоги':{'1':{A:'Дата',E:'Заказы'},'2':{A:'2026-10-01',E:2,F:900,G:14,O:9,Q:14},'500':{T:{formula:true}}},'Смены':{'2':{A:'2026-10-01',C:9/24,D:21/24,E:9,F:14,G:2}},'Заказы RAW':{'2':{A:'2026-10-01',C:12/24,D:1,E:100,L:11/24,M:12/24},'3':{A:'2026-10-01',C:12/24,D:2,E:100,L:11/24,M:12/24}}}};
 const result=parseWorkbook(grid);assert.equal(result.days.length,1);const d=result.days[0];assert.equal(d.orders,2);assert.equal(d.workingMin,540);assert.equal(d.workConfirmed,false);assert.equal(d.appAccountedMin,840);assert.equal(d.orderEvidence.length,2);assert.notEqual(d.orderEvidence[0].id,d.orderEvidence[1].id);assert.equal(d.reward,undefined);assert.equal(d.tips,undefined);assert.deepEqual(d.intervals,[]);
 let data=importDays(emptyForecast(),result.days);data=saveDay(data,{date:d.date,workingMin:540,precision:'total',workConfirmed:true});assert.deepEqual(importDays(data,result.days),data);
});
test('partial RAW does not claim full totals and slot boundaries never become availability',()=>{
 const r=parseWorkbook({sheets:{'Заказы RAW':{'2':{A:46300,C:.5,D:1}}}});assert.equal(r.days[0].orders,null);assert.equal(r.days[0].ordersConfirmed,false);assert.equal(r.days[0].workingMin,null);
 assert.throws(()=>parseForecastFile('{"entries":[]}'));
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
 assert.equal(p.selectedModel,'weighted-count-baseline');assert.equal(p.confidence,'low');assert.match(forecastModelLabel(p),/почасовая модель не обучена/);
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
