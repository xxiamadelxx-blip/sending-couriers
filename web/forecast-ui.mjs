import {emptyForecast,profileFor,planDay,parseWindows,windowsText,saveTimeline,workingMinutes,currentProfile,forecastClock,addDays,minuteLabel,predict,backtest,ensureForecast,evaluateForecasts,weekPlan,saveScenario,parseMinute,saveForecastHours,videoImportReceipt} from './forecast.mjs';
import {parseForecastFile,applyHistory,importSummary} from './forecast-import.mjs';
import {forecastFinances,calculateScenario,calculate,ruNumber,plural,goalText,money,hoursText,formatDate,periodLabel,periodFor,paymentTermsFor} from './core.mjs';
import {durationField,bindDurations,syncDuration} from './duration-control.mjs';
import {icon} from './icons.mjs';
import {intervalField,bindIntervals,intervalValue,setIntervals} from './interval-control.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekdays=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const short=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const num=n=>n==null?'—':ruNumber(n);
const hours=m=>m==null?'—':`${num(m/60)} ч`;
const orderText=n=>n==null?'—':`${num(n)} ${plural(n,['заказ','заказа','заказов'])}`;
const range=p=>p?.central==null?'Нет оценки':`${orderText(p.central)} · ${num(p.lower)}–${num(p.upper)} ${plural(p.upper,['заказ','заказа','заказов'])}`;
const confidence=p=>({rest:'Отдых',insufficient:'Недостаточно истории',low:'Низкая уверенность',limited:'Ограниченная уверенность',moderate:'Личная история'}[p?.confidence]??'Нет оценки');
export const forecastModelLabel=p=>p?.central==null?'':p.selectedModel==='weighted-count-baseline'?(p.timeKind?'Почасовые события учтены · выбран базовый расчёт':'Оценка по дневным итогам · почасовая модель не обучена'):['poisson-offset','negative-binomial','poisson-offset-daily','negative-binomial-daily'].includes(p.selectedModel)?'Почасовая модель по подтверждённым рабочим окнам':'';
const errorHTML='<p class="error" id="forecastError" role="alert" hidden></p>';
const textField=(id,label,value='',type='text',extra='')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" aria-label="${esc(label)}" value="${esc(value)}" ${extra}></div>`;
const metric=(name,value)=>`<div><span>${name}</span><strong>${esc(value)}</strong></div>`;
export function forecastTeaser(state) {
  const data=state.forecast??emptyForecast(),p=currentProfile(data),clock=forecastClock(data),result=predict(data,clock.date);
  return `<button class="forecast-teaser" id="openForecast" type="button"><span>${icon['chart-bar']}<span>Прогноз заказов<strong>${esc(range(result))}</strong></span></span>${icon['chevron-right']}</button>`;
}

