import {dayStamp,fingerprint,parseMinute,parseWindows,importDays,normalizeForecast} from './forecast.mjs';
export const PARSER_VERSION='history-2';
const dateValue=value=>{
 if(typeof value==='number'&&value>20000&&value<110000)return new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000).toISOString().slice(0,10);
 const s=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s)){dayStamp(s);return s;}
 const m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(m){const d=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;dayStamp(d);return d;}return null;
};
const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const hours=v=>n(v)!=null&&v<=24?Math.round(v*60):null;
const minute=v=>typeof v==='number'&&v>=0&&v<1?Math.round(v*1440):/^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(v??''))?parseMinute(String(v).slice(0,5)):null;
const cell=(r,k)=>r[k]&&typeof r[k]==='object'?r[k].formula?null:r[k].value:r[k];
const cells=r=>Object.fromEntries(Object.keys(r).map(k=>[k,cell(r,k)]));
const text=(...v)=>v.filter(Boolean).join(' ').slice(0,3000);
const unknown=/не\s*подтвержд|неизвест|не установ|не видн|не определ|нет.*данных/i;
const reconstructed=/реконструк|обычн.*график|принят.*график|считается актив|по последнему|по первому|шаблон|планов|по стандарт/i;
const confirmedWindowPatterns=[
 /^фактически отработан весь слот\s+(\d{1,2}:\d{2})[–—-](\d{1,2}:\d{2})\s+без оффлайна/iu,
 /^рабочее окно\s+(\d{1,2}:\d{2})[–—-](\d{1,2}:\d{2})\s*\([^)]+\) подтверждено пользователем/iu,
 /^подтверждено пользователем:\s*(\d{1,2}:\d{2})[–—-](\d{1,2}:\d{2})/iu,
 /^вечер фактически активен\s+(\d{1,2}:\d{2})[–—-](\d{1,2}:\d{2})/iu
];
function confirmedWindow(work,note){
 if(work==null)return null;
 const match=confirmedWindowPatterns.map(pattern=>String(note).trim().match(pattern)).find(Boolean);
 if(!match)return null;
 try{const [span]=parseWindows(`${match[1]}–${match[2]}`);return span&&span.end<=1440&&Math.abs(span.end-span.start-work)<=2?span:null;}catch{return null;}
}
const sourceField=(value,status,source,note='')=>({status:value==null?'UNKNOWN':status,kind:value==null?'UNKNOWN':status==='CONFIRMED'?'FACT':'ASSUMPTION',source,note});
function workStatus(value,note){return value==null?'UNKNOWN':confirmedWindow(value,note)||value===0&&/^полный выходной.*со слов/iu.test(String(note).trim())?'CONFIRMED':'RECONSTRUCTED';}
function archiveRows(sheets,name,source){return Object.entries(sheets[name]??{}).filter(([i,r])=>Number(i)>1&&Object.values(r).some(v=>v!=null&&!(v&&typeof v==='object'&&v.formula))).map(([row,r])=>({id:`archive-${fingerprint([name,name==='Прогнозы'?Object.fromEntries(Object.entries(cells(r)).filter(([k])=>!['M','N','O'].includes(k))):cells(r)])}`,sheet:name,row:Number(row),source,values:cells(r)}));}
export function parseWorkbook(workbook,source='Courier Forecast.xlsx'){
 if(!workbook?.sheets||typeof workbook.sheets!=='object')throw new Error('Не удалось прочитать листы XLSX.');
 const sheets=workbook.sheets,days=new Map(),get=date=>{if(!days.has(date))days.set(date,{date,orders:null,ordersConfirmed:false,workingMin:null,workConfirmed:false,precision:'unknown',appAccountedMin:null,accountedConfirmed:false,intervals:[],estimatedIntervals:[],orderEvidence:[],source:`sheets_import:${source}`,sourceConflicts:[],fieldSources:{},sourceNotes:[]});return days.get(date);};
 let formulaRows=0;
 for(const [i,raw] of Object.entries(sheets['Дневные итоги']??{})){
  if(Number(i)<2)continue;const r=cells(raw),date=dateValue(r.A);if(!date){formulaRows++;continue;}
  const d=get(date),work=hours(r.O),accounted=hours(r.Q),note=text(r.N,r.S),src=`${source}:Дневные итоги!${i}`;
  if(Number.isInteger(n(r.E))){d.orders=r.E;d.ordersConfirmed=true;d.fieldSources.orders=sourceField(r.E,'CONFIRMED',src);}
  d.zone=String(r.L??'');d.sourceNotes.push(note);
  if(work!=null){const status=workStatus(work,note);d.workingMin=work;d.workConfirmed=status==='CONFIRMED';d.precision='total';d.fieldSources.workingMin=sourceField(work,status,src,note);}
  if(accounted!=null){const status=/(?:^|[.;])\s*точные учитываемые часы подтверждены пользователем/iu.test(note)?'CONFIRMED':'RECONSTRUCTED';d.appAccountedMin=accounted;d.accountedConfirmed=status==='CONFIRMED';d.fieldSources.appAccountedMin=sourceField(accounted,status,src,note);}
  // C/D are slot boundaries; G is money. Neither is working/accounted exposure.
 }
 const shifts=new Map();
 for(const [i,raw] of Object.entries(sheets['Смены']??{})){
  if(Number(i)<2)continue;const r=cells(raw),date=dateValue(r.A);if(!date)continue;
  const note=text(r.O,r.P),start=minute(r.C),end=minute(r.D),work=hours(r.E),status=workStatus(work,note),slotRange=start!=null&&end!=null&&end>start?{start,end,state:'WORK',paymentCounted:'UNKNOWN'}:null;
  // C/D are nominal slot boundaries. Only an explicit interval matching E is confirmed WORK.
  const range=status==='CONFIRMED'?confirmedWindow(work,note):slotRange;
  const part={orders:n(r.G),work,accounted:hours(r.F),range,status,note,source:`${source}:Смены!${i}`};
  const values=shifts.get(date)??[];values.push(part);shifts.set(date,values);
  const d=get(date);if(!d.zone&&r.M)d.zone=String(r.M);d.sourceNotes.push(note);
 }
 for(const [date,values] of shifts){
  const d=get(date),sum=k=>values.every(v=>v[k]!=null)?values.reduce((s,v)=>s+v[k],0):null,orders=sum('orders'),work=sum('work'),accounted=sum('accounted'),note=values.map(v=>v.note).join(' '),src=values.map(v=>v.source).join(';');
  if(d.orders==null&&Number.isInteger(orders)){d.orders=orders;d.ordersConfirmed=true;d.fieldSources.orders=sourceField(orders,'CONFIRMED',src);}
  else if(orders!=null&&d.orders!==orders)d.sourceConflicts.push(`Листы расходятся по заказам: ${d.orders} и ${orders}.`);
  const allConfirmed=values.every(v=>v.status==='CONFIRMED'),ranges=values.filter(v=>v.range).map(v=>v.range);
  if(work!=null&&work<=1440){
   if(d.workingMin!=null&&Math.abs(d.workingMin-work)>2)d.sourceConflicts.push('Листы расходятся по рабочим часам.');
   if(d.workingMin==null||allConfirmed){d.workingMin=work;d.workConfirmed=allConfirmed;d.precision='total';d.fieldSources.workingMin=sourceField(work,allConfirmed?'CONFIRMED':'RECONSTRUCTED',src,note);}
   if(ranges.length===values.length){if(allConfirmed){d.intervals=ranges;d.precision='intervals';}else d.estimatedIntervals=ranges;}
   d.estimatedExposureJustified=!allConfirmed&&!unknown.test(note)&&ranges.length===values.length;
  }
  if((d.appAccountedMin==null||allConfirmed&&d.appAccountedMin===accounted)&&accounted!=null&&accounted<=1440){d.appAccountedMin=accounted;d.accountedConfirmed=allConfirmed;d.fieldSources.appAccountedMin=sourceField(accounted,allConfirmed?'CONFIRMED':'RECONSTRUCTED',src,note);}
  // Overlapping confirmed windows contradict the summed shift hours; normalization would
  // otherwise silently replace E with the shorter union and still call it confirmed.
  const confirmedRanges=values.filter(v=>v.range&&v.status==='CONFIRMED').map(v=>v.range).sort((a,b)=>a.start-b.start);
  const overlapConfirmed=confirmedRanges.some((r,i)=>i>0&&r.start<confirmedRanges[i-1].end);
  if(overlapConfirmed){
   d.sourceConflicts.push('Подтверждённые рабочие окна пересекаются; уточните фактическое время.');
   d.workConfirmed=false;d.precision='total';d.intervals=[];
   d.fieldSources.workingMin=sourceField(d.workingMin,'CONFLICT',src,note);
   d.exposureBlocks=[];
  }else{
   // Confirmed sub-windows remain useful without pretending the rest of the day is known.
   d.exposureBlocks=values.filter(v=>v.range&&v.status==='CONFIRMED').map(v=>({...v.range,orders:v.orders,status:'CONFIRMED',source:v.source}));
  }
 }
 const ordinal=new Map();
 for(const [i,raw] of Object.entries(sheets['Заказы RAW']??{})){
  if(Number(i)<2)continue;const r=cells(raw),date=dateValue(r.A);if(!date)continue;
  const visibleMin=minute(r.C),acceptedMin=minute(r.L);let deliveredMin=minute(r.M);if(deliveredMin!=null&&acceptedMin!=null&&deliveredMin<acceptedMin)deliveredMin+=1440;
  const key=fingerprint([date,visibleMin,r.E,r.J]),occurrence=(ordinal.get(key)??0)+1;ordinal.set(key,occurrence);
  const id=Number.isInteger(r.D)&&r.D>0?`xlsx-${date}-order-${r.D}`:`xlsx-${date}-${key}-${occurrence}`;
  const d=get(date);d.orderEvidence.push({id,orderNumber:Number.isInteger(r.D)?r.D:null,visibleMin,acceptedMin,deliveredMin,source:text(r.J,`Заказы RAW!${i}`),confidence:String(r.K??''),note:String(r.O??''),workingInterval:String(r.F??''),confirmed:/(?:высок|high)/iu.test(String(r.K??'')),fieldSources:Object.fromEntries([['visibleMin',visibleMin],['acceptedMin',acceptedMin],['deliveredMin',deliveredMin]].map(([key,value])=>[key,{status:value==null?'UNKNOWN':/(?:высок|high)/iu.test(String(r.K??''))?'CONFIRMED':'RECONSTRUCTED',source:`Заказы RAW!${i}`} ])),completeness:acceptedMin!=null&&deliveredMin!=null?'FULL':'PARTIAL'});
  if(r.I&&!d.zone)d.zone=String(r.I);
 }
 for(const d of days.values()){
  d.evidenceComplete=d.ordersConfirmed&&d.orders===d.orderEvidence.length&&d.orderEvidence.every(o=>o.acceptedMin!=null&&o.deliveredMin!=null);
  if(d.orders!=null&&d.orderEvidence.length>d.orders)d.sourceConflicts.push(`RAW содержит ${d.orderEvidence.length} заказов, итог ${d.orders}.`);
  for(const key of ['orders','workingMin','appAccountedMin'])d.fieldSources[key]??=sourceField(d[key],'UNKNOWN',d.source);
 }
 const settings=Object.values(sheets['Настройки']??{}).map(cells),windows=settings.filter(r=>/обычное.*окно/i.test(r.A)).flatMap(r=>{try{return parseWindows(r.B);}catch{return [];}}),zone=[...days.values()].filter(d=>d.zone).at(-1)?.zone??'';
 const typicalPlan=windows.length?{intervals:windows,timezone:'Europe/Moscow',zone,source:`${source}:Настройки`,status:'RECONSTRUCTED'}:null;
 const archive={forecasts:archiveRows(sheets,'Прогнозы',source),accuracy:archiveRows(sheets,'Точность',source),models:archiveRows(sheets,'Модели',source),financialRules:archiveRows(sheets,'Финансовые правила',source)};
 for(const r of archive.forecasts){const v=r.values;r.date=dateValue(v.A);r.central=n(v.D);r.lower=n(v.E);r.upper=n(v.F);r.interval=String(v.C??'');r.recordedAt=String(v.Q??'');r.modelVersion=String(v.R??v.J??'archive');r.factAddedLater=n(v.M);r.absoluteError=r.central!=null&&r.factAddedLater!=null?Math.abs(r.central-r.factAddedLater):null;r.percentageError=r.factAddedLater>0?r.absoluteError/r.factAddedLater:null;r.prospective=false;}
 const result={format:'forecast-history-1',parserVersion:PARSER_VERSION,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),archive,typicalPlan,formulaRows,source,warnings:['Денежные записи и действующие тарифы не меняются. Подтверждённые источники приняты автоматически; реконструкция и неизвестные часы обозначены отдельно.']};
 result.summary=importSummary(result.days);return result;
}
export function importSummary(days){
 const field=k=>Object.fromEntries(['CONFIRMED','RECONSTRUCTED','UNKNOWN','CONFLICT'].map(s=>[s,days.filter(d=>(d.sourceConflicts?.length?'CONFLICT':d.fieldSources?.[k]?.status??(d[k]==null?'UNKNOWN':k==='workingMin'&&d.workConfirmed||k==='orders'&&d.ordersConfirmed||k==='appAccountedMin'&&d.accountedConfirmed?'CONFIRMED':'RECONSTRUCTED'))===s).length]));
 const events=days.flatMap(d=>d.orderEvidence??[]);
 const time={visible:events.filter(o=>o.visibleMin!=null).length,accepted:events.filter(o=>o.acceptedMin!=null).length,delivered:events.filter(o=>o.deliveredMin!=null).length,paired:events.filter(o=>o.acceptedMin!=null&&o.deliveredMin!=null).length};
 return {dates:days.length,events:events.length,time,orders:field('orders'),working:field('workingMin'),accounted:field('appAccountedMin'),conflicts:days.filter(d=>d.sourceConflicts?.length||d.conflicts?.length).length};
}
export function applyHistory(data,pending,now=new Date().toISOString()){
 let next=importDays(data,pending.days,pending.source,now);
 const archive={...(next.archive??{})};for(const key of ['forecasts','accuracy','models','financialRules']){const map=new Map((archive[key]??[]).map(r=>[r.id,r]));for(const row of pending.archive?.[key]??[]){const old=map.get(row.id);if(!old)map.set(row.id,row);else if(key==='forecasts'&&old.factAddedLater!==row.factAddedLater){const rev=old.factRevisions??[];if(!rev.some(v=>v.fact===row.factAddedLater))map.set(row.id,{...old,factRevisions:[...rev,{fact:row.factAddedLater,at:now}]});}}archive[key]=[...map.values()];}
 return normalizeForecast({...next,archive,typicalPlan:next.typicalPlan??pending.typicalPlan??null});
}
export function parseForecastFile(text,name='history.json'){
 const raw=typeof text==='string'?JSON.parse(text):text;if(raw.sheets)return parseWorkbook(raw,name);
 if(raw.format!=='forecast-history-1'||!Array.isArray(raw.days))throw new Error('Нужен XLSX Courier Forecast или JSON формата forecast-history-1. Для полной копии используйте импорт в Истории.');
 return {...raw,source:name,warnings:['Импортируются факты прогноза; выплаты не изменяются.'],summary:importSummary(raw.days)};
}
