// Local forecasting. No financial formulas, network calls or owner-specific history.
import {countForecast,validateCounts,validCountModel} from './forecast-count.mjs';
export const FORECAST_VERSION = 'local-hourly-3';
export const EXPOSURE_VERSION = 'ready-or-delivering-1';
const DAY = 86400000;
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const number = (value, max = 1000000) => value == null || typeof value==='string'&&!value.trim() ? null : ['string','number'].includes(typeof value)&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=max ? Number(value) : fail('Проверьте числовые данные прогноза.');
const integer = (value, max = 1000000) => { const n = number(value,max); return n == null || Number.isInteger(n) ? n : fail('Нужно целое число.'); };
const knownZones=new Set();
function validZone(timezone){if(!knownZones.has(timezone)){try{localClock(timezone);}catch{fail('Проверьте часовой пояс факта.');}knownZones.add(timezone);}return timezone;}
export function dayStamp(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Выберите дату.');
  const n = Date.parse(date+'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== date || date < '1900-01-01' || date > '2200-12-31') fail('Проверьте дату.');
  return n;
}
export const addDays = (date, n) => new Date(dayStamp(date)+n*DAY).toISOString().slice(0,10);
export const weekday = date => (new Date(dayStamp(date)).getUTCDay()+6)%7;
export function localClock(timezone = 'Europe/Moscow', now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
}
// A deterministic identity hash, not a cryptographic signature.
export function fingerprint(value) { const s = JSON.stringify(value); let h = 2166136261; for (let i=0;i<s.length;i++) h = Math.imul(h^s.charCodeAt(i),16777619); return (h>>>0).toString(16).padStart(8,'0'); }
export const minuteLabel = m => m === 1440 ? '24:00' : `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function parseMinute(text) {
  if (!/^\d{1,2}:\d{2}$/.test(String(text))) fail('Время вводится как 09:30.');
  const [h,m] = text.split(':').map(Number);
  if (h>24 || m>59 || h===24 && m!==0) fail('Проверьте время.');
  return h*60+m;
}
export function parseWindows(text, state = 'WORK') {
  if (!String(text??'').trim()) return [];
  return String(text).split(/[;,\n]+/).filter(s=>s.trim()).map(s=>{
    const parts = s.trim().split(/\s*[—–-]\s*/); if(parts.length!==2) fail('Интервалы: 09:00–14:00; 17:00–21:00.');
    const start = parseMinute(parts[0]), rawEnd = parseMinute(parts[1]);
    if(start===1440 || start===rawEnd) fail('Начало и конец интервала должны различаться.');
    return {start,end:rawEnd<start ? rawEnd+1440 : rawEnd,state,paymentCounted:'UNKNOWN'};
  });
}
export const windowsText = intervals => (intervals??[]).map(i=>`${minuteLabel(i.start)}–${minuteLabel(i.end>1440?i.end-1440:i.end)}`).join('; ');
function intervals(input = [], overnight = false) {
  if (!Array.isArray(input) || input.length>100) fail('Слишком много интервалов.');
  return input.map(i=>{
    const start = integer(i.start,1439),end=integer(i.end,overnight?2880:1440);
    if(start==null || end==null || end<=start || end-start>1440 || !['WORK','UNAVAILABLE','UNKNOWN'].includes(i.state)) fail('Проверьте интервалы работы.');
    const paymentCounted = i.paymentCounted??'UNKNOWN';
    if(!['YES','NO','UNKNOWN'].includes(paymentCounted)) fail('Проверьте учёт часов.');
    return {start,end,state:i.state,paymentCounted,reason:String(i.reason??'OTHER').slice(0,40)};
  }).sort((a,b)=>a.start-b.start);
}
function union(ranges) { const out=[]; for(const [s,e] of ranges.slice().sort((a,b)=>a[0]-b[0])) { if(out.length && s<=out.at(-1)[1]) out.at(-1)[1]=Math.max(e,out.at(-1)[1]); else out.push([s,e]); } return out; }
const duration = ranges => union(ranges).reduce((n,[a,b])=>n+b-a,0);
export const workingMinutes = list => duration(intervals(list,true).filter(i=>i.state==='WORK').map(i=>[i.start,i.end]));
const overlap = (a,b) => Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0]));
function profile(input) {
  dayStamp(input.effectiveFrom);
  const timezone = String(input.timezone??'Europe/Moscow');
  try { localClock(timezone); } catch { fail('Проверьте часовой пояс, например Europe/Moscow.'); }
  if(!Array.isArray(input.week) || input.week.length!==7) fail('Нужен график на 7 дней.');
  const week = input.week.map(d=>{
    const list = intervals(d.intervals??[],true);
    // Breaks must be carved out, never double-counted as work.
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) if(overlap([list[i].start,list[i].end],[list[j].start,list[j].end]) && list[i].state!==list[j].state) fail('Работа и личный перерыв пересекаются. Разделите рабочие окна.');
    return {intervals:list,accountedMin:number(d.accountedMin,1440)};
  });
  const outsidePayment = input.outsidePayment??'UNKNOWN';
  if(!['YES','NO','UNKNOWN'].includes(outsidePayment)) fail('Проверьте учёт личных пауз.');
  return {id:String(input.id??'local'),version:integer(input.version,100000)??1,effectiveFrom:input.effectiveFrom,createdAt:String(input.createdAt??new Date().toISOString()),zone:String(input.zone??'').slice(0,120),timezone,outsidePayment,week,weatherEnabled:input.weatherEnabled===true,weatherCity:String(input.weatherCity??'').slice(0,120)};
}
export function emptyForecast() { return {version:1,profiles:[],days:{},snapshots:[],evaluations:[],models:[],scenarios:[],imports:[],weather:null,location:null,typicalPlan:null,archive:{forecasts:[],accuracy:[],models:[],financialRules:[]},plans:{},weekConfig:null,trainedModel:null}; }
function weekConfiguration(input){
  if(input==null)return null;
  const c={workingMin:number(input.workingMin,1440),slotMin:number(input.slotMin,1440)};
  if(input.mode==='simple')c.mode='simple';
  if(Object.hasOwn(input,'intervals')){c.intervals=intervals(input.intervals,true).filter(i=>i.state==='WORK');c.precision=input.precision??(c.intervals.length?'intervals':'total');if(c.precision==='intervals')c.workingMin=workingMinutes(c.intervals);}
  if(c.slotMin!=null&&c.workingMin>c.slotMin)fail('Рабочее время не может превышать номинальный слот.');
  return c;
}
export function assertForecastCapacity(data) {
  weekConfiguration(data.weekConfig);
  for(const p of Object.values(data.plans??{}))weekConfiguration(p);
  if(data.profiles.length>500||Object.keys(data.days).length>5000||data.snapshots.length>10000||data.evaluations.length>20000||data.scenarios.length>1000||data.models.length>1000||data.imports.length>1000||Object.keys(data.plans??{}).length>5000||Object.values(data.archive??{}).some(v=>!Array.isArray(v)||v.length>5000)) fail('Достигнут предел локальной истории прогноза. Сохраните JSON-копию. Запись отменена, прежние данные сохранены.');
}
export function profileFor(data,date) { return data.profiles.filter(p=>p.effectiveFrom<=date).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||a.version-b.version).at(-1)??null; }
export function currentProfile(data,now=new Date()) {
  const sorted=data.profiles.slice().sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||a.version-b.version);
  let active=null;
  for(const p of sorted) if(p.effectiveFrom<=localClock(active?.timezone??p.timezone,now).date) active=p;
  return active;
}
export const forecastClock=(data,now=new Date())=>localClock(currentProfile(data,now)?.timezone??data.location?.timezone??data.typicalPlan?.timezone??'Europe/Moscow',now);
export function saveProfile(data,input,now=new Date().toISOString()) {
  const p = profile({...input,version:Math.max(0,...data.profiles.map(p=>p.version))+1,createdAt:now});
  return {...data,profiles:[...data.profiles,p]};
}
export function planDay(data,date,overrides={}) {
  const p=profileFor(data,date),own=overrides[date]??data.plans?.[date],previous=overrides[addDays(date,-1)]??data.plans?.[addDays(date,-1)];
  let base;
  if(!p)base=inferredPlan(data,date);
  else {const current=p.week[weekday(date)],prev=p.week[(weekday(date)+6)%7],list=[...current.intervals.map(i=>({...i,end:Math.min(i.end,1440)})),...(previous?[]:prev.intervals.filter(i=>i.end>1440).map(i=>({...i,start:0,end:i.end-1440})))];const work=workingMinutes(list),accounted=current.accountedMin??(p.outsidePayment==='NO'?work:!list.length?0:null);base={date,profileVersion:p.version,intervals:list,workingMin:work,accountedMin:accounted,rest:!work};}
  // The two duration settings remain the default on subsequent days. A saved
  // plan for one particular date still takes precedence over that default.
  if(!own&&data.weekConfig){const preset=weekConfiguration(data.weekConfig),precise=preset.precision==='intervals'&&preset.intervals?.length;const list=precise?preset.intervals:[];base={...base,intervals:list,workingMin:precise?workingMinutes(list):preset.workingMin,slotMin:preset.slotMin,rest:preset.workingMin===0,assumption:'Планируемое время работы'};}
  const precise=own&&(own.precision==='intervals'||own.intervals?.length>0),carry=(previous?.intervals??[]).filter(i=>i.state==='WORK'&&i.end>1440).map(i=>({...i,start:0,end:i.end-1440}));
  if(own){const list=precise?intervals(own.intervals??[],true).map(i=>({...i,end:Math.min(i.end,1440)})):[];base={...base,...own,intervals:list,workingMin:precise?workingMinutes(list):number(own.workingMin,1440),accountedMin:number(own.accountedMin,1440),rest:own.workingMin===0,assumption:precise?null:'Заданная длительность; время суток неизвестно'};}
  if(carry.length&&!(own?.mode==='simple'||!own&&data.weekConfig?.mode==='simple')){if(own&&!precise&&own.workingMin!=null)fail('Ночная работа пересекает следующий день с заданной суммой. Укажите его рабочие окна.');base.intervals=[...base.intervals,...carry];base.workingMin=workingMinutes(base.intervals);base.rest=base.workingMin===0;}
  return base;
}
export function saveForecastHours(data,date,slotMin,workingMin) {
  dayStamp(date);
  const value=weekConfiguration({slotMin,workingMin,intervals:[],precision:'total'});
  if(value.slotMin==null||value.workingMin==null)fail('Укажите длительность слота и рабочее время.');
  const simple={slotMin:value.slotMin,workingMin:value.workingMin,intervals:[],precision:'total',mode:'simple'};
  return {...data,weekConfig:simple,plans:{...data.plans,[date]:simple}};
}
function evidence(input=[]) {
  if(!Array.isArray(input)||input.length>2000) fail('Слишком много заказов за день.');
  const ids=new Set();
  return input.map(o=>{
    const id=String(o.id??'').slice(0,160); if(!id||ids.has(id)) fail('Повторяется идентификатор заказа.'); ids.add(id);
    const acceptedMin=number(o.acceptedMin,2880),deliveredMin=number(o.deliveredMin,2880),visibleMin=number(o.visibleMin,1440);
    if(acceptedMin!=null && deliveredMin!=null && deliveredMin<acceptedMin) fail('Завершение заказа раньше принятия.');
    return {id,visibleMin,acceptedMin,deliveredMin,orderNumber:integer(o.orderNumber),source:String(o.source??'manual').slice(0,200),confidence:String(o.confidence??'').slice(0,100),note:String(o.note??'').slice(0,1000),workingInterval:String(o.workingInterval??'').slice(0,100),fieldSources:Object.fromEntries(['visibleMin','acceptedMin','deliveredMin'].map(k=>{const status=o.fieldSources?.[k]?.status??(o[k]==null?'UNKNOWN':o.confirmed?'CONFIRMED':'RECONSTRUCTED');if(!['CONFIRMED','RECONSTRUCTED','UNKNOWN','CONFLICT'].includes(status))fail('Проверьте источник времени заказа.');return [k,{status,source:String(o.fieldSources?.[k]?.source??o.source??'').slice(0,200)}];})),completeness:acceptedMin!=null&&deliveredMin!=null?'FULL':'PARTIAL',confirmed:o.confirmed===true};
  });
}
function day(input) {
  dayStamp(input.date);
  const list=intervals(input.intervals??[]);
  for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) if(list[i].state!==list[j].state && overlap([list[i].start,list[i].end],[list[j].start,list[j].end])) fail('Рабочий интервал пересекается с паузой.');
  const orders=integer(input.orders),orderEvidence=evidence(input.orderEvidence);
  const precision=input.precision??'unknown'; if(!['unknown','total','intervals'].includes(precision)) fail('Проверьте точность времени.');
  const workConfirmed=input.workConfirmed===true;
  const timezone=validZone(String(input.timezone??'Europe/Moscow'));
  const workingMin=precision==='intervals' ? duration(list.filter(i=>i.state==='WORK').map(i=>[i.start,i.end])) : number(input.workingMin,1440);
  if(precision==='total' && workingMin==null) fail('Укажите суммарное время работы.');
  const orderRanges=orderEvidence.filter(o=>o.confirmed&&o.acceptedMin!=null&&o.deliveredMin!=null).map(o=>[Math.max(0,o.acceptedMin),Math.min(1440,o.deliveredMin)]).filter(([a,b])=>a<b);
  const pause=list.filter(i=>i.state==='UNAVAILABLE').map(i=>[i.start,i.end]);
  const conflicts=[...(input.sourceConflicts??[]).map(String).slice(0,50)];
  if(orders!=null&&orderEvidence.length>orders) conflicts.push('Список содержит больше заказов, чем подтверждённый итог. Проверьте возможные дубликаты.');
  if(orderRanges.some(a=>pause.some(b=>overlap(a,b)>0))) conflicts.push('Личная пауза пересекается с выполняемой доставкой. Уточните время.');
  const onOrderMin=orderRanges.length?duration(orderRanges):null;
  const completeEvidence=input.evidenceComplete===true && orders!=null && orderEvidence.length===orders && orderEvidence.every(o=>o.confirmed&&o.acceptedMin!=null&&o.deliveredMin!=null);
  const workRanges=list.filter(i=>i.state==='WORK').map(i=>[i.start,i.end]);
  const busyInside=duration(orderRanges.flatMap(a=>workRanges.map(b=>[Math.max(a[0],b[0]),Math.min(a[1],b[1])]).filter(([a,b])=>a<b)));
  if(workConfirmed&&precision==='intervals'&&onOrderMin!=null&&busyInside<onOrderMin&&!conflicts.length) conflicts.push('Доставка выходит за подтверждённые рабочие окна. Уточните рабочее время.');
  const source=String(input.source??'manual').slice(0,200);
  const fieldSources={};
  for(const [key,confirmed,value] of [['orders',input.ordersConfirmed===true,orders],['workingMin',workConfirmed,workingMin],['appAccountedMin',input.accountedConfirmed===true,input.appAccountedMin]]) {
    const given=input.fieldSources?.[key];fieldSources[key]={source:String(given?.source??source).slice(0,200),kind:given?.kind??(value==null?'UNKNOWN':confirmed?'FACT':'ASSUMPTION')};
    if(!['FACT','ASSUMPTION','UNKNOWN'].includes(fieldSources[key].kind))fail('Проверьте происхождение поля.');
    const status=given?.status??(value==null?'UNKNOWN':confirmed?'CONFIRMED':'RECONSTRUCTED');
    if(!['CONFIRMED','RECONSTRUCTED','UNKNOWN','CONFLICT'].includes(status))fail('Проверьте статус источника.');
    fieldSources[key]={...fieldSources[key],status,note:String(given?.note??'').slice(0,3000)};
  }
  return {date:input.date,timezone,zone:String(input.zone??'').slice(0,120),profileVersion:integer(input.profileVersion,100000),fieldSources,
    orders,ordersConfirmed:input.ordersConfirmed===true,completed:input.completed!==false,asOfMinute:integer(input.asOfMinute,1440),appAccountedMin:number(input.appAccountedMin,1440),accountedConfirmed:input.accountedConfirmed===true,
    intervals:list,precision,workingMin,workConfirmed,unavailableMin:workConfirmed&&precision==='intervals'?duration(pause):null,
    onOrderMin,availableNoOrderMin:workConfirmed&&precision==='intervals'&&completeEvidence&&!conflicts.length?Math.max(0,workingMin-busyInside):null,
    countedNonWorkingMin:workConfirmed?duration(list.filter(i=>i.state==='UNAVAILABLE'&&i.paymentCounted==='YES').map(i=>[i.start,i.end])):null,
    unknownMin:precision==='intervals'?1440-duration(list.filter(i=>i.state!=='UNKNOWN').map(i=>[i.start,i.end])):null,
    orderEvidence,evidenceComplete:completeEvidence,rawComplete:orders!=null&&orderEvidence.length===orders,sourceNotes:Array.isArray(input.sourceNotes)?input.sourceNotes.slice(0,20).map(v=>String(v).slice(0,3000)):[],estimatedIntervals:intervals(input.estimatedIntervals??[]),estimatedExposureJustified:input.estimatedExposureJustified===true,exposureBlocks:(input.exposureBlocks??[]).slice(0,100).map(b=>({...intervals([b])[0],orders:integer(b.orders),status:String(b.status),source:String(b.source??'').slice(0,300)})),conflicts,sourceConflicts:(input.sourceConflicts??[]).map(String).slice(0,50),
    source,sourceHash:String(input.sourceHash??'').slice(0,160),revision:integer(input.revision,100000)??1,
    importedAt:String(input.importedAt??''),confirmedAt:String(input.confirmedAt??''),manualTime:input.manualTime===true,
    revisions:Array.isArray(input.revisions)?input.revisions.slice(-100).map(r=>({revision:integer(r.revision,100000),at:String(r.at),precision:String(r.precision),workingMin:number(r.workingMin,1440),intervals:intervals(r.intervals??[]),source:String(r.source??''),manual:r.manual===true})):[]};
}
function safeRecords(input,max,label) { if(!Array.isArray(input)||input.length>max) fail(`Слишком много записей: ${label}.`); return copy(input); }
function recordId(value){if(typeof value!=='string'||!value||value.length>300)fail('Повреждён идентификатор прогноза.');return value;}
function timestamp(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('Повреждено время записи прогноза.');return value;}
function signed(value){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1000000)fail('Повреждена оценка ошибки.');return value;}
function evaluation(e){dayStamp(e.factDate);return {id:recordId(e.id),forecastId:recordId(e.forecastId),factDate:e.factDate,factRevision:integer(e.factRevision,100000),evaluatedAt:timestamp(e.evaluatedAt),fact:integer(e.fact),signedError:signed(e.signedError),absoluteError:number(e.absoluteError),percentageError:number(e.percentageError),covered:e.covered===true,prospective:e.prospective===true};}
function model(m){
  dayStamp(m.trainingDataCutoff);const q=m.validation??{};const validation={};
  for(const k of ['n','mae','wape','smape','coverage','baselineMAE'])validation[k]=number(q[k]);validation.bias=q.bias==null?null:signed(q.bias);validation.method=String(q.method??'').slice(0,200);
  return {...copy(m),id:recordId(m.id),trainedAt:timestamp(m.trainedAt),validation,features:Array.isArray(m.features)?m.features.slice(0,30).map(v=>String(v).slice(0,100)):[]};
}
function scenario(s){
  dayStamp(s.start);recordId(s.id);timestamp(s.createdAt);if(!s.overrides||typeof s.overrides!=='object'||Array.isArray(s.overrides)||Object.keys(s.overrides).length>7)fail('Повреждён сценарий.');
  const overrides={};for(const [date,d] of Object.entries(s.overrides)){dayStamp(date);if(date<s.start||date>addDays(s.start,6))fail('День сценария выходит за неделю.');overrides[date]={workingMin:number(d.workingMin,1440),accountedMin:number(d.accountedMin,1440),slotMin:number(d.slotMin,1440),accountingAssumption:d.accountingAssumption===true,intervals:intervals(d.intervals??[],true),...(d.precision?{precision:d.precision}:{})};}
  return {...copy(s),name:String(s.name??'План').slice(0,80),overrides};
}
function snapshot(s) {
  dayStamp(s.date); if(!['MORNING','NOWCAST','SCENARIO'].includes(s.kind)||typeof s.id!=='string'||!s.id||!Number.isFinite(Date.parse(s.createdAt))) fail('Повреждён выпуск прогноза.');
  dayStamp(s.trainingCutoff);recordId(s.id);timestamp(s.createdAt);
  if(!Array.isArray(s.reasons)||s.reasons.length>20)fail('Повреждены основания прогноза.');
  const c=number(s.central),l=number(s.lower),u=number(s.upper);
  if(c!=null && (l==null||u==null||l>c||c>u)) fail('Повреждён диапазон прогноза.');
  let parts;
  if(s.intervalForecasts!=null) {
    if(!Array.isArray(s.intervalForecasts)||s.intervalForecasts.length>100)fail('Повреждён прогноз рабочих окон.');
    parts=s.intervalForecasts.map(w=>{
      const start=integer(w.start,1439),end=integer(w.end,1440),central=integer(w.central),lower=integer(w.lower),upper=integer(w.upper);
      if([start,end,central,lower,upper].some(v=>v==null)||end<=start||lower>central||central>upper)fail('Повреждён диапазон рабочего окна.');
      return {start,end,central,lower,upper};
    });
  }
  return {...copy(s),...(parts?{intervalForecasts:parts}:{}),central:c,lower:l,upper:u,comparableN:integer(s.comparableN,100000)??0,reasons:s.reasons.map(v=>String(v).slice(0,500)),baseline:number(s.baseline),workingMin:number(s.workingMin,1440),timezone:validZone(String(s.timezone??'Europe/Moscow'))};
}
export function normalizeForecast(input) {
  if(input==null) return emptyForecast();
  if(input.version!==1) fail('Версия прогноза пока не поддерживается.');
  const result=emptyForecast();
  result.profiles=safeRecords(input.profiles??[],500,'профили').map(profile);
  if(new Set(result.profiles.map(p=>p.version)).size!==result.profiles.length) fail('Повторяется версия рабочего профиля.');
  if(!input.days||typeof input.days!=='object'||Array.isArray(input.days)||Object.keys(input.days).length>5000) fail('Проверьте историю прогноза.');
  for(const [key,value] of Object.entries(input.days)) { dayStamp(key); if(value.date!==key) fail('Дата факта не совпадает.'); result.days[key]=day(value); }
  result.snapshots=safeRecords(input.snapshots??[],10000,'прогнозы').map(snapshot);
  if(new Set(result.snapshots.map(s=>s.id)).size!==result.snapshots.length) fail('Повторяется выпуск прогноза.');
  result.evaluations=safeRecords(input.evaluations??[],20000,'оценки').map(evaluation);
  result.models=safeRecords(input.models??[],1000,'модели').map(model);
  result.scenarios=safeRecords(input.scenarios??[],1000,'сценарии').map(scenario);
  result.imports=safeRecords(input.imports??[],1000,'импорт').map(s=>{recordId(s.id);timestamp(s.at);return {...s,days:integer(s.days,5000),changed:integer(s.changed,5000),conflicts:integer(s.conflicts,100000)};});
  if(Object.keys(input.plans??{}).length>5000)fail('Слишком много планов.');
  for(const [date,p] of Object.entries(input.plans??{})){dayStamp(date);const v=weekConfiguration(p);result.plans[date]={workingMin:v.workingMin,...(Object.hasOwn(p,'slotMin')?{slotMin:v.slotMin}:{}),...(v.intervals?{intervals:v.intervals,precision:v.precision}:{}),...(v.mode?{mode:v.mode}:{})};}
  result.weekConfig=weekConfiguration(input.weekConfig);
  result.trainedModel=validCountModel(input.trainedModel)?copy(input.trainedModel):null;
  result.weather=input.weather==null?null:copy(input.weather);
  result.location=input.location==null?null:{weatherCity:String(input.location.weatherCity??'').slice(0,120),timezone:validZone(String(input.location.timezone??'Europe/Moscow')),source:String(input.location.source??'settings').slice(0,200)};
  if(input.typicalPlan)result.typicalPlan={intervals:intervals(input.typicalPlan.intervals??[]),timezone:validZone(String(input.typicalPlan.timezone??'Europe/Moscow')),zone:String(input.typicalPlan.zone??'').slice(0,120),source:String(input.typicalPlan.source??'history').slice(0,200),status:'RECONSTRUCTED'};
  for(const k of ['forecasts','accuracy','models','financialRules']){result.archive[k]=safeRecords(input.archive?.[k]??[],5000,'архив '+k).map(r=>{recordId(r.id);if(k==='forecasts'){if(r.date!=null)dayStamp(r.date);for(const f of ['central','lower','upper','factAddedLater','absoluteError','percentageError'])r[f]=number(r[f]);}return r;});if(new Set(result.archive[k].map(r=>r.id)).size!==result.archive[k].length)fail('Повторяется запись архива.');}
  // Legacy imports already contain source-tagged reconstructed totals. They stay reconstructed.
  for(const d of Object.values(result.days))if(d.source.startsWith('sheets_import:')&&!d.manualTime&&!d.workConfirmed&&d.workingMin>0&&!d.estimatedIntervals.length&&!input.days[d.date].fieldSources?.workingMin?.status)d.estimatedExposureJustified=true;
  return result;
}
export function mergeForecast(current,incoming) {
  if(incoming==null) return current??emptyForecast();
  const a=normalizeForecast(current??emptyForecast()),b=normalizeForecast(incoming);
  const keyed=(left,right,key,immutable=false)=>{ const map=new Map(left.map(v=>[v[key],v])); for(const v of right) { if(immutable&&map.has(v[key])&&JSON.stringify(map.get(v[key]))!==JSON.stringify(v)) fail('В копии изменён зафиксированный прогноз или профиль. Импорт отменён.'); map.set(v[key],v); } return [...map.values()]; };
  const days={...a.days}; for(const incoming of Object.values(b.days)) {
    const old=days[incoming.date];let d=incoming;if(!old){days[d.date]=d;continue;}
    const sourceConflicts=[...new Set([...old.sourceConflicts,...d.sourceConflicts])];
    if(old.manualTime) {
      if(JSON.stringify([old.intervals,old.workingMin,old.precision])!==JSON.stringify([d.intervals,d.workingMin,d.precision]))sourceConflicts.push('В копии другие рабочие часы. Сохранено ручное уточнение; подтвердите время дня.');
      d={...d,intervals:old.intervals,workingMin:old.workingMin,precision:old.precision,workConfirmed:old.workConfirmed,manualTime:true,revisions:old.revisions};
    }
    if(old.accountedConfirmed&&d.accountedConfirmed&&old.appAccountedMin!==d.appAccountedMin) {sourceConflicts.push('В копии другие часы Яндекса. Сохранён подтверждённый знаменатель; уточните день.');d={...d,appAccountedMin:old.appAccountedMin};}
    if(old.ordersConfirmed&&d.ordersConfirmed&&old.orders!==d.orders) {sourceConflicts.push('В копии другой итог заказов. Сохранён подтверждённый итог; уточните день.');d={...d,orders:old.orders};}
    days[d.date]=day({...d,sourceConflicts:[...new Set(sourceConflicts)]});
  }
  return normalizeForecast({...a,days,profiles:keyed(a.profiles,b.profiles,'version',true),snapshots:keyed(a.snapshots,b.snapshots,'id',true),evaluations:keyed(a.evaluations,b.evaluations,'id',true),models:keyed(a.models,b.models,'id',true),scenarios:keyed(a.scenarios,b.scenarios,'id'),imports:keyed(a.imports,b.imports,'id',true),weather:a.weather??b.weather,trainedModel:a.trainedModel??b.trainedModel,plans:{...b.plans,...a.plans},weekConfig:b.weekConfig??a.weekConfig,location:a.location??b.location,typicalPlan:a.typicalPlan??b.typicalPlan,archive:Object.fromEntries(['forecasts','accuracy','models','financialRules'].map(k=>[k,keyed(a.archive[k],b.archive[k],'id',true)]))});
}
export function saveDay(data,input,now=new Date().toISOString()) {
  const old=data.days[input.date],p=profileFor(data,input.date);
  const revisions=[...(old?.revisions??[])];
  if(old) revisions.push({revision:old.revision,at:now,precision:old.precision,workingMin:old.workingMin,intervals:old.intervals,source:old.source,manual:old.manualTime});
  const fieldSources={...(old?.fieldSources??{})};
  for(const key of ['orders','workingMin','appAccountedMin'])if(Object.hasOwn(input,key)||key==='workingMin'&&Object.hasOwn(input,'intervals'))delete fieldSources[key];
  const next=day({...old,source:'manual',timezone:p?.timezone??old?.timezone,zone:p?.zone??old?.zone,profileVersion:p?.version,fieldSources,...input,revision:(old?.revision??0)+1,revisions,confirmedAt:now,manualTime:true});
  return {...data,days:{...data.days,[next.date]:next}};
}
export function saveTimeline(data,input,now=new Date().toISOString()) {
  // Split overnight intervals by local calendar date, never shift using the device/VPN timezone.
  const list=intervals(input.intervals??[],true),own=list.map(i=>({...i,end:Math.min(1440,i.end)}));
  let result=saveDay(data,{...input,intervals:own},now);
  const spill=list.filter(i=>i.end>1440).map(i=>({...i,start:0,end:i.end-1440}));
  if(spill.length) {
    const date=addDays(input.date,1),previous=result.days[date];
    result=saveDay(result,{...previous,date,precision:'intervals',intervals:[...(previous?.intervals??[]),...spill],workConfirmed:true},now);
  }
  return result;
}
export function importDays(data,rows,source='history',now=new Date().toISOString()) {
  if(!Array.isArray(rows)||rows.length>5000) fail('Проверьте список дней.');
  const days={...data.days}; let changed=0,conflicts=0;
  for(const input of rows) {
    const parsed=day({...input,source:input.source??source,importedAt:now});
    const old=days[parsed.date];
    const incomingHash=fingerprint({...input,source:input.source??source});
    if(old?.sourceHash===incomingHash) continue;
    const sourceConflicts=[...parsed.sourceConflicts];
    const geographyConflict=old?.manualTime&&((input.zone&&input.zone!==old.zone)||(input.timezone&&input.timezone!==old.timezone));
    if(geographyConflict)sourceConflicts.push('Источник расходится с вручную выбранной местностью/часовым поясом. Сохранён ручной выбор.');
    if(old?.ordersConfirmed&&parsed.ordersConfirmed&&old.orders!==parsed.orders) sourceConflicts.push(`Заказы: сохранено ${old.orders}, новый источник ${parsed.orders}. Подтвердите итог дня.`);
    if(old?.accountedConfirmed&&parsed.accountedConfirmed&&old.appAccountedMin!==parsed.appAccountedMin) sourceConflicts.push(`Часы Яндекса: сохранено ${old.appAccountedMin} мин, новый источник ${parsed.appAccountedMin} мин. Подтвердите итог дня.`);
    let merged={...parsed,zone:geographyConflict?old.zone:input.zone?parsed.zone:old?.zone??parsed.zone,timezone:geographyConflict?old.timezone:input.timezone?parsed.timezone:old?.timezone??profileFor(data,parsed.date)?.timezone??parsed.timezone,sourceHash:incomingHash,revision:(old?.revision??0)+1,revisions:old?.revisions??[],sourceConflicts};
    if(old?.manualTime) merged={...merged,intervals:old.intervals,workingMin:old.workingMin,precision:old.precision,workConfirmed:old.workConfirmed,manualTime:true,revisions:old.revisions,confirmedAt:old.confirmedAt,fieldSources:{...merged.fieldSources,workingMin:old.fieldSources.workingMin}};
    else if(old?.workConfirmed&&!parsed.workConfirmed&&!(old.source===parsed.source&&old.source.startsWith('sheets_import:'))) merged={...merged,intervals:old.intervals,workingMin:old.workingMin,precision:old.precision,workConfirmed:true,fieldSources:{...merged.fieldSources,workingMin:old.fieldSources.workingMin}};
    if(old?.ordersConfirmed&&parsed.ordersConfirmed&&old.orders!==parsed.orders) merged={...merged,orders:old.orders,ordersConfirmed:old.ordersConfirmed,fieldSources:{...merged.fieldSources,orders:{...old.fieldSources.orders,status:'CONFLICT'}}};
    // A partial capture cannot erase a confirmed total or a fuller order list.
    if(old?.ordersConfirmed&&!parsed.ordersConfirmed) {merged.orders=old.orders;merged.ordersConfirmed=true;merged.fieldSources.orders=old.fieldSources.orders;}
    if(old?.accountedConfirmed&&!parsed.accountedConfirmed) {merged.appAccountedMin=old.appAccountedMin;merged.accountedConfirmed=true;merged.fieldSources.appAccountedMin=old.fieldSources.appAccountedMin;}
    if(old?.accountedConfirmed&&parsed.accountedConfirmed&&old.appAccountedMin!==parsed.appAccountedMin){merged.appAccountedMin=old.appAccountedMin;merged.fieldSources.appAccountedMin={...old.fieldSources.appAccountedMin,status:'CONFLICT'};}
    const orders=new Map((old?.orderEvidence??[]).map(o=>[o.id,o])); for(const o of parsed.orderEvidence) orders.set(o.id,o);
    merged.orderEvidence=[...orders.values()];
    merged.evidenceComplete=(old?.evidenceComplete||parsed.evidenceComplete) && merged.orderEvidence.length===merged.orders;
    days[parsed.date]=day(merged); changed++; conflicts+=days[parsed.date].conflicts.length;
  }
  const id=`import-${fingerprint({rows,source})}`;
  if(!changed && data.imports.some(i=>i.id===id)) return data;
  return {...data,days,imports:[...data.imports.filter(i=>i.id!==id),{id,source,at:now,days:rows.length,changed,conflicts,parserVersion:'history-2',status:conflicts?'REVIEW':'IMPORTED'}]};
}
export function syncSlots(data,entries) {
  // Only offer slot totals as unconfirmed observations. No inference of availability.
  const dates=new Set(entries.map(e=>e.date)),days={...data.days};
  for(const date of dates) {
    const list=entries.filter(e=>e.date===date),old=days[date];
    if(old && old.source!=='finance-slots') continue;
    const orders=list.every(e=>e.dailyOrders!=null)?list.reduce((n,e)=>n+e.dailyOrders,0):null;
    const appAccountedMin=list.every(e=>e.dailyHours!=null)?list.reduce((n,e)=>n+e.dailyHours*60,0):null;
    if(appAccountedMin>1440) continue; // Legacy cumulative intervals are not a work day.
    const sourceHash=fingerprint(list.map(e=>[e.id,e.date,e.dailyOrders,e.dailyHours]));
    const clock=forecastClock(data),complete=date<clock.date,reliable=list.every(e=>!e.legacyReading);
    if(old?.sourceHash===sourceHash&&old.ordersConfirmed===(orders!=null)&&old.accountedConfirmed===(appAccountedMin!=null&&reliable)&&old.completed===complete)continue;
    const fieldSources={...old?.fieldSources};
    delete fieldSources.orders;delete fieldSources.appAccountedMin;
    days[date]=day({...old,date,zone:old?.zone??profileFor(data,date)?.zone??'',timezone:old?.timezone??profileFor(data,date)?.timezone??'Europe/Moscow',orders,appAccountedMin,ordersConfirmed:orders!=null,accountedConfirmed:appAccountedMin!=null&&reliable,fieldSources,completed:complete,asOfMinute:date===clock.date?clock.minute:null,source:'finance-slots',sourceHash,revision:(old?.revision??0)+1});
  }
  for(const [date,d] of Object.entries(days)) if(d.source==='finance-slots'&&!dates.has(date)){
    if(!d.manualTime){delete days[date];continue;}
    if(d.orders!=null||d.appAccountedMin!=null||d.ordersConfirmed||d.accountedConfirmed){
      const fieldSources={...d.fieldSources};delete fieldSources.orders;delete fieldSources.appAccountedMin;
      days[date]=day({...d,orders:null,ordersConfirmed:false,appAccountedMin:null,accountedConfirmed:false,fieldSources,revision:d.revision+1,sourceHash:null});
    }
  }
  return {...data,days};
}
export function inferredPlan(data,date) {
  const eligible=Object.values(data.days).filter(d=>d.date<date&&d.completed&&!d.conflicts.length&&(d.workConfirmed||d.estimatedExposureJustified)&&d.workingMin>0).sort((a,b)=>a.date.localeCompare(b.date)).slice(-28);
  const same=eligible.filter(d=>weekday(d.date)===weekday(date)),rows=same.length>=3?same:eligible;
  const template=data.typicalPlan;
  let list=template?.intervals??[];
  if(!list.length) {
    const grouped=new Map();for(const d of rows){const w=d.workConfirmed?d.intervals:d.estimatedIntervals;if(!w?.length)continue;const key=JSON.stringify(w.filter(i=>i.state==='WORK'));const g=grouped.get(key)??{n:0,list:w};g.n++;grouped.set(key,g);}
    const best=[...grouped.values()].sort((a,b)=>b.n-a.n)[0];if(best?.n>=3)list=best.list;
  }
  const totals=rows.map(d=>d.workingMin).sort((a,b)=>a-b),workingMin=list.length?workingMinutes(list):rows.length>=3?totals[Math.floor(totals.length/2)]:null;
  return {date,profileVersion:null,zone:template?.zone??rows.at(-1)?.zone??'',timezone:template?.timezone??rows.at(-1)?.timezone??'Europe/Moscow',intervals:list,workingMin,accountedMin:null,slotMin:null,rest:false,assumption:workingMin!=null?'Типовой график из истории — допущение':null,source:template?.source??'historical median'};
}
export function predict(data,date,plan=planDay(data,date)) {
  const p=profileFor(data,date);return countForecast(data.days,date,{...plan,zone:plan.zone??p?.zone??'',modelVersion:FORECAST_VERSION});
}
export function backtest(data,cutoff){return validateCounts(data.days,cutoff,FORECAST_VERSION,planDay(data,cutoff).zone??profileFor(data,cutoff)?.zone??'');}
export function ensureForecast(data,now=new Date(),kind='MORNING') {
  const p=currentProfile(data,now),clock=forecastClock(data,now);
  const existing=data.snapshots.filter(s=>s.date===clock.date&&s.kind===kind);
  if(kind==='MORNING'&&existing.length) return data;
  const plan=planDay(data,clock.date),fact=data.days[clock.date];
  const asOf=kind==='NOWCAST'&&fact?.ordersConfirmed?fact.completed?1440:fact.asOfMinute??clock.minute:clock.minute;
  const remaining=kind==='NOWCAST'?plan.intervals.filter(i=>i.state==='WORK'&&i.end>asOf).map(i=>({...i,start:Math.max(asOf,i.start)})):plan.intervals;
  const remainingMin=duration(remaining.filter(i=>i.state==='WORK').map(i=>[i.start,i.end]));
  const estimate=predict(data,clock.date,kind==='NOWCAST'?{...plan,intervals:remaining,workingMin:plan.intervals.length||fact?.completed?remainingMin:null}:plan);
  if(estimate.central==null)return data;
  const signature=fingerprint({estimate,profile:p?.version??null,fact:fact?.revision,asOf:kind==='NOWCAST'?asOf:null});
  if(kind==='NOWCAST'&&existing.at(-1)?.signature===signature) return data;
  const createdAt=now.toISOString(),id=`${kind}-${clock.date}-${fingerprint({createdAt,signature})}`;
  const result={...estimate,id,date:clock.date,kind,createdAt,signature,profileVersion:p?.version??null,timezone:p?.timezone??plan.timezone??'Europe/Moscow',zone:p?.zone??plan.zone??'',exposureDefinitionVersion:EXPOSURE_VERSION,
    plannedIntervals:plan.intervals,atMinute:clock.minute,factAsOfMinute:asOf,remainingMin:kind==='NOWCAST'?remainingMin:null,factAtIssue:kind==='NOWCAST'&&fact?.ordersConfirmed?fact.orders:null,
    partialDayIssue:kind==='MORNING'&&(clock.minute>(plan.intervals.filter(i=>i.state==='WORK')[0]?.start??0)||!!(fact?.ordersConfirmed||fact?.workConfirmed||fact?.accountedConfirmed))};
  const modelId=`${FORECAST_VERSION}-${estimate.sourceHash}-${p?.zone??plan.zone??''}`;
  let models=data.models;
  if(!models.some(m=>m.id===modelId)) {
    const {results,...validation}=backtest(data,clock.date);
    models=[...models.slice(-199),{id:modelId,modelVersion:FORECAST_VERSION,profileVersion:p?.version??null,zone:p?.zone??plan.zone??'',trainedAt:createdAt,trainingDataCutoff:estimate.trainingCutoff,
      exposureDefinitionVersion:EXPOSURE_VERSION,features:estimate.features??['working exposure','weekday','recency 35 days'],type:estimate.selectedModel??'weighted-count-baseline',fit:estimate.fit??null,selection:estimate.selection??null,trainingN:estimate.comparableN,validation,sourceHash:estimate.sourceHash}];
  }
  return {...data,snapshots:[...data.snapshots,result],models};
}
export function evaluateForecasts(data,now=new Date()) {
  const evaluations=[...data.evaluations];
  for(const s of data.snapshots) {
    const d=data.days[s.date];
    if(s.kind!=='MORNING'||s.central==null||!d?.ordersConfirmed||!d.completed||d.conflicts.length||s.date>=localClock(s.timezone,now).date) continue;
    const id=`eval-${s.id}-${d.revision}`; if(evaluations.some(e=>e.id===id)) continue;
    evaluations.push({id,forecastId:s.id,factDate:d.date,factRevision:d.revision,evaluatedAt:now.toISOString(),fact:d.orders,signedError:s.central-d.orders,absoluteError:Math.abs(s.central-d.orders),percentageError:d.orders?Math.abs(s.central-d.orders)/d.orders:null,covered:d.orders>=s.lower&&d.orders<=s.upper,prospective:!s.partialDayIssue});
  }
  return {...data,evaluations};
}
export function forecastDay(data,date,overrides={}) {
  dayStamp(date);const plan=planDay(data,date,overrides);return {...plan,forecast:predict(data,date,plan),status:'SCENARIO'};
}
export function weekPlan(data,start,overrides={}) {
  dayStamp(start);
  const days=Array.from({length:7},(_,i)=>forecastDay(data,addDays(start,i),overrides));
  const known=days.every(d=>d.forecast.central!=null),knownHours=days.every(d=>d.accountedMin!=null);
  return {start,days,central:known?days.reduce((n,d)=>n+d.forecast.central,0):null,
    // Summed bands retain correlated day risk; no independent Poisson confidence claim.
    lower:known?days.reduce((n,d)=>n+d.forecast.lower,0):null,upper:known?days.reduce((n,d)=>n+d.forecast.upper,0):null,
    accountedMin:knownHours?days.reduce((n,d)=>n+d.accountedMin,0):null,workingMin:days.every(d=>d.workingMin!=null)?days.reduce((n,d)=>n+d.workingMin,0):null};
}
export function saveScenario(data,name,start,overrides,now=new Date().toISOString()) {
  const scenario=weekPlan(data,start,overrides),id=`scenario-${fingerprint({name,start,now})}`;
  return {...data,scenarios:[...data.scenarios.slice(-19),{id,name:String(name??'План').slice(0,80),start,createdAt:now,overrides:copy(overrides),snapshot:scenario}]};
}
export function forecastReport(data) {
  const rows=Object.values(data.days).sort((a,b)=>a.date.localeCompare(b.date));
  return ['','## Локальный прогноз',`Модель: ${FORECAST_VERSION}; экспозиция: ${EXPOSURE_VERSION}.`,`Профилей: ${data.profiles.length}; дней: ${rows.length}; выпусков: ${data.snapshots.length}; оценок: ${data.evaluations.length}; архивных выпусков: ${data.archive?.forecasts?.length??0}.`,
    'WORK = готовность принимать заказ или выполнение доставки. Часы Яндекса отдельно. UNKNOWN не является нулевым спросом.',
    '| Дата | Заказы | Рабочие мин | Часы Яндекса, мин | Паузы, мин | Точность | Ревизия | Источник | Конфликты |','|---|---:|---:|---:|---:|---|---:|---|---|',
    ...rows.map(d=>`| ${d.date} | ${d.orders??'неизвестно'}${d.ordersConfirmed?'':' (не подтверждено)'} | ${d.workingMin??'неизвестно'}${d.workConfirmed?'':' (не подтверждено)'} | ${d.appAccountedMin??'неизвестно'} | ${d.unavailableMin??'неизвестно'} | ${d.precision} | ${d.revision} | ${d.source.replace(/[|\n]/g,' ')} | ${d.conflicts.join('; ').replace(/[|\n]/g,' ')} |`),
    '','Выпуски (неизменяемые):',...data.snapshots.slice(-60).map(s=>`- ${s.id}: ${s.createdAt}; ${s.kind}; ${s.date}; ${s.central??'—'} [${s.lower??'—'}; ${s.upper??'—'}]; n=${s.comparableN}; cutoff=${s.trainingCutoff}; hash=${s.sourceHash}; profile=${s.profileVersion}; model=${s.modelVersion}; поздняя фиксация=${Boolean(s.partialDayIssue)}.`),
    'Реестр моделей:',...data.models.slice(-20).map(m=>`- ${m.id}: выбран ${m.type}; обновлён ${m.trainedAt}; cutoff=${m.trainingDataCutoff}; n=${m.trainingN??'—'}; MAE=${m.validation?.mae??'—'}; baseline MAE=${m.validation?.baselineMAE??'—'}; bias=${m.validation?.bias??'—'}; coverage=${m.validation?.coverage??'—'}; проверенных дней=${m.validation?.n??0}; обученный кандидат=${m.fit?.type??'нет достаточных данных'}; подтверждённых дат=${m.fit?.days??0}; окон=${m.fit?.observations??0}.`),
    'Статусы часов:',...rows.map(d=>`- ${d.date}: работа=${d.fieldSources.workingMin.status}; учёт=${d.fieldSources.appAccountedMin.status}; RAW=${d.orderEvidence.length}/${d.orders??'неизвестно'}; перечень=${d.rawComplete?'полный':'частичный'}; временные поля=${d.evidenceComplete?'полные':'частичные'}.`),
    'Оценки ревизий:',...data.evaluations.slice(-60).map(e=>`- ${e.id}; факт v${e.factRevision}=${e.fact}; ошибка=${e.signedError}; в диапазоне=${e.covered}; до начала работы=${e.prospective}.`),
    'Персональные профили, полные снимки и журнал импорта находятся в JSON-копии. Сценарии не входят в обучение.',''].join('\n');
}