function readForecastHours(raw) {if(!raw.trim())return null;const n=Number(raw.replace(',','.'));if(!Number.isFinite(n)||n<0||n>24)throw new Error('Часы: число от 0 до 24.');return Math.round(n*60);}
function planResult(ctx,date,plan,estimate) {
 const terms=paymentTermsFor(ctx.getState(),date),result=calculateScenario({hours:plan.slotMin==null?'':(plan.slotMin/60).toFixed(2),orders:estimate.central??''},terms);
 const risk=plan.workingMin==null||result.hours==null||estimate.central==null?'unknown':result.missingNorm>0?'high':estimate.lower<result.normOrders?'medium':'conditional';
 const label={unknown:'Недостаточно данных для риска',high:'Высокий риск по темпу',medium:'Есть риск по темпу',conditional:'Темп достижим по плану'}[risk];
 return `<p class="forecast-risk" data-risk="${risk}">${label}</p><div class="forecast-metrics">${metric('Прогноз заказов',range(estimate))}${metric('Вне работы',plan.slotMin!=null&&plan.workingMin!=null?hours(Math.max(0,plan.slotMin-plan.workingMin)):'—')}${metric('Нужно для темпа '+goalText(terms.basePace),result.normOrders??'—')}${metric('Темп по слоту',goalText(result.pace))}</div>`;
}
function displayWeekDay(ctx,day) {
 const fact=ctx.data().days[day.date];
 return fact?.ordersConfirmed&&fact.completed&&day.date<=ctx.current().date?{...day,isFact:true,workingMin:fact.workConfirmed?fact.workingMin:null,forecast:{...day.forecast,central:fact.orders,lower:fact.orders,upper:fact.orders}}:day;
}
function periodResult(f) {
 const label={unknown:'Не хватает подтверждённых данных',high:'Высокий риск невыполнения',medium:'Есть риск: порог внутри диапазона',conditional:'Условия достижимы по сценарию',met:'Условия выполнены'}[f.risk];
 return `<p class="forecast-risk" data-risk="${f.risk}">${label}</p><div class="forecast-metrics">${metric('Заказы',f.orders==null?'—':`${f.orders} · ${f.lowerOrders}–${f.upperOrders}`)}${metric('Часы Яндекса',f.hours==null?'—':hoursText(f.hours)+' ч')}${metric('Темп для выплаты',goalText(f.pace))}${metric('До минимума часов',f.missingHours==null?'—':hoursText(f.missingHours)+' ч')}${metric('До нормы заказов',num(f.missingNorm))}${metric('Запас пустых часов',f.reserve==null?'—':hoursText(f.reserve/60)+' ч')}${metric('Почасовая сумма при выполнении',money(f.conditionalIncome))}</div><p class="hint">Условия: ${f.minimumHours} ч · темп ${goalText(f.terms.basePace)}${f.terms.criticalPace!=null?' · критический '+num(f.terms.criticalPace):''}. ${f.belowCritical?'Темп ниже критического. ':''}${f.complete?'Прогнозная выплата не гарантирована.':'Неизвестные дни не заменены нулями.'}</p>`;
}
function createForecastContext(options) {
 const {root,getState,commit,heading,nav,leave,notify,Native}=options,initial=options.initial??'today';
 const ctx={root,getState,commit,heading,nav,leave,notify,Native,updateModel:()=>{},flushPlan:()=>true,modelFailure:false,screen:initial,start:null,overrides:{},dayDate:null,pending:null,weekConfig:null,weekConfigDraftValid:true};
 ctx.$=selector=>root.querySelector(selector);
 ctx.data=()=>getState().forecast??emptyForecast();
 ctx.start=forecastClock(ctx.data()).date;
 ctx.dayDate=ctx.start;
 ctx.weekConfig=ctx.data().weekConfig??null;
 ctx.useWeekConfig=(force=false)=>{if(!ctx.weekConfig)return;for(let i=0;i<7;i++){const date=addDays(ctx.start,i),base=planDay(ctx.data(),date),fact=ctx.data().days[date];if(fact?.completed&&fact.ordersConfirmed&&date<=ctx.current().date||!force&&ctx.data().plans[date])continue;const rest=base.rest&&(base.slotMin??base.accountedMin)===0,workingMin=rest?0:ctx.weekConfig.workingMin,same=base.workingMin===workingMin;ctx.overrides[date]={workingMin,slotMin:rest?0:ctx.weekConfig.slotMin,accountedMin:null,intervals:rest?[]:ctx.weekConfig.intervals??(same?base.intervals.filter(i=>i.state==='WORK'):[]),precision:rest?'total':ctx.weekConfig.precision??(same&&base.intervals.length?'intervals':'total'),accountingAssumption:true};}};
 ctx.current=()=>forecastClock(ctx.data());
 ctx.write=(next,{nowcast=true}={})=>{let f=evaluateForecasts(next);f=ensureForecast(f);if(nowcast)f=ensureForecast(f,new Date(),'NOWCAST');commit({...getState(),forecast:f});};
 ctx.showError=error=>{const element=ctx.$('#forecastError');if(element){element.textContent=error.message;element.hidden=false;}else notify(error.message);};
 ctx.run=fn=>{try{fn();}catch(error){ctx.showError(error);}};
 ctx.shell=(title,body,active=ctx.screen)=>{
  root.className='forecast-page';
  root.innerHTML=`${heading(title)}${['today','week','accuracy','data'].includes(active)?`<nav class="forecast-tabs" aria-label="Прогноз"><button type="button" data-tab="today" ${active==='today'?'aria-current="page"':''}>Сегодня</button><button type="button" data-tab="week" ${active==='week'?'aria-current="page"':''}>Неделя</button></nav>`:''}${body}${['today','week','accuracy','data'].includes(active)?'<div class="forecast-tools"><button type="button" data-tab="accuracy">Точность</button><button type="button" data-tab="data">История и импорт</button></div>':''}`;
  ctx.$('#goBack').onclick=()=>['profile','day','import'].includes(ctx.screen)?ctx.render('today'):leave();
  root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>ctx.render(button.dataset.tab));
  bindDurations(root);bindIntervals(root);nav();window.scrollTo(0,0);
 };
 ctx.readPair=(workId,slotId)=>{const value=ctx.$('#'+workId).closest('[data-interval]')?intervalValue(root,workId):{workingMin:readForecastHours(ctx.$('#'+workId).value)},workingMin=value.workingMin,slotMin=readForecastHours(ctx.$('#'+slotId).value);if(slotMin!=null&&workingMin>slotMin)throw new Error('Рабочее время не может превышать номинальный слот.');return {...value,workingMin,slotMin};};
 ctx.planResult=(date,plan,estimate)=>planResult(ctx,date,plan,estimate);
 ctx.periodResult=periodResult;
 ctx.displayWeekDay=day=>displayWeekDay(ctx,day);
 ctx.readHours=readForecastHours;
 ctx.useWeekConfig();
 return ctx;
}
function receiveForecastImport(ctx,text,name='Courier Forecast') {
 if(!ctx.flushPlan())return;
 ctx.run(()=>{const parsed=parseForecastFile(text,name),merged=applyHistory(ctx.data(),parsed);ctx.write(merged);ctx.views.today();ctx.notify(`История загружена: ${parsed.days.length} ${plural(parsed.days.length,['день','дня','дней'])}`);});
}
function renderForecast(ctx,next=ctx.screen) {
 if(!ctx.flushPlan())return;
 ctx.flushPlan=()=>true;ctx.updateModel=()=>{};ctx.screen=next;
 (ctx.views[ctx.screen]??ctx.views.today)();
}


function videoRecoveryNote(receipt,recovery) {
 if(recovery?.status==='ERROR')return `Ошибка проверки сохранённых данных: ${esc(recovery.error)}`;
 if(!receipt||recovery?.hash!==receipt.sourceHash)return '';
 if(recovery.status==='NO_SAVED_VIDEO')return 'Исходные OCR-кадры этого видео не найдены в приложении.';
 return `Перепроверка сохранённых кадров: ${Number(recovery.frames)||0}; карточек ${Number(recovery.savedDetails)||0}; пар времени ${Number(recovery.timePairs)||0}. В истории уже заполнены обе отметки у ${Number(recovery.alreadyComplete)||0} из ${receipt.orders} заказов; добавлено ${Number(recovery.newRows)||0}. Совпало по номеру ${Number(recovery.matchedByOrderId)||0}, по единственному времени завершения ${Number(recovery.matchedByUniqueCompletion)||0}; неоднозначных совпадений ${Number(recovery.ambiguousMatches)||0}.`;
}

function refreshSimpleForecastPreview(ctx,date,read) {
 const {data,$}=ctx;

      const pair=read(),result=predict(data(),date,planDay(data(),date,{[date]:pair}));
      const count=$('#simpleCount'),band=$('#simpleRange');
      const unknown=result.central==null;
      count.hidden=unknown;
      count.classList.toggle('is-unknown',unknown);
      count.innerHTML=unknown?'—':`${orderText(result.central)}`;
      if(unknown)count.setAttribute('aria-label','Прогноз заказов неизвестен');
      else count.removeAttribute('aria-label');
      band.classList.toggle('forecast-insufficient',unknown);
      if(unknown){
        const title=result.preparing?'Готовим прогноз…':ctx.modelFailure?'Нет прогноза':'Пока мало данных';
        const detail=result.preparing?'Расчёт по истории смен':ctx.modelFailure?'Не удалось рассчитать прогноз. Откройте экран ещё раз.':'Прогноз появится после накопления истории смен';
        band.innerHTML=`<span class="forecast-insufficient-mark" aria-hidden="true"></span><span class="forecast-insufficient-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>`;
      }else band.innerHTML=`<span>Возможный диапазон: ${num(result.lower)}–${num(result.upper)} ${plural(result.upper,['заказ','заказа','заказов'])}</span><details class="forecast-range-help"><summary aria-label="О возможном диапазоне" title="О возможном диапазоне">${icon['info-circle']}</summary><p>Диапазон рассчитан по похожим сменам и отражает неопределённость оценки. Это не предел и не гарантия.</p></details>`;
      $('#forecastError').hidden=true;
      return pair;
  }

