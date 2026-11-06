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
function emptyWorkbookDay(date,source){
 return {date,orders:null,ordersConfirmed:false,workingMin:null,workConfirmed:false,precision:'unknown',appAccountedMin:null,accountedConfirmed:false,intervals:[],estimatedIntervals:[],orderEvidence:[],source:`sheets_import:${source}`,sourceConflicts:[],fieldSources:{},sourceNotes:[]};
}
function parseDailySummaryRows(rows,source,getDay){
 let formulaRows=0;
 for(const [i,raw] of Object.entries(rows??{})){
  if(Number(i)<2)continue;
  const r=cells(raw),date=dateValue(r.A);if(!date){formulaRows++;continue;}
  const d=getDay(date),work=hours(r.O),accounted=hours(r.Q),note=text(r.N,r.S),rowSource=`${source}:Дневные итоги!${i}`;
  if(Number.isInteger(n(r.E))){d.orders=r.E;d.ordersConfirmed=true;d.fieldSources.orders=sourceField(r.E,'CONFIRMED',rowSource);}
  d.zone=String(r.L??'');d.sourceNotes.push(note);
  if(work!=null){const status=workStatus(work,note);d.workingMin=work;d.workConfirmed=status==='CONFIRMED';d.precision='total';d.fieldSources.workingMin=sourceField(work,status,rowSource,note);}
  if(accounted!=null){const status=/(?:^|[.;])\\s*точные учитываемые часы подтверждены пользователем/iu.test(note)?'CONFIRMED':'RECONSTRUCTED';d.appAccountedMin=accounted;d.accountedConfirmed=status==='CONFIRMED';d.fieldSources.appAccountedMin=sourceField(accounted,status,rowSource,note);}
  // C/D are slot boundaries; G is money. Neither is working/accounted exposure.
 }
 return formulaRows;
}
function collectShiftRows(rows,source,getDay){
 const shifts=new Map();
 for(const [i,raw] of Object.entries(rows??{})){
  if(Number(i)<2)continue;
  const r=cells(raw),date=dateValue(r.A);if(!date)continue;
  const note=text(r.O,r.P),start=minute(r.C),end=minute(r.D),work=hours(r.E),status=workStatus(work,note);
  const slotRange=start!=null&&end!=null&&end>start?{start,end,state:'WORK',paymentCounted:'UNKNOWN'}:null;
  // C/D are nominal slot boundaries. Only an explicit interval matching E is confirmed WORK.
  const range=status==='CONFIRMED'?confirmedWindow(work,note):slotRange;
  const part={orders:n(r.G),work,accounted:hours(r.F),range,status,note,source:`${source}:Смены!${i}`};
  const values=shifts.get(date)??[];values.push(part);shifts.set(date,values);
  const d=getDay(date);if(!d.zone&&r.M)d.zone=String(r.M);d.sourceNotes.push(note);
 }
 return shifts;
}
function sumShiftField(values,key){
 return values.every(value=>value[key]!=null)?values.reduce((sum,value)=>sum+value[key],0):null;
}
function mergeShiftOrders(day,orders,rowSource){
 if(day.orders==null&&Number.isInteger(orders)){day.orders=orders;day.ordersConfirmed=true;day.fieldSources.orders=sourceField(orders,'CONFIRMED',rowSource);}
 else if(orders!=null&&day.orders!==orders)day.sourceConflicts.push(`Листы расходятся по заказам: ${day.orders} и ${orders}.`);
}
function mergeShiftWork(day,{values,work,allConfirmed,ranges,note,rowSource}){
 if(work==null||work>1440)return;
 if(day.workingMin!=null&&Math.abs(day.workingMin-work)>2)day.sourceConflicts.push('Листы расходятся по рабочим часам.');
 if(day.workingMin==null||allConfirmed){day.workingMin=work;day.workConfirmed=allConfirmed;day.precision='total';day.fieldSources.workingMin=sourceField(work,allConfirmed?'CONFIRMED':'RECONSTRUCTED',rowSource,note);}
 if(ranges.length===values.length){if(allConfirmed){day.intervals=ranges;day.precision='intervals';}else day.estimatedIntervals=ranges;}
 day.estimatedExposureJustified=!allConfirmed&&!unknown.test(note)&&ranges.length===values.length;
}
function mergeShiftAccounted(day,accounted,allConfirmed,rowSource,note){
 if((day.appAccountedMin==null||allConfirmed&&day.appAccountedMin===accounted)&&accounted!=null&&accounted<=1440){
  day.appAccountedMin=accounted;day.accountedConfirmed=allConfirmed;
  day.fieldSources.appAccountedMin=sourceField(accounted,allConfirmed?'CONFIRMED':'RECONSTRUCTED',rowSource,note);
 }
}
function hasOverlappingConfirmedShifts(values){
 const ranges=values.filter(value=>value.range&&value.status==='CONFIRMED').map(value=>value.range).sort((a,b)=>a.start-b.start);
 return ranges.some((range,index)=>index>0&&range.start<ranges[index-1].end);
}
function applyShiftOverlapConflict(day,rowSource,note){
 day.sourceConflicts.push('Подтверждённые рабочие окна пересекаются; уточните фактическое время.');
 day.workConfirmed=false;day.precision='total';day.intervals=[];
 day.fieldSources.workingMin=sourceField(day.workingMin,'CONFLICT',rowSource,note);
 day.exposureBlocks=[];
}
function mergeShiftDay(date,values,getDay){
 const day=getDay(date),orders=sumShiftField(values,'orders'),work=sumShiftField(values,'work'),accounted=sumShiftField(values,'accounted');
 const note=values.map(value=>value.note).join(' '),rowSource=values.map(value=>value.source).join(';');
 const allConfirmed=values.every(value=>value.status==='CONFIRMED'),ranges=values.filter(value=>value.range).map(value=>value.range);
 mergeShiftOrders(day,orders,rowSource);
 mergeShiftWork(day,{values,work,allConfirmed,ranges,note,rowSource});
 mergeShiftAccounted(day,accounted,allConfirmed,rowSource,note);
 if(hasOverlappingConfirmedShifts(values))applyShiftOverlapConflict(day,rowSource,note);
 else day.exposureBlocks=values.filter(value=>value.range&&value.status==='CONFIRMED').map(value=>({...value.range,orders:value.orders,status:'CONFIRMED',source:value.source}));
}
function parseShiftRows(sheets,source,getDay){
 const shifts=collectShiftRows(sheets['Смены'],source,getDay);
 for(const [date,values] of shifts)mergeShiftDay(date,values,getDay);
}
function workbookOrderEvidence(row,date,index,ordinal){
 const visibleMin=minute(row.C),acceptedMin=minute(row.L);let deliveredMin=minute(row.M);
 if(deliveredMin!=null&&acceptedMin!=null&&deliveredMin<acceptedMin)deliveredMin+=1440;
 const key=fingerprint([date,visibleMin,row.E,row.J]),occurrence=(ordinal.get(key)??0)+1;ordinal.set(key,occurrence);
 const id=Number.isInteger(row.D)&&row.D>0?`xlsx-${date}-order-${row.D}`:`xlsx-${date}-${key}-${occurrence}`;
 const highConfidence=/(?:высок|high)/iu.test(String(row.K??''));
 return {id,orderNumber:Number.isInteger(row.D)?row.D:null,visibleMin,acceptedMin,deliveredMin,source:text(row.J,`Заказы RAW!${index}`),confidence:String(row.K??''),note:String(row.O??''),workingInterval:String(row.F??''),confirmed:highConfidence,
  fieldSources:Object.fromEntries([['visibleMin',visibleMin],['acceptedMin',acceptedMin],['deliveredMin',deliveredMin]].map(([field,value])=>[field,{status:value==null?'UNKNOWN':highConfidence?'CONFIRMED':'RECONSTRUCTED',source:`Заказы RAW!${index}`}])),
  completeness:acceptedMin!=null&&deliveredMin!=null?'FULL':'PARTIAL'};
}
function parseRawOrderRows(rows,getDay){
 const ordinal=new Map();
 for(const [i,raw] of Object.entries(rows??{})){
  if(Number(i)<2)continue;
  const r=cells(raw),date=dateValue(r.A);if(!date)continue;
  const day=getDay(date);day.orderEvidence.push(workbookOrderEvidence(r,date,i,ordinal));
  if(r.I&&!day.zone)day.zone=String(r.I);
 }
}
function completeWorkbookDays(days){
 for(const day of days.values()){
  day.evidenceComplete=day.ordersConfirmed&&day.orders===day.orderEvidence.length&&day.orderEvidence.every(order=>order.acceptedMin!=null&&order.deliveredMin!=null);
  if(day.orders!=null&&day.orderEvidence.length>day.orders)day.sourceConflicts.push(`RAW содержит ${day.orderEvidence.length} заказов, итог ${day.orders}.`);
  for(const key of ['orders','workingMin','appAccountedMin'])day.fieldSources[key]??=sourceField(day[key],'UNKNOWN',day.source);
 }
}
function workbookTypicalPlan(sheets,days,source){
 const settings=Object.values(sheets['Настройки']??{}).map(cells);
 const windows=settings.filter(row=>/обычное.*окно/i.test(row.A)).flatMap(row=>{try{return parseWindows(row.B);}catch{return [];}});
 const zone=[...days.values()].filter(day=>day.zone).at(-1)?.zone??'';
 return windows.length?{intervals:windows,timezone:'Europe/Moscow',zone,source:`${source}:Настройки`,status:'RECONSTRUCTED'}:null;
}
function workbookArchive(sheets,source){
 const archive={forecasts:archiveRows(sheets,'Прогнозы',source),accuracy:archiveRows(sheets,'Точность',source),models:archiveRows(sheets,'Модели',source),financialRules:archiveRows(sheets,'Финансовые правила',source)};
 for(const row of archive.forecasts){
  const value=row.values;row.date=dateValue(value.A);row.central=n(value.D);row.lower=n(value.E);row.upper=n(value.F);row.interval=String(value.C??'');row.recordedAt=String(value.Q??'');row.modelVersion=String(value.R??value.J??'archive');row.factAddedLater=n(value.M);row.absoluteError=row.central!=null&&row.factAddedLater!=null?Math.abs(row.central-row.factAddedLater):null;row.percentageError=row.factAddedLater>0?row.absoluteError/row.factAddedLater:null;row.prospective=false;
 }
 return archive;
}
export function parseWorkbook(workbook,source='Courier Forecast.xlsx'){
 if(!workbook?.sheets||typeof workbook.sheets!=='object')throw new Error('Не удалось прочитать листы XLSX.');
 const sheets=workbook.sheets,days=new Map();
 const getDay=date=>{if(!days.has(date))days.set(date,emptyWorkbookDay(date,source));return days.get(date);};
 const formulaRows=parseDailySummaryRows(sheets['Дневные итоги'],source,getDay);
 parseShiftRows(sheets,source,getDay);
 parseRawOrderRows(sheets['Заказы RAW'],getDay);
 completeWorkbookDays(days);
 const typicalPlan=workbookTypicalPlan(sheets,days,source),archive=workbookArchive(sheets,source);
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
