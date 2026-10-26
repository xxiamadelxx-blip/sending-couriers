import {emptyForecast,profileFor,planDay,parseWindows,windowsText,saveTimeline,workingMinutes,currentProfile,forecastClock,addDays,minuteLabel,predict,backtest,ensureForecast,evaluateForecasts,weekPlan,saveScenario,parseMinute,saveForecastHours} from './forecast.mjs';
import {parseForecastFile,applyHistory,importSummary} from './forecast-import.mjs';
import {forecastFinances,calculateScenario,money,hoursText,formatDate,periodLabel,paymentTermsFor} from './core.mjs';
import {durationField,bindDurations,syncDuration} from './duration-control.mjs';
import {icon} from './icons.mjs';
import {intervalField,bindIntervals,intervalValue,setIntervals} from './interval-control.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekdays=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const short=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const num=n=>n==null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
const hours=m=>m==null?'—':`${num(m/60)} ч`;
const range=p=>p?.central==null?'Нет оценки':`${p.central} заказов · ${p.lower}–${p.upper}`;
const confidence=p=>({rest:'Отдых',insufficient:'Недостаточно истории',low:'Низкая уверенность',limited:'Ограниченная уверенность',moderate:'Личная история'}[p?.confidence]??'Нет оценки');
export const forecastModelLabel=p=>p?.central==null?'':p.selectedModel==='weighted-count-baseline'?(p.timeKind?'Почасовые события учтены · выбран базовый расчёт':'Оценка по дневным итогам · почасовая модель не обучена'):['poisson-offset','negative-binomial'].includes(p.selectedModel)?'Почасовая модель по подтверждённым рабочим окнам':'';
const errorHTML='<p class="error" id="forecastError" role="alert" hidden></p>';
const textField=(id,label,value='',type='text',extra='')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" aria-label="${esc(label)}" value="${esc(value)}" ${extra}></div>`;
const metric=(name,value)=>`<div><span>${name}</span><strong>${esc(value)}</strong></div>`;
export function forecastTeaser(state) {
  const data=state.forecast??emptyForecast(),p=currentProfile(data),clock=forecastClock(data),result=predict(data,clock.date);
  return `<button class="forecast-teaser" id="openForecast" type="button"><span>${icon['chart-bar']}<span>Прогноз заказов<strong>${esc(range(result))}</strong></span></span>${icon['chevron-right']}</button>`;
}
export function mountForecast({root,getState,commit,heading,nav,leave,notify,Native,initial='today'}) {
  const $=s=>root.querySelector(s),data=()=>getState().forecast??emptyForecast();
  let updateModel=()=>{},flushPlan=()=>true,modelFailure=false,screen=initial,start=forecastClock(data()).date,overrides={},dayDate=start,pending=null,weekConfig=data().weekConfig??null,weekConfigDraftValid=true;
  const useWeekConfig=(force=false)=>{if(!weekConfig)return;for(let i=0;i<7;i++){const date=addDays(start,i),base=planDay(data(),date),fact=data().days[date];if(fact?.completed&&fact.ordersConfirmed&&date<=forecastClock(data()).date||!force&&data().plans[date])continue;const rest=base.rest&&(base.slotMin??base.accountedMin)===0,workingMin=rest?0:weekConfig.workingMin,same=base.workingMin===workingMin;overrides[date]={workingMin,slotMin:rest?0:weekConfig.slotMin,accountedMin:null,intervals:rest?[]:weekConfig.intervals??(same?base.intervals.filter(i=>i.state==='WORK'):[]),precision:rest?'total':weekConfig.precision??(same&&base.intervals.length?'intervals':'total'),accountingAssumption:true};}};useWeekConfig();
  const current=()=>forecastClock(data());
  const write=(next,{nowcast=true}={})=>{
    let f=evaluateForecasts(next);f=ensureForecast(f);
    if(nowcast)f=ensureForecast(f,new Date(),'NOWCAST');
    commit({...getState(),forecast:f});
  };
  const showError=error=>{const e=$('#forecastError');if(e){e.textContent=error.message;e.hidden=false;}else notify(error.message);};
  const run=fn=>{try{fn();}catch(e){showError(e);}};
  function shell(title,body,active=screen) {
    root.className='forecast-page';
    root.innerHTML=`${heading(title)}${['today','week','accuracy','data'].includes(active)?`<nav class="forecast-tabs" aria-label="Прогноз"><button type="button" data-tab="today" ${active==='today'?'aria-current="page"':''}>Сегодня</button><button type="button" data-tab="week" ${active==='week'?'aria-current="page"':''}>Неделя</button></nav>`:''}${body}${['today','week','accuracy','data'].includes(active)?'<div class="forecast-tools"><button type="button" data-tab="accuracy">Точность</button><button type="button" data-tab="data">История и импорт</button></div>':''}`;
    $('#goBack').onclick=()=>['profile','day','import'].includes(screen)?render('today'):leave();
    root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>render(b.dataset.tab));
    bindDurations(root);bindIntervals(root);nav();window.scrollTo(0,0);
  }
  function simpleView() {
    const f=data(),date=current().date,own=f.plans[date];
    let plan;try{plan=planDay(f,date);}catch(error){if(!/Ночная работа пересекает следующий день/.test(error.message))throw error;plan={};}
    const slot=own?.slotMin??f.weekConfig?.slotMin??plan.slotMin??plan.accountedMin??840;
    const work=own?.workingMin??f.weekConfig?.workingMin??plan.workingMin??480;
    shell('Прогноз',`<section class="forecast-simple-hero" aria-live="polite"><p class="forecast-eyebrow">${esc(formatDate(date,true))}</p><h2>Прогноз на сегодня</h2><div class="forecast-number is-unknown" id="simpleCount" aria-label="Прогноз заказов неизвестен">—</div><p class="forecast-band" id="simpleRange"></p></section>
      <section class="detail-card forecast-simple-plan"><h2>Моё время</h2>${durationField('todaySlotHours','Слот',slot)}${durationField('todayWorkHours','Из них буду работать',work)}<p class="error" id="forecastError" role="alert" hidden></p><p class="forecast-saved" id="forecastSaved" role="status" hidden>Время сохранено для следующих дней</p></section>
      <button class="button outline forecast-import-button" id="importForecast" type="button">Импортировать отчёт</button><input id="forecastFile" type="file" accept=".xlsx,.json" hidden>`,'simple');
    let saveTimer,dirty=false;
    const read=()=>{const pair=readPair('todayWorkHours','todaySlotHours');if(pair.slotMin==null||pair.workingMin==null)throw new Error('Укажите длительность слота и рабочее время.');return {...pair,intervals:[],precision:'total',mode:'simple'};};
    const preview=()=>{
      const pair=read(),result=predict(data(),date,planDay(data(),date,{[date]:pair}));
      const count=$('#simpleCount');
      count.classList.toggle('is-unknown',result.central==null);
      count.innerHTML=result.central==null?'—':`${result.central}<span> заказов</span>`;
      if(result.central==null)count.setAttribute('aria-label','Прогноз заказов неизвестен');
      else count.removeAttribute('aria-label');
      $('#simpleRange').textContent=result.central==null?(result.preparing?(modelFailure?'Не удалось рассчитать прогноз. Откройте экран ещё раз.':'Готовим прогноз…'):'Пока мало данных о рабочем времени'):`Возможный диапазон: ${result.lower}–${result.upper}`;
      $('#forecastError').hidden=true;
      return pair;
    };
    const save=pair=>{
      const next=saveForecastHours(data(),date,pair.slotMin,pair.workingMin);
      if(JSON.stringify(next.weekConfig)===JSON.stringify(data().weekConfig)&&JSON.stringify(next.plans[date])===JSON.stringify(data().plans[date]))return;
      write(next,{nowcast:false});
      const status=$('#forecastSaved');if(status){status.hidden=false;setTimeout(()=>{status.hidden=true;},2200);}
    };
    flushPlan=()=>{
      clearTimeout(saveTimer);
      if(!dirty)return true;
      try{save(read());dirty=false;return true;}catch(error){showError(error);return false;}
    };
    const changed=()=>{clearTimeout(saveTimer);dirty=true;run(()=>{preview();saveTimer=setTimeout(flushPlan,500);});};
    $('#todayWorkHours').addEventListener('input',changed);
    $('#todaySlotHours').addEventListener('input',changed);
    updateModel=()=>{modelFailure=false;run(preview);};run(preview);
    $('#importForecast').onclick=()=>{if(!flushPlan())return;if(Native?.importForecast)Native.importForecast();else $('#forecastFile').click();};
    $('#forecastFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>8000000)throw new Error('Файл больше 8 МБ.');if(file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Откройте XLSX в Android-приложении.');receiveImport(await file.text(),file.name);}catch(error){showError(error);}};
  }
  function readPair(workId,slotId) {
    const value=$('#'+workId).closest('[data-interval]')?intervalValue(root,workId):{workingMin:readHours($('#'+workId).value)},workingMin=value.workingMin,slotMin=readHours($('#'+slotId).value);
    if(slotMin!=null&&workingMin>slotMin)throw new Error('Рабочее время не может превышать номинальный слот.');
    return {...value,workingMin,slotMin};
  }
  function planResult(date,plan,estimate) {
    const terms=paymentTermsFor(getState(),date),result=calculateScenario({hours:plan.slotMin==null?'':(plan.slotMin/60).toFixed(2),orders:estimate.central??''},terms);
    const risk=plan.workingMin==null||result.hours==null||estimate.central==null?'unknown':result.missingNorm>0?'high':estimate.lower<result.normOrders?'medium':'conditional';
    const label={unknown:'Недостаточно данных для риска',high:'Высокий риск по темпу',medium:'Есть риск по темпу',conditional:'Темп достижим по плану'}[risk];
    return `<p class="forecast-risk" data-risk="${risk}">${label}</p><div class="forecast-metrics">${metric('Прогноз заказов',range(estimate))}${metric('Вне работы',plan.slotMin!=null&&plan.workingMin!=null?hours(Math.max(0,plan.slotMin-plan.workingMin)):'—')}${metric('Нужно для темпа '+num(terms.basePace),result.normOrders??'—')}${metric('Темп по слоту',num(result.pace))}</div>`;
  }
  function todayView() {
    const f=data(),clock=current(),p=profileFor(f,clock.date),morning=f.snapshots.find(s=>s.date===clock.date&&s.kind==='MORNING'),nowcast=f.snapshots.filter(s=>s.date===clock.date&&s.kind==='NOWCAST').at(-1),fact=f.days[clock.date],plan=planDay(f,clock.date),closed=!!(fact?.completed&&fact.ordersConfirmed);
    const estimate=morning?.central!=null?morning:predict(f,clock.date),slot=Object.hasOwn(f.plans[clock.date]??{},'slotMin')?f.plans[clock.date].slotMin:plan.slotMin??plan.accountedMin??f.weekConfig?.slotMin??null;
    shell('Прогноз',`<section class="forecast-hero"><div class="forecast-eyebrow">${esc(formatDate(clock.date,true))}</div><h2>${morning?'Исходный прогноз дня':'За рабочий день'}</h2><div class="forecast-number">${estimate.central??'—'}<span> заказов</span></div><div class="forecast-band">${estimate.central==null?esc(confidence(estimate)):`Диапазон ${estimate.lower}–${estimate.upper} · ${esc(confidence(estimate))}`}</div><p class="forecast-model-label" id="todayModelStatus" role="status">${esc(forecastModelLabel(estimate))}</p>${morning?`<p class="hint">Зафиксирован ${esc(new Date(morning.createdAt).toLocaleTimeString('ru-RU',{timeZone:morning.timezone,hour:'2-digit',minute:'2-digit'}))}${morning.partialDayIssue?' · после начала рабочего окна':''}</p>`:''}</section>
      <form id="todayPlan" class="detail-card"><h2>План на сегодня</h2>${durationField('todaySlotHours','Номинальный слот',slot,closed?'disabled':'')}${intervalField('todayWorkHours',f.plans[clock.date]?.intervals??plan.intervals,plan.workingMin,closed)}<div id="todayPlanResult"></div><p class="hint">Риск темпа — если весь слот учитывается Яндексом.</p>${errorHTML}<button class="button outline" id="saveTodayPlan" type="submit" ${closed?'disabled':''}>Сохранить план</button></form>
      ${estimate.intervalForecasts?.length?`<section class="detail-card"><h2>По рабочим окнам</h2><table class="forecast-table"><thead><tr><th>Время</th><th>Заказы</th><th>Диапазон</th></tr></thead><tbody>${estimate.intervalForecasts.map(w=>`<tr><td>${esc(minuteLabel(w.start))}–${esc(minuteLabel(w.end))}</td><td>${esc(w.central)}</td><td>${esc(w.lower)}–${esc(w.upper)}</td></tr>`).join('')}</tbody></table></section>`:''}
      ${nowcast?.central!=null?`<section class="detail-card" id="remainingForecast"><h2>Прогноз до конца смены</h2><p class="forecast-subnumber">Ещё ${nowcast.central} заказов</p><p class="hint">Диапазон ${nowcast.lower}–${nowcast.upper} · осталось ${hours(nowcast.remainingMin)} работы</p></section>`:''}
      <details class="calculation"><summary>На чём основан прогноз</summary><p>${esc(estimate.reasons?.join('. ')??'')}</p><p>Похожих наблюдений: ${estimate.comparableN??0}. Простая база: ${num(estimate.baseline)}. Модель ${esc(estimate.modelVersion??'—')}.</p><p>История до ${esc(estimate.trainingCutoff??'—')}; профиль v${morning?.profileVersion??p?.version??'—'}. Паузы и неизвестное время не становятся нулевым спросом.</p></details>`);
    const refresh=()=>{const pair=readPair('todayWorkHours','todaySlotHours'),activePlan=planDay(data(),clock.date,{[clock.date]:pair});$('#todayPlanResult').innerHTML=planResult(clock.date,pair,predict(data(),clock.date,activePlan));$('#forecastError').hidden=true;return pair;};
    updateModel=()=>{run(refresh);const issue=data().snapshots.find(s=>s.date===clock.date&&s.kind==='MORNING')??predict(data(),clock.date);$('.forecast-number').innerHTML=`${issue.central??'—'}<span> заказов</span>`;$('.forecast-band').textContent=issue.central==null?confidence(issue):`Диапазон ${issue.lower}–${issue.upper} · ${confidence(issue)}`;$('#todayModelStatus').textContent=forecastModelLabel(issue);};$('#todayWorkHours').oninput=()=>run(refresh);$('#todaySlotHours').oninput=()=>run(refresh);run(refresh);
    $('#todayPlan').onsubmit=e=>{e.preventDefault();if(closed)return;run(()=>{const pair=refresh();write({...data(),plans:{...data().plans,[clock.date]:pair}},{nowcast:false});notify('План сохранён');todayView();});};
  }
  function readHours(raw) {if(!raw.trim())return null;const n=Number(raw.replace(',','.'));if(!Number.isFinite(n)||n<0||n>24)throw new Error('Часы: число от 0 до 24.');return Math.round(n*60);}
  function dayView() {
    const f=data(),d=f.days[dayDate],plan=planDay(f,dayDate);
    shell('Факт дня',`<form id="workDayForm" novalidate>${textField('factDate','Дата',dayDate,'date')}
      ${textField('factOrders','Заказов за день',d?.orders??'','number','min="0" max="1000000" step="1" inputmode="numeric"')}${durationField('factAccounted','Учтено Яндексом',d?.appAccountedMin??null)}
      <div class="field"><label for="workPrecision">Фактическое рабочее время</label><select class="period-select" id="workPrecision"><option value="intervals">Знаю интервалы</option><option value="total">Знаю только сумму часов</option><option value="rest">Не работал</option><option value="unknown">Пока неизвестно</option></select></div>
      <div id="intervalFields">${intervalField('factWorkHours',d?.intervals?.filter(i=>i.state==='WORK')??[],d?.workingMin??null)}${textField('factPause','Личная пауза без доставки',windowsText(d?.intervals?.filter(i=>i.state==='UNAVAILABLE')),'text','placeholder="Можно оставить пустым"')}<button id="usePlannedWork" class="button quiet" type="button">Подставить мой план для подтверждения</button><details class="calculation"><summary>Остальное время отчёта</summary>${textField('reportWindow','Окно отчёта','', 'text','placeholder="07:00–21:00"')}<label class="forecast-checkbox"><input id="restUnavailable" type="checkbox">В остальное время не работал и не выполнял доставку</label></details></div>
      <div id="totalFields">${textField('factTotal','Всего рабочих часов',d?.workingMin==null?'':num(d.workingMin/60),'text','inputmode="decimal"')}</div>
      <p id="workingPreview" class="forecast-working-preview" role="status"></p>
      ${d?`<details class="calculation"><summary>Источник и уточнения</summary><p>${esc(d.source)} · ревизия ${d.revision}</p><p>RAW: ${d.orderEvidence.length}/${d.orders??'—'} · перечень ${d.rawComplete?'полный':'частичный'} · принятия/доставки ${d.evidenceComplete?'полные':'частичные'}</p><p>На заказах: ${hours(d.onOrderMin)} · ожидание без заказа: ${hours(d.availableNoOrderMin)}</p><p>Исправлений времени: ${d.revisions.length}</p></details>`:''}
      ${d?.conflicts.length?`<p class="field-warning">${esc(d.conflicts.join(' '))}</p><label class="forecast-checkbox"><input type="checkbox" id="resolveSources">Подтверждаю выбранный итог вместо расходящихся источников</label>`:''}<label class="forecast-checkbox"><input type="checkbox" id="dayCompleted" ${(d?.completed??dayDate<current().date)?'checked':''}>День завершён, это полный итог</label>${textField('factAsOf','Данные на время',minuteLabel(d?.asOfMinute??current().minute),'time')}${errorHTML}<button class="button primary" id="saveWorkDay" type="submit">Сохранить факт</button></form>`,'day');
    $('#workPrecision').value=d?.precision==='total'?'total':d?.workConfirmed&&d.workingMin===0?'rest':d?.precision==='intervals'?'intervals':'unknown';
    const update=()=>{
      const mode=$('#workPrecision').value;$('#intervalFields').hidden=mode!=='intervals';$('#totalFields').hidden=mode!=='total';
      try{let minutes=mode==='rest'?0:mode==='total'?readHours($('#factTotal').value):mode==='intervals'?intervalValue(root,'factWorkHours').workingMin:null;$('#workingPreview').textContent=`Рабочее время: ${hours(minutes)}`;}catch{$('#workingPreview').textContent='Проверьте интервалы';}
    };
    $('#workPrecision').onchange=update;$('#factWorkHours').oninput=update;$('#factTotal').oninput=update;update();
    $('#factDate').onchange=()=>{dayDate=$('#factDate').value;run(dayView);};
    $('#usePlannedWork').onclick=()=>{setIntervals(root,'factWorkHours',plan.intervals.filter(i=>i.state==='WORK'),plan.workingMin);$('#factPause').value=windowsText(plan.intervals.filter(i=>i.state==='UNAVAILABLE'));update();};
    $('#workDayForm').onsubmit=e=>{e.preventDefault();run(()=>{
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
      write(saveTimeline(f,input));dayDate=date;render('today');notify('Факт и уточнение времени сохранены');
    });};
  }
  const displayWeekDay=d=>{const fact=data().days[d.date];return fact?.ordersConfirmed&&fact.completed&&d.date<=current().date?{...d,isFact:true,workingMin:fact.workConfirmed?fact.workingMin:null,forecast:{...d.forecast,central:fact.orders,lower:fact.orders,upper:fact.orders}}:d;};
  function weekView() {
    const conditional={};
    const rebuild=()=>{const w=weekPlan(data(),start,overrides);for(const d of w.days)conditional[d.date]={...d,slotMin:d.slotMin??d.accountedMin,accountedMin:d.accountedMin??d.slotMin,accountingAssumption:d.accountedMin==null};return w;};
    const base=rebuild(),result=forecastFinances(getState(),start,conditional,current().date),week={...base,days:base.days.map(displayWeekDay)};
    const daySlot=d=>d.isFact?(data().days[d.date].accountedConfirmed?data().days[d.date].appAccountedMin:null):conditional[d.date].slotMin;
    const dayNote=d=>d.isFact?'Завершённый факт':`Вне работы: ${d.workingMin!=null&&daySlot(d)!=null?hours(Math.max(0,daySlot(d)-d.workingMin)):'—'}`;
    const totals=r=>`<div class="forecast-metrics duration-totals">${metric('Работа на неделю',hours(r.week.workingMin))}${metric('Слоты на неделю',hours(r.week.accountedMin))}${metric('Вне работы',r.week.workingMin!=null&&r.week.accountedMin!=null?hours(Math.max(0,r.week.accountedMin-r.week.workingMin)):'—')}</div>`;
    const weekModel=()=>week.days.find(d=>!d.isFact&&d.forecast.central!=null)?.forecast;
    shell('План на 7 дней',`<div class="forecast-datebar">${textField('weekStart','С даты',start,'date')}<button class="button quiet" id="resetWeek" type="button">Сбросить</button></div><p class="forecast-model-label" id="weekModelStatus" role="status">${esc(forecastModelLabel(weekModel()))}</p>
      <section class="detail-card week-config"><h2>По умолчанию на день</h2><div class="week-presets"><button type="button" data-slot-preset="9" aria-pressed="${weekConfig?.slotMin===540}">Слот 9 ч</button><button type="button" data-slot-preset="14" aria-pressed="${weekConfig?.slotMin===840}">Слот 14 ч</button></div>${durationField('weekSlotHours','Номинальный слот',weekConfig?.slotMin??null)}${intervalField('weekActiveHours',weekConfig?.intervals??(weekConfig?[]:week.days.find(d=>!d.isFact)?.intervals??[]),weekConfig?weekConfig.workingMin:week.days.find(d=>!d.isFact)?.workingMin??null)}<p class="duration-step-hint">Шаг 15 минут · точнее кнопками −/+</p></section><p class="hint">Риск выплаты — если весь слот учитывается Яндексом.</p>
      <details class="week-editor" open><summary>Настроить отдельные дни</summary><section class="week-planner">${week.days.map((d,i)=>`<details class="detail-card week-day"><summary><span>${short[(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7]} · ${esc(formatDate(d.date))}</span><strong id="dayEstimate${i}">${d.forecast.central??'—'} заказов</strong></summary>${durationField(`weekSlot${i}`,'Номинальный слот',daySlot(d),`data-week-slot="${i}" ${d.isFact?'disabled':''}`)}${intervalField(`weekWork${i}`,overrides[d.date]?.intervals??data().plans[d.date]?.intervals??d.intervals,d.workingMin,d.isFact)}<p class="hint" id="weekBand${i}">${d.isFact?'Завершённый факт · ':''}${esc(range(d.forecast))}</p><p class="hint" id="weekAssumption${i}">${esc(dayNote(d))}</p><div id="weekRisk${i}">${d.isFact?'':planResult(d.date,{workingMin:d.workingMin,slotMin:daySlot(d)},d.forecast)}</div></details>`).join('')}</section></details>
      <section class="detail-card"><h2>Эта неделя · условный расчёт</h2><div id="weekDurationTotals">${totals(result)}</div><div id="weekTotals">${periodResult(result.weekFinancial)}</div></section>
      <section class="detail-card"><h2>Расчётный период</h2><p class="hint">${esc(periodLabel(start))}</p><div id="periodForecast">${periodResult(result.fortnight)}</div></section>
      <div class="forecast-actions"><button id="saveWeek" class="button primary" type="button">Сохранить сценарий</button><button id="compareWeek" class="button outline" type="button">Сравнить с моим графиком</button></div><div id="scenarioComparison"></div>${data().scenarios.length?`<details class="calculation"><summary>Сохранённые сценарии</summary>${data().scenarios.slice(-5).reverse().map(s=>`<button class="button quiet" type="button" data-load-scenario="${esc(s.id)}">${esc(s.name)} · ${esc(formatDate(s.start))}</button>`).join('')}</details>`:''}${errorHTML}`);
    $('#weekStart').onchange=()=>run(()=>{start=$('#weekStart').value;overrides={};useWeekConfig();weekView();});$('#resetWeek').onclick=()=>{overrides={};weekConfig=null;weekConfigDraftValid=true;weekView();};
    const refresh=()=>{
      const w=rebuild(),r=forecastFinances(getState(),start,conditional,current().date);$('#weekTotals').innerHTML=periodResult(r.weekFinancial);$('#periodForecast').innerHTML=periodResult(r.fortnight);$('#weekDurationTotals').innerHTML=totals(r);$('#weekModelStatus').textContent=forecastModelLabel(w.days.map(displayWeekDay).find(d=>!d.isFact&&d.forecast.central!=null)?.forecast);
      w.days.map(displayWeekDay).forEach((d,i)=>{$(`#dayEstimate${i}`).textContent=`${d.forecast.central??'—'} заказов`;$(`#weekBand${i}`).textContent=(d.isFact?'Завершённый факт · ':'')+range(d.forecast);$(`#weekAssumption${i}`).textContent=dayNote(d);$(`#weekRisk${i}`).innerHTML=d.isFact?'':planResult(d.date,{workingMin:d.workingMin,slotMin:daySlot(d)},d.forecast);});$('#forecastError').hidden=true;
    };
    updateModel=()=>run(refresh);
    const applyCommon=()=>{
      weekConfigDraftValid=false;const next=readPair('weekActiveHours','weekSlotHours');weekConfig=next;weekConfigDraftValid=true;useWeekConfig(true);
      for(let i=0;i<7;i++){const d=week.days[i],v=overrides[d.date];if(v&&!d.isFact){setIntervals(root,`weekWork${i}`,v.intervals??[],v.workingMin);$(`#weekSlot${i}`).value=v.slotMin==null?'':String(v.slotMin/60);syncDuration(root,`weekSlot${i}`);}}
      refresh();root.querySelectorAll('[data-slot-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.slotPreset)*60===weekConfig.slotMin)));
    };
    $('#weekActiveHours').oninput=()=>run(applyCommon);$('#weekSlotHours').oninput=()=>run(applyCommon);
    root.querySelectorAll('[data-slot-preset]').forEach(b=>b.onclick=()=>run(()=>{$('#weekSlotHours').value=b.dataset.slotPreset;syncDuration(root,'weekSlotHours');applyCommon();}));
    week.days.forEach((d,i)=>{$(`#weekWork${i}`).dataset.weekWork=i;});
    root.querySelectorAll('[data-week-work],[data-week-slot]').forEach(input=>input.oninput=()=>run(()=>{
      const i=Number(input.dataset.weekWork??input.dataset.weekSlot),d=week.days[i],pair=readPair(`weekWork${i}`,`weekSlot${i}`);
      overrides[d.date]={...pair,accountedMin:null,accountingAssumption:true};refresh();
    }));
    $('#saveWeek').onclick=()=>run(()=>{
      if(!weekConfigDraftValid)throw new Error('Проверьте часы работы и номинального слота.');
      week.days.forEach((d,i)=>{if(!d.isFact)readPair(`weekWork${i}`,`weekSlot${i}`);});
      const next=saveScenario(data(),`План ${data().scenarios.length+1}`,start,overrides),plans={...data().plans};
      for(const [date,p] of Object.entries(overrides))if(date>=current().date&&!(data().days[date]?.completed&&data().days[date]?.ordersConfirmed))plans[date]={workingMin:p.workingMin,slotMin:p.slotMin,intervals:p.intervals??[],precision:p.precision??'total'};
      write({...next,plans,weekConfig},{nowcast:false});notify('Сценарий сохранён');weekView();
    });
    $('#compareWeek').onclick=()=>run(()=>{const a=forecastFinances(getState(),start,{},current().date),b=forecastFinances(getState(),start,conditional,current().date);$('#scenarioComparison').innerHTML=`<section class="detail-card"><h2>Сравнение</h2><table class="forecast-table"><thead><tr><th>Показатель</th><th>Мой график</th><th>Сценарий</th></tr></thead><tbody><tr><td>Заказы недели</td><td>${a.week.central??'—'}</td><td>${b.week.central??'—'}</td></tr><tr><td>Темп периода</td><td>${num(a.fortnight.pace)}</td><td>${num(b.fortnight.pace)}</td></tr></tbody></table></section>`;});
    root.querySelectorAll('[data-load-scenario]').forEach(b=>b.onclick=()=>{const s=data().scenarios.find(s=>s.id===b.dataset.loadScenario);start=s.start;overrides=JSON.parse(JSON.stringify(s.overrides));weekView();});
  }
  function periodResult(f) {
    const label={unknown:'Не хватает подтверждённых данных',high:'Высокий риск невыполнения',medium:'Есть риск: порог внутри диапазона',conditional:'Условия достижимы по сценарию',met:'Условия выполнены'}[f.risk];
    return `<p class="forecast-risk" data-risk="${f.risk}">${label}</p><div class="forecast-metrics">${metric('Заказы',f.orders==null?'—':`${f.orders} · ${f.lowerOrders}–${f.upperOrders}`)}${metric('Часы Яндекса',f.hours==null?'—':hoursText(f.hours)+' ч')}${metric('Темп для выплаты',num(f.pace))}${metric('До минимума часов',f.missingHours==null?'—':hoursText(f.missingHours)+' ч')}${metric('До нормы заказов',num(f.missingNorm))}${metric('Запас пустых часов',f.reserve==null?'—':hoursText(f.reserve/60)+' ч')}${metric('Почасовая сумма при выполнении',money(f.conditionalIncome))}</div><p class="hint">Условия: ${f.minimumHours} ч · темп ${num(f.terms.basePace)}${f.terms.criticalPace!=null?' · критический '+num(f.terms.criticalPace):''}. ${f.belowCritical?'Темп ниже критического. ':''}${f.complete?'Прогнозная выплата не гарантирована.':'Неизвестные дни не заменены нулями.'}</p>`;
  }
  function accuracyView() {
    const f=data(),q=backtest(f,current().date),prospective=f.evaluations.filter(e=>e.prospective);
    shell('Точность прогноза',`<section class="detail-card"><h2>Проверка по прошлым дням</h2><div class="forecast-metrics">${metric('Проверенных дней',q.n)}${metric('Средняя ошибка, заказов',num(q.mae))}${metric('Смещение',num(q.bias))}${metric('Ошибка простой базы',num(q.baselineMAE))}${metric('WAPE',q.wape==null?'—':num(q.wape*100)+'%')}${metric('Попадание в диапазон',q.coverage==null?'—':num(q.coverage*100)+'%')}</div><p class="hint">Каждый день проверяется только по более ранней истории. ${q.n<20?'Истории мало; вероятности выполнения условий пока не показываются.':'Диапазон отражает наблюдаемую изменчивость, без обещания гарантии.'}</p></section>
      <section class="detail-card"><h2>Зафиксированные выпуски</h2><p>${f.snapshots.filter(s=>s.kind==='MORNING').length} исходных прогнозов · ${prospective.length} оценок до начала работы</p>${f.evaluations.length?f.evaluations.slice(-12).reverse().map(e=>`<div class="forecast-audit-row"><strong>${esc(formatDate(e.factDate))} · факт v${e.factRevision}</strong><span>Факт ${e.fact}, ошибка ${num(e.signedError)} · ${e.covered?'в диапазоне':'вне диапазона'}${e.prospective?'':' · поздняя фиксация'}</span></div>`).join(''):'<p class="hint">Оценка появится после подтверждения итога прошедшего дня.</p>'}</section><section class="detail-card"><h2>Архив из отчёта</h2><p>${f.archive?.forecasts?.length??0} прогнозов · ${f.archive?.accuracy?.length??0} записей точности</p>${(f.archive?.forecasts??[]).filter(r=>r.central!=null).slice(-8).reverse().map(r=>`<div class="forecast-audit-row"><strong>${esc(r.date)} · ${esc(r.interval)}</strong><span>Прогноз ${esc(r.central)} [${esc(r.lower??'—')}–${esc(r.upper??'—')}] · факт ${esc(r.factAddedLater??'—')} · ошибка ${num(r.absoluteError)}</span></div>`).join('')}<p class="hint">Архивные записи отделены от независимой проверки новой модели.</p></section><details class="calculation"><summary>Версии модели</summary>${f.models.slice(-8).reverse().map(m=>`<p>${esc(m.modelVersion)} · до ${esc(m.trainingDataCutoff)} · ${esc(m.sourceHash)}</p>`).join('')}</details>${errorHTML}`);
  }
  function dataView() {
    const f=data(),days=Object.values(f.days).sort((a,b)=>b.date.localeCompare(a.date)),quality=importSummary(days);
    shell('История прогноза',`<div class="forecast-actions"><button class="button primary" id="newWorkFact" type="button">Добавить факт дня</button><button class="button outline" id="importForecast" type="button">Загрузить историю XLSX / JSON</button></div><input id="forecastFile" type="file" accept=".xlsx,.json" hidden><p class="hint">Достоверные данные принимаются автоматически. Неизвестные часы остаются неизвестными.</p><p class="hint">Загружено ${quality.dates} дат · ${quality.events} RAW · ${quality.working.CONFIRMED} с подтверждёнными часами · ${quality.working.RECONSTRUCTED} реконструкций · ${quality.working.UNKNOWN} без часов · ${quality.conflicts} конфликтов</p><p class="hint" id="orderTimeCoverage">Время заказа: ${quality.time.visible}; принятия: ${quality.time.accepted}; доставки: ${quality.time.delivered}; обе отметки: ${quality.time.paired}. Сами отметки не подтверждают часы ожидания заказов.</p><div id="forecastImportPreview"></div>
      <section>${days.length?days.slice(0,150).map(d=>`<button class="forecast-day-row" data-edit-fact="${d.date}" type="button"><span><strong>${esc(formatDate(d.date,true))}</strong><small>${d.orders??'—'} заказов${d.ordersConfirmed?'':' · не подтверждено'} · работа ${hours(d.workingMin)}${d.workConfirmed?'':d.workingMin==null?' · неизвестно':' · реконструкция'}${d.conflicts.length?' · конфликт':''}</small></span>${icon['chevron-right']}</button>`).join(''):'<div class="detail-card"><h2>Личная история пока пуста</h2><p>Загрузите историю или добавьте факт дня.</p></div>'}</section>${errorHTML}`);
    $('#newWorkFact').onclick=()=>{dayDate=current().date;render('day');};
    $('#importForecast').onclick=()=>{if(Native?.importForecast)Native.importForecast();else $('#forecastFile').click();};
    $('#forecastFile').onchange=async e=>{const file=e.target.files[0];if(file){try{if(file.size>8000000)throw new Error('Файл больше 8 МБ.');if(file.name.endsWith('.xlsx'))throw new Error('XLSX читается в Android-приложении. В браузере доступен JSON истории.');receiveImport(await file.text(),file.name);}catch(error){showError(error);}}};
    root.querySelectorAll('[data-edit-fact]').forEach(b=>b.onclick=()=>{dayDate=b.dataset.editFact;render('day');});
  }
  function receiveImport(text,name='Courier Forecast') {
    if(!flushPlan())return;
    run(()=>{const parsed=parseForecastFile(text,name);const merged=applyHistory(data(),parsed);write(merged);simpleView();notify(`История загружена: ${parsed.days.length} дней`);});
  }
  function render(next=screen){if(!flushPlan())return;flushPlan=()=>true;updateModel=()=>{};screen=next;({today:simpleView,day:dayView,week:weekView,accuracy:accuracyView,data:dataView}[screen]??simpleView)();}
  render();return {receiveImport,flush:()=>flushPlan(),modelReady:()=>updateModel(),modelFailed:()=>{modelFailure=true;const status=$('#simpleRange');if(status)status.textContent='Не удалось рассчитать прогноз. Откройте экран ещё раз.';},back:()=>{if(!flushPlan())return true;if(screen!=='today'){render('today');return true;}return false;}};
}