function simpleVideoReceiptMarkup(data,receipt) {
  if(!receipt)return '';
  const videoRows=(data.days[receipt.date]?.orderEvidence??[])
    .filter(row=>row.source===`video:${receipt.sourceHash}`)
    .sort((a,b)=>(a.visibleMin??1440)-(b.visibleMin??1440)||a.id.localeCompare(b.id));
  const recoveryNote=videoRecoveryNote(receipt,globalThis.videoRecoveryStatus);
  const shownTime=value=>value==null?'не распознано':minuteLabel(value);
  return '<section class="detail-card forecast-video-summary" id="videoImportReceipt" aria-label="Сводка импорта видео"><h2>Видео за '+esc(formatDate(receipt.date))+'</h2><p>В истории сохранено '+orderText(receipt.orders)+'.</p><p>Время принятия и завершения подтверждено у '+receipt.paired+' '+plural(receipt.paired,['заказ','заказа','заказов'])+'. '+(receipt.conflict?'Есть расхождение источников, проверьте историю.':receipt.workConfirmed?'Рабочее время подтверждено.':'Рабочее время по видео не подтверждено.')+'</p><details><summary>Детали импорта</summary><p>'+orderText(receipt.rows)+' отдельными строками в истории.</p>'+(recoveryNote?'<p role="status">'+recoveryNote+'</p>':'')+(videoRows.length?'<ol>'+videoRows.map(row=>'<li>В списке '+esc(shownTime(row.visibleMin))+' · принят '+esc(shownTime(row.acceptedMin))+' · завершён '+esc(shownTime(row.deliveredMin))+'</li>').join('')+'</ol>':'')+'</details></section>';
}

function simpleView(ctx) {
 const {root,getState,Native,notify,data,current,write,showError,run,shell,readPair}=ctx,{$}=ctx;
    const f=data(),date=current().date,own=f.plans[date],receipt=videoImportReceipt(f);
    const periodProgress=calculate(getState(),periodFor(date).id,date);
    const missingNorm=periodProgress.paymentConditions.missingOrders;
    const periodNorm=missingNorm==null
      ?'<p class="period-norm-copy">Заполните часы и заказы в записях периода, чтобы рассчитать остаток.</p>'
      :`<div class="period-norm-stat"><span>${missingNorm===0?'Норма достигнута':'Заказов до нормы'}</span><strong>${orderText(missingNorm)}</strong></div><p class="period-norm-copy">${orderText(periodProgress.orders)} за ${hoursText(periodProgress.hours)} · цель ${goalText(periodProgress.terms.basePace)} заказа/ч.</p>`;
    let plan;try{plan=planDay(f,date);}catch(error){if(!/Ночная работа пересекает следующий день/.test(error.message))throw error;plan={};}
    const slot=own?.slotMin??f.weekConfig?.slotMin??plan.slotMin??plan.accountedMin??840;
    const work=own?.workingMin??f.weekConfig?.workingMin??plan.workingMin??480;
    shell('Прогноз',`<section class="forecast-simple-hero" aria-live="polite"><p class="forecast-eyebrow">${esc(formatDate(date,true))}</p><h2>Прогноз на сегодня</h2><div class="forecast-number is-unknown" id="simpleCount" aria-label="Прогноз заказов неизвестен">—</div><div class="forecast-band forecast-insufficient" id="simpleRange" role="status"></div></section>
      ${simpleVideoReceiptMarkup(f,receipt)}
      <section class="detail-card forecast-simple-plan"><h2>Моё время</h2>${durationField('todaySlotHours','Полный слот',slot,'',30)}${durationField('todayWorkHours','Из них буду работать',work,'',30)}<p class="forecast-work-note">Время простоя не считается активной работой.</p><p class="error" id="forecastError" role="alert" hidden></p><p class="forecast-saved" id="forecastSaved" role="status" hidden>Время сохранено для следующих дней</p></section>
      <section class="detail-card period-norm-card" aria-labelledby="periodNormTitle"><div><p class="forecast-eyebrow">${esc(periodLabel(periodFor(date)))}</p><h2 id="periodNormTitle">До нормы за период</h2></div>${periodNorm}</section>
      <div class="forecast-import-actions"><button class="button outline forecast-import-button" id="importForecast" type="button">Импортировать отчёт</button><button class="button outline forecast-import-button" id="importForecastVideo" type="button">Импортировать видео</button></div><input id="forecastFile" type="file" accept=".xlsx,.json" hidden>`,'simple');
    // Forecast sliders move in 30-minute increments; numeric inputs accept exact values.
    const slotCaption=$('label[for="todaySlotHours"]');
    if(slotCaption)slotCaption.textContent='Полный слот';
    let saveTimer,dirty=false;
    const read=()=>{const pair=readPair('todayWorkHours','todaySlotHours');if(pair.slotMin==null||pair.workingMin==null)throw new Error('Укажите длительность слота и рабочее время.');return {...pair,intervals:[],precision:'total',mode:'simple'};};
    const preview=()=>refreshSimpleForecastPreview(ctx,date,read);
    const save=pair=>{
      const next=saveForecastHours(data(),date,pair.slotMin,pair.workingMin);
      if(JSON.stringify(next.weekConfig)===JSON.stringify(data().weekConfig)&&JSON.stringify(next.plans[date])===JSON.stringify(data().plans[date]))return;
      write(next,{nowcast:false});
      const status=$('#forecastSaved');if(status){status.hidden=false;setTimeout(()=>{status.hidden=true;},2200);}
    };
    ctx.flushPlan=()=>{
      clearTimeout(saveTimer);
      if(!dirty)return true;
      try{save(read());dirty=false;return true;}catch(error){showError(error);return false;}
    };
    const changed=()=>{clearTimeout(saveTimer);dirty=true;run(()=>{preview();saveTimer=setTimeout(ctx.flushPlan,500);});};
    $('#todayWorkHours').addEventListener('input',changed);
    $('#todaySlotHours').addEventListener('input',changed);
    ctx.updateModel=()=>{ctx.modelFailure=false;run(preview);};run(preview);
    $('#importForecast').onclick=()=>{if(!ctx.flushPlan())return;if(Native?.importForecast)Native.importForecast();else $('#forecastFile').click();};
    $('#importForecastVideo').onclick=()=>{if(!ctx.flushPlan())return;if(typeof Native?.importVideo==='function')Native.importVideo();else notify('Импорт видео доступен в Android-приложении.');};
    $('#forecastFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>8000000)throw new Error('Файл больше 8 МБ.');if(file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Откройте XLSX в Android-приложении.');ctx.receiveImport(await file.text(),file.name);}catch(error){showError(error);}};
  }

function todayView(ctx) {
 const {root,getState,notify,data,current,write,run,shell,readPair}=ctx,{$}=ctx;
    const f=data(),clock=current(),p=profileFor(f,clock.date),morning=f.snapshots.find(s=>s.date===clock.date&&s.kind==='MORNING'),nowcast=f.snapshots.filter(s=>s.date===clock.date&&s.kind==='NOWCAST').at(-1),fact=f.days[clock.date],plan=planDay(f,clock.date),closed=!!(fact?.completed&&fact.ordersConfirmed);
    const estimate=morning?.central!=null?morning:predict(f,clock.date),slot=Object.hasOwn(f.plans[clock.date]??{},'slotMin')?f.plans[clock.date].slotMin:plan.slotMin??plan.accountedMin??f.weekConfig?.slotMin??null;
    shell('Прогноз',`<section class="forecast-hero"><div class="forecast-eyebrow">${esc(formatDate(clock.date,true))}</div><h2>${morning?'Исходный прогноз дня':'За рабочий день'}</h2><div class="forecast-number">${orderText(estimate.central)}</div><div class="forecast-band">${estimate.central==null?esc(confidence(estimate)):`Диапазон ${estimate.lower}–${estimate.upper} · ${esc(confidence(estimate))}`}</div><p class="forecast-model-label" id="todayModelStatus" role="status">${esc(forecastModelLabel(estimate))}</p>${morning?`<p class="hint">Зафиксирован ${esc(new Date(morning.createdAt).toLocaleTimeString('ru-RU',{timeZone:morning.timezone,hour:'2-digit',minute:'2-digit'}))}${morning.partialDayIssue?' · после начала рабочего окна':''}</p>`:''}</section>
      <form id="todayPlan" class="detail-card"><h2>План на сегодня</h2>${durationField('todaySlotHours','Номинальный слот',slot,closed?'disabled':'',30)}${intervalField('todayWorkHours',f.plans[clock.date]?.intervals??plan.intervals,plan.workingMin,closed)}<div id="todayPlanResult"></div><p class="hint">Риск темпа — если весь слот учитывается Яндексом.</p>${errorHTML}<button class="button outline" id="saveTodayPlan" type="submit" ${closed?'disabled':''}>Сохранить план</button></form>
      ${estimate.intervalForecasts?.length?`<section class="detail-card"><h2>По рабочим окнам</h2><table class="forecast-table"><thead><tr><th>Время</th><th>Заказы</th><th>Диапазон</th></tr></thead><tbody>${estimate.intervalForecasts.map(w=>`<tr><td>${esc(minuteLabel(w.start))}–${esc(minuteLabel(w.end))}</td><td>${esc(w.central)}</td><td>${esc(w.lower)}–${esc(w.upper)}</td></tr>`).join('')}</tbody></table></section>`:''}
      ${nowcast?.central!=null?`<section class="detail-card" id="remainingForecast"><h2>Прогноз до конца смены</h2><p class="forecast-subnumber">Ещё ${orderText(nowcast.central)}</p><p class="hint">Диапазон ${nowcast.lower}–${nowcast.upper} · осталось ${hours(nowcast.remainingMin)} работы</p></section>`:''}
      <details class="calculation"><summary>На чём основан прогноз</summary><p>${esc(estimate.reasons?.join('. ')??'')}</p><p>Похожих наблюдений: ${estimate.comparableN??0}. Простая база: ${num(estimate.baseline)}. Модель ${esc(estimate.modelVersion??'—')}.</p><p>История до ${esc(estimate.trainingCutoff??'—')}; профиль v${morning?.profileVersion??p?.version??'—'}. Паузы и неизвестное время не становятся нулевым спросом.</p></details>`);
    const refresh=()=>{const pair=readPair('todayWorkHours','todaySlotHours'),activePlan=planDay(data(),clock.date,{[clock.date]:pair});$('#todayPlanResult').innerHTML=ctx.planResult(clock.date,pair,predict(data(),clock.date,activePlan));$('#forecastError').hidden=true;return pair;};
    ctx.updateModel=()=>{run(refresh);const issue=data().snapshots.find(s=>s.date===clock.date&&s.kind==='MORNING')??predict(data(),clock.date);$('.forecast-number').innerHTML=`${issue.central??'—'}<span> заказов</span>`;$('.forecast-band').textContent=issue.central==null?confidence(issue):`Диапазон ${issue.lower}–${issue.upper} · ${confidence(issue)}`;$('#todayModelStatus').textContent=forecastModelLabel(issue);};$('#todayWorkHours').oninput=()=>run(refresh);$('#todaySlotHours').oninput=()=>run(refresh);run(refresh);
    $('#todayPlan').onsubmit=e=>{e.preventDefault();if(closed)return;run(()=>{const pair=refresh();write({...data(),plans:{...data().plans,[clock.date]:pair}},{nowcast:false});notify('План сохранён');ctx.views.todayPlan();});};
  }

function readDayFactInput(ctx,f,d) {
 const {root,current,readHours}=ctx,{$}=ctx;
 const date=$('#factDate').value,mode=$('#workPrecision').value,orders=$('#factOrders').value.trim();
 if(orders&&!/^\d+$/.test(orders))throw new Error('Количество заказов должно быть целым.');
 let list=mode==='intervals'?[...intervalValue(root,'factWorkHours').intervals,...parseWindows($('#factPause').value,'UNAVAILABLE')]:[];
 if(mode==='intervals'&&!list.some(i=>i.state==='WORK'))throw new Error('Введите рабочие окна или выберите «Не работал».');
 if(mode==='intervals'&&$('#restUnavailable').checked) {
   const report=parseWindows($('#reportWindow').value);if(report.length!==1||report[0].end>1440)throw new Error('Укажите одно окно отчёта внутри суток.');
   const [span]=report;if(list.some(i=>i.start<span.start||i.end>span.end))throw new Error('Рабочие окна выходят за границы отчёта.');
   const boundaries=[span.start,span.end,...list.flatMap(i=>[i.start,i.end])].sort((a,b)=>a-b);
   for(let i=0;i<boundaries.length-1;i++){const a=boundaries[i],b=boundaries[i+1];if(b>a&&!list.some(j=>j.start<=a&&j.end>=b))list.push({start:a,end:b,state:'UNAVAILABLE',paymentCounted:'UNKNOWN'});}
 }
 const total=mode==='total'?readHours($('#factTotal').value):mode==='rest'?0:null;if(mode==='total'&&total==null)throw new Error('Укажите суммарные рабочие часы.');
 const input={date,zone:d?.zone??currentProfile(f)?.zone??'',timezone:d?.timezone??currentProfile(f)?.timezone??'Europe/Moscow',completed:$('#dayCompleted').checked,asOfMinute:parseMinute($('#factAsOf').value),orders:orders===''?null:Number(orders),ordersConfirmed:orders!=='',appAccountedMin:readHours($('#factAccounted').value),accountedConfirmed:$('#factAccounted').value.trim()!=='',
   precision:mode==='rest'?'total':mode,workingMin:total,intervals:list,workConfirmed:mode!=='unknown',source:'manual',sourceConflicts:$('#resolveSources')?.checked?[]:d?.sourceConflicts??[]};
 return {date,input};
}
function saveDayFact(ctx,f,d) {
 const {date,input}=readDayFactInput(ctx,f,d);
 ctx.write(saveTimeline(f,input));ctx.dayDate=date;ctx.render('today');ctx.notify('Факт и уточнение времени сохранены');
}
function updateDayWorkPreview(ctx) {
 const {root,readHours}=ctx,{$}=ctx;
 const mode=$('#workPrecision').value;
 $('#intervalFields').hidden=mode!=='intervals';$('#totalFields').hidden=mode!=='total';
 try{const minutes=mode==='rest'?0:mode==='total'?readHours($('#factTotal').value):mode==='intervals'?intervalValue(root,'factWorkHours').workingMin:null;$('#workingPreview').textContent=`Рабочее время: ${hours(minutes)}`;}catch{$('#workingPreview').textContent='Проверьте интервалы';}
}
function bindDayFactForm(ctx,f,d,plan) {
 const {root}=ctx,{$}=ctx;
 const update=()=>updateDayWorkPreview(ctx);
 $('#workPrecision').onchange=update;$('#factWorkHours').oninput=update;$('#factTotal').oninput=update;update();
 $('#factDate').onchange=()=>{ctx.dayDate=$('#factDate').value;ctx.run(()=>dayView(ctx));};
 $('#usePlannedWork').onclick=()=>{setIntervals(root,'factWorkHours',plan.intervals.filter(i=>i.state==='WORK'),plan.workingMin);$('#factPause').value=windowsText(plan.intervals.filter(i=>i.state==='UNAVAILABLE'));update();};
 $('#workDayForm').onsubmit=e=>{e.preventDefault();ctx.run(()=>saveDayFact(ctx,f,d));};
}

function dayView(ctx) {
 const {data,current,shell}=ctx,{$}=ctx;
 const f=data(),d=f.days[ctx.dayDate],plan=planDay(f,ctx.dayDate);
    shell('Факт дня',`<form id="workDayForm" novalidate>${textField('factDate','Дата',ctx.dayDate,'date')}
      ${textField('factOrders','Заказов за день',d?.orders??'','number','min="0" max="1000000" step="1" inputmode="numeric"')}${durationField('factAccounted','Учтено Яндексом',d?.appAccountedMin??null,'',30)}
      <div class="field"><label for="workPrecision">Фактическое рабочее время</label><select class="period-select" id="workPrecision"><option value="intervals">Знаю интервалы</option><option value="total">Знаю только сумму часов</option><option value="rest">Не работал</option><option value="unknown">Пока неизвестно</option></select></div>
      <div id="intervalFields">${intervalField('factWorkHours',d?.intervals?.filter(i=>i.state==='WORK')??[],d?.workingMin??null)}${textField('factPause','Личная пауза без доставки',windowsText(d?.intervals?.filter(i=>i.state==='UNAVAILABLE')),'text','placeholder="Можно оставить пустым"')}<button id="usePlannedWork" class="button quiet" type="button">Подставить мой план для подтверждения</button><details class="calculation"><summary>Остальное время отчёта</summary>${textField('reportWindow','Окно отчёта','', 'text','placeholder="07:00–21:00"')}<label class="forecast-checkbox"><input id="restUnavailable" type="checkbox">В остальное время не работал и не выполнял доставку</label></details></div>
      <div id="totalFields">${textField('factTotal','Всего рабочих часов',d?.workingMin==null?'':num(d.workingMin/60),'text','inputmode="decimal"')}</div>
      <p id="workingPreview" class="forecast-working-preview" role="status"></p>
      ${d?`<details class="calculation"><summary>Источник и уточнения</summary><p>${esc(d.source)} · ревизия ${d.revision}</p><p>RAW: ${d.orderEvidence.length}/${d.orders??'—'} · перечень ${d.rawComplete?'полный':'частичный'} · принятия/доставки ${d.evidenceComplete?'полные':'частичные'}</p><p>На заказах: ${hours(d.onOrderMin)} · ожидание без заказа: ${hours(d.availableNoOrderMin)}</p><p>Исправлений времени: ${d.revisions.length}</p></details>`:''}
      ${d?.conflicts.length?`<p class="field-warning">${esc(d.conflicts.join(' '))}</p><label class="forecast-checkbox"><input type="checkbox" id="resolveSources">Подтверждаю выбранный итог вместо расходящихся источников</label>`:''}<label class="forecast-checkbox"><input type="checkbox" id="dayCompleted" ${(d?.completed??ctx.dayDate<current().date)?'checked':''}>День завершён, это полный итог</label>${textField('factAsOf','Данные на время',minuteLabel(d?.asOfMinute??current().minute),'time')}${errorHTML}<button class="button primary" id="saveWorkDay" type="submit">Сохранить факт</button></form>`,'day');
    $('#workPrecision').value=d?.precision==='total'?'total':d?.workConfirmed&&d.workingMin===0?'rest':d?.precision==='intervals'?'intervals':'unknown';
    bindDayFactForm(ctx,f,d,plan);
  }
function weekMarkup(ctx,week,result,daySlot,dayNote,totals,weekModel) {
    const data=ctx.data;
    return `<div class="forecast-datebar">${textField('weekStart','С даты',ctx.start,'date')}<button class="button quiet" id="resetWeek" type="button">Сбросить</button></div><p class="forecast-model-label" id="weekModelStatus" role="status">${esc(forecastModelLabel(weekModel()))}</p>
      <section class="detail-card week-config"><h2>По умолчанию на день</h2><div class="week-presets"><button type="button" data-slot-preset="9" aria-pressed="${ctx.weekConfig?.slotMin===540}">Слот 9 ч</button><button type="button" data-slot-preset="14" aria-pressed="${ctx.weekConfig?.slotMin===840}">Слот 14 ч</button></div>${durationField('weekSlotHours','Номинальный слот',ctx.weekConfig?.slotMin??null,'',30)}${intervalField('weekActiveHours',ctx.weekConfig?.intervals??(ctx.weekConfig?[]:week.days.find(d=>!d.isFact)?.intervals??[]),ctx.weekConfig?ctx.weekConfig.workingMin:week.days.find(d=>!d.isFact)?.workingMin??null)}<p class="duration-step-hint">Шаг 30 минут · точный ввод в поле</p></section><p class="hint">Риск выплаты — если весь слот учитывается Яндексом.</p>
      <details class="week-editor" open><summary>Настроить отдельные дни</summary><section class="week-planner">${week.days.map((d,i)=>`<details class="detail-card week-day"><summary><span>${short[(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7]} · ${esc(formatDate(d.date))}</span><strong id="dayEstimate${i}">${orderText(d.forecast.central)}</strong></summary>${durationField(`weekSlot${i}`,'Номинальный слот',daySlot(d),`data-week-slot="${i}" ${d.isFact?'disabled':''}`,30)}${intervalField(`weekWork${i}`,ctx.overrides[d.date]?.intervals??data().plans[d.date]?.intervals??d.intervals,d.workingMin,d.isFact)}<p class="hint" id="weekBand${i}">${d.isFact?'Завершённый факт · ':''}${esc(range(d.forecast))}</p><p class="hint" id="weekAssumption${i}">${esc(dayNote(d))}</p><div id="weekRisk${i}">${d.isFact?'':ctx.planResult(d.date,{workingMin:d.workingMin,slotMin:daySlot(d)},d.forecast)}</div></details>`).join('')}</section></details>
      <section class="detail-card"><h2>Эта неделя · условный расчёт</h2><div id="weekDurationTotals">${totals(result)}</div><div id="weekTotals">${ctx.periodResult(result.weekFinancial)}</div></section>
      <section class="detail-card"><h2>Расчётный период</h2><p class="hint">${esc(periodLabel(ctx.start))}</p><div id="periodForecast">${ctx.periodResult(result.fortnight)}</div></section>
      <div class="forecast-actions"><button id="saveWeek" class="button primary" type="button">Сохранить сценарий</button><button id="compareWeek" class="button outline" type="button">Сравнить с моим графиком</button></div><div id="scenarioComparison"></div>${data().scenarios.length?`<details class="calculation"><summary>Сохранённые сценарии</summary>${data().scenarios.slice(-5).reverse().map(s=>`<button class="button quiet" type="button" data-load-scenario="${esc(s.id)}">${esc(s.name)} · ${esc(formatDate(s.start))}</button>`).join('')}</details>`:''}${errorHTML}`;
  }

function weekView(ctx) {
 const {root,getState,notify,data,current,write,run,shell,readPair}=ctx,{$}=ctx;
    const conditional={};
    const rebuild=()=>{const w=weekPlan(data(),ctx.start,ctx.overrides);for(const d of w.days)conditional[d.date]={...d,slotMin:d.slotMin??d.accountedMin,accountedMin:d.accountedMin??d.slotMin,accountingAssumption:d.accountedMin==null};return w;};
    const base=rebuild(),result=forecastFinances(getState(),ctx.start,conditional,current().date),week={...base,days:base.days.map(ctx.displayWeekDay)};
    const daySlot=d=>d.isFact?(data().days[d.date].accountedConfirmed?data().days[d.date].appAccountedMin:null):conditional[d.date].slotMin;
    const dayNote=d=>d.isFact?'Завершённый факт':`Вне работы: ${d.workingMin!=null&&daySlot(d)!=null?hours(Math.max(0,daySlot(d)-d.workingMin)):'—'}`;
    const totals=r=>`<div class="forecast-metrics duration-totals">${metric('Работа на неделю',hours(r.week.workingMin))}${metric('Слоты на неделю',hours(r.week.accountedMin))}${metric('Вне работы',r.week.workingMin!=null&&r.week.accountedMin!=null?hours(Math.max(0,r.week.accountedMin-r.week.workingMin)):'—')}</div>`;
    const weekModel=()=>week.days.find(d=>!d.isFact&&d.forecast.central!=null)?.forecast;
    shell('План на 7 дней',weekMarkup(ctx,week,result,daySlot,dayNote,totals,weekModel));
    $('#weekStart').onchange=()=>run(()=>{ctx.start=$('#weekStart').value;ctx.overrides={};ctx.useWeekConfig();ctx.views.week();});$('#resetWeek').onclick=()=>{ctx.overrides={};ctx.weekConfig=null;ctx.weekConfigDraftValid=true;ctx.views.week();};
    const refresh=()=>{
      const w=rebuild(),r=forecastFinances(getState(),ctx.start,conditional,current().date);$('#weekTotals').innerHTML=ctx.periodResult(r.weekFinancial);$('#periodForecast').innerHTML=ctx.periodResult(r.fortnight);$('#weekDurationTotals').innerHTML=totals(r);$('#weekModelStatus').textContent=forecastModelLabel(w.days.map(ctx.displayWeekDay).find(d=>!d.isFact&&d.forecast.central!=null)?.forecast);
      w.days.map(ctx.displayWeekDay).forEach((d,i)=>{$(`#dayEstimate${i}`).textContent=`${orderText(d.forecast.central)}`;$(`#weekBand${i}`).textContent=(d.isFact?'Завершённый факт · ':'')+range(d.forecast);$(`#weekAssumption${i}`).textContent=dayNote(d);$(`#weekRisk${i}`).innerHTML=d.isFact?'':ctx.planResult(d.date,{workingMin:d.workingMin,slotMin:daySlot(d)},d.forecast);});$('#forecastError').hidden=true;
    };
    ctx.updateModel=()=>run(refresh);
    const applyCommon=()=>{
      ctx.weekConfigDraftValid=false;const next=readPair('weekActiveHours','weekSlotHours');ctx.weekConfig=next;ctx.weekConfigDraftValid=true;ctx.useWeekConfig(true);
      for(let i=0;i<7;i++){const d=week.days[i],v=ctx.overrides[d.date];if(v&&!d.isFact){setIntervals(root,`weekWork${i}`,v.intervals??[],v.workingMin);$(`#weekSlot${i}`).value=v.slotMin==null?'':String(v.slotMin/60);syncDuration(root,`weekSlot${i}`);}}
      refresh();root.querySelectorAll('[data-slot-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.slotPreset)*60===ctx.weekConfig.slotMin)));
    };
    $('#weekActiveHours').oninput=()=>run(applyCommon);$('#weekSlotHours').oninput=()=>run(applyCommon);
    root.querySelectorAll('[data-slot-preset]').forEach(b=>b.onclick=()=>run(()=>{$('#weekSlotHours').value=b.dataset.slotPreset;syncDuration(root,'weekSlotHours');applyCommon();}));
    week.days.forEach((d,i)=>{$(`#weekWork${i}`).dataset.weekWork=i;});
    root.querySelectorAll('[data-week-work],[data-week-slot]').forEach(input=>input.oninput=()=>run(()=>{
      const i=Number(input.dataset.weekWork??input.dataset.weekSlot),d=week.days[i],pair=readPair(`weekWork${i}`,`weekSlot${i}`);
      ctx.overrides[d.date]={...pair,accountedMin:null,accountingAssumption:true};refresh();
    }));
    $('#saveWeek').onclick=()=>run(()=>{
      if(!ctx.weekConfigDraftValid)throw new Error('Проверьте часы работы и номинального слота.');
      week.days.forEach((d,i)=>{if(!d.isFact)readPair(`weekWork${i}`,`weekSlot${i}`);});
      const next=saveScenario(data(),`План ${data().scenarios.length+1}`,ctx.start,ctx.overrides),plans={...data().plans};
      for(const [date,p] of Object.entries(ctx.overrides))if(date>=current().date&&!(data().days[date]?.completed&&data().days[date]?.ordersConfirmed))plans[date]={workingMin:p.workingMin,slotMin:p.slotMin,intervals:p.intervals??[],precision:p.precision??'total'};
      write({...next,plans,weekConfig:ctx.weekConfig},{nowcast:false});notify('Сценарий сохранён');ctx.views.week();
    });
    $('#compareWeek').onclick=()=>run(()=>{const a=forecastFinances(getState(),ctx.start,{},current().date),b=forecastFinances(getState(),ctx.start,conditional,current().date);$('#scenarioComparison').innerHTML=`<section class="detail-card"><h2>Сравнение</h2><table class="forecast-table"><thead><tr><th>Показатель</th><th>Мой график</th><th>Сценарий</th></tr></thead><tbody><tr><td>Заказы недели</td><td>${a.week.central??'—'}</td><td>${b.week.central??'—'}</td></tr><tr><td>Темп периода</td><td>${goalText(a.fortnight.pace)}</td><td>${goalText(b.fortnight.pace)}</td></tr></tbody></table></section>`;});
    root.querySelectorAll('[data-load-scenario]').forEach(b=>b.onclick=()=>{const s=data().scenarios.find(s=>s.id===b.dataset.loadScenario);ctx.start=s.start;ctx.overrides=JSON.parse(JSON.stringify(s.overrides));ctx.views.week();});
  }

function accuracyMetricsMarkup(q) {
 return `<div class="forecast-metrics">${metric('Проверенных дней',q.n)}${metric('Средняя ошибка, заказов',num(q.mae))}${metric('Смещение',num(q.bias))}${metric('Ошибка простой базы',num(q.baselineMAE))}${metric('WAPE',q.wape==null?'—':num(q.wape*100)+'%')}${metric('Попадание в диапазон',q.coverage==null?'—':num(q.coverage*100)+'%')}</div>`;
}
function accuracyEvaluationsMarkup(f) {
 const prospective=f.evaluations.filter(e=>e.prospective);
 const rows=f.evaluations.length
  ?f.evaluations.slice(-12).reverse().map(e=>`<div class="forecast-audit-row"><strong>${esc(formatDate(e.factDate))} · факт v${e.factRevision}</strong><span>Факт ${e.fact}, ошибка ${num(e.signedError)} · ${e.covered?'в диапазоне':'вне диапазона'}${e.prospective?'':' · поздняя фиксация'}</span></div>`).join('')
  :'<p class="hint">Оценка появится после подтверждения итога прошедшего дня.</p>';
 return `<p>${f.snapshots.filter(s=>s.kind==='MORNING').length} исходных прогнозов · ${prospective.length} оценок до начала работы</p>${rows}`;
}
function archivedAccuracyMarkup(f) {
 const forecasts=f.archive?.forecasts??[];
 const rows=forecasts.filter(r=>r.central!=null).slice(-8).reverse().map(r=>`<div class="forecast-audit-row"><strong>${esc(r.date)} · ${esc(r.interval)}</strong><span>Прогноз ${esc(r.central)} [${esc(r.lower??'—')}–${esc(r.upper??'—')}] · факт ${esc(r.factAddedLater??'—')} · ошибка ${num(r.absoluteError)}</span></div>`).join('');
 return `<p>${f.archive?.forecasts?.length??0} прогнозов · ${f.archive?.accuracy?.length??0} записей точности</p>${rows}<p class="hint">Архивные записи отделены от независимой проверки новой модели.</p>`;
}
function modelVersionsMarkup(f) {
 return f.models.slice(-8).reverse().map(m=>`<p>${esc(m.modelVersion)} · до ${esc(m.trainingDataCutoff)} · ${esc(m.sourceHash)}</p>`).join('');
}
function accuracyView(ctx) {
 const {data,current,shell}=ctx;
 const f=data(),q=backtest(f,current().date);
 shell('Точность прогноза',`<section class="detail-card"><h2>Проверка по прошлым дням</h2>${accuracyMetricsMarkup(q)}<p class="hint">Каждый день проверяется только по более ранней истории. ${q.n<20?'Истории мало; вероятности выполнения условий пока не показываются.':'Диапазон отражает наблюдаемую изменчивость, без обещания гарантии.'}</p></section>
      <section class="detail-card"><h2>Зафиксированные выпуски</h2>${accuracyEvaluationsMarkup(f)}</section><section class="detail-card"><h2>Архив из отчёта</h2>${archivedAccuracyMarkup(f)}</section><details class="calculation"><summary>Версии модели</summary>${modelVersionsMarkup(f)}</details>${errorHTML}`);
  }

function dataView(ctx) {
 const {root,data,shell,Native,current}=ctx,{$}=ctx;
    const f=data(),days=Object.values(f.days).sort((a,b)=>b.date.localeCompare(a.date)),quality=importSummary(days);
    shell('История прогноза',`<div class="forecast-actions"><button class="button primary" id="newWorkFact" type="button">Добавить факт дня</button><button class="button outline" id="importForecast" type="button">Загрузить историю XLSX / JSON</button></div><input id="forecastFile" type="file" accept=".xlsx,.json" hidden><p class="hint">Сохранены только подтверждённые факты; неизвестные часы остаются неизвестными.</p><details class="calculation import-quality-details"><summary>Состав импортированной истории</summary><p>Даты: ${quality.dates} · события: ${quality.events} · подтверждённые часы: ${quality.working.CONFIRMED} · реконструкции: ${quality.working.RECONSTRUCTED} · без часов: ${quality.working.UNKNOWN} · расхождения: ${quality.conflicts}</p><p id="orderTimeCoverage">Отметки времени: список ${quality.time.visible}, принятие ${quality.time.accepted}, доставка ${quality.time.delivered}, все отметки ${quality.time.paired}. Они не заменяют подтверждённые рабочие часы.</p></details><div id="forecastImportPreview"></div>
      <section>${days.length?days.slice(0,150).map(d=>`<button class="forecast-day-row" data-edit-fact="${d.date}" type="button"><span><strong>${esc(formatDate(d.date,true))}</strong><small>${orderText(d.orders)}${d.ordersConfirmed?'':' · не подтверждено'} · работа ${hours(d.workingMin)}${d.workConfirmed?'':d.workingMin==null?' · неизвестно':' · реконструкция'}${d.conflicts.length?' · конфликт':''}</small></span>${icon['chevron-right']}</button>`).join(''):'<div class="detail-card"><h2>Личная история пока пуста</h2><p>Загрузите историю или добавьте факт дня.</p></div>'}</section>${errorHTML}`);
    $('#newWorkFact').onclick=()=>{ctx.dayDate=current().date;ctx.render('day');};
    $('#importForecast').onclick=()=>{if(Native?.importForecast)Native.importForecast();else $('#forecastFile').click();};
    $('#forecastFile').onchange=async e=>{const file=e.target.files[0];if(file){try{if(file.size>8000000)throw new Error('Файл больше 8 МБ.');if(file.name.endsWith('.xlsx'))throw new Error('XLSX читается в Android-приложении. В браузере доступен JSON истории.');ctx.receiveImport(await file.text(),file.name);}catch(error){showError(error);}}};
    root.querySelectorAll('[data-edit-fact]').forEach(b=>b.onclick=()=>{ctx.dayDate=b.dataset.editFact;ctx.render('day');});
  }

export function mountForecast(options) {
 const ctx=createForecastContext(options);
 ctx.views={today:()=>simpleView(ctx),todayPlan:()=>todayView(ctx),day:()=>dayView(ctx),week:()=>weekView(ctx),accuracy:()=>accuracyView(ctx),data:()=>dataView(ctx)};
 ctx.render=(next=ctx.screen)=>renderForecast(ctx,next);
 ctx.receiveImport=(text,name)=>receiveForecastImport(ctx,text,name);
 ctx.render();
 return {receiveImport:ctx.receiveImport,refresh:()=>ctx.render(ctx.screen),flush:()=>ctx.flushPlan(),modelReady:()=>ctx.updateModel(),modelFailed:()=>{ctx.modelFailure=true;const status=ctx.$('#simpleRange');if(status)status.textContent='Не удалось рассчитать прогноз. Откройте приложение ещё раз.';},back:()=>{if(!ctx.flushPlan())return true;if(ctx.screen!=='today'){ctx.render('today');return true;}return false;}};
}