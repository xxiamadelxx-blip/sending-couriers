import {
  today, periodFor, shiftPeriod, formatDate, periodLabel, emptyState, normalizeState,
  calculate, calculateDay, newEntryId, hoursText, money, paceText, reserveText,
  upsertEntry, mergeImport, parseMoney, parseHours, markdownReport, deductionChecks,
  TAX_PERCENT_MIN, TAX_PERCENT_MAX, PARK_COMMISSION_PERCENT,
  calculatePremiumCycle, updateSettings, setPaymentTerms, paymentTermsFor,
  goalText, percentText, APP_VERSION
} from './core.mjs';
import { icon } from './icons.mjs';
import { feedback as emitFeedback } from './feedback.mjs';
import { mountForecast } from './forecast-ui.mjs';
import {prepareForecast,forecastKey} from './forecast-runtime.mjs';
import { syncSlots, ensureForecast, evaluateForecasts, currentProfile, assertForecastCapacity } from './forecast.mjs';
import { weatherCache, weatherParts, weatherSymbol, weatherDescription, weatherLocation } from './weather.mjs';
import { pager, bindPager } from './pager.mjs';
import { intervalField, bindIntervals, intervalValue } from './interval-control.mjs';
import { withSlotWorkingTime } from './slot-work.mjs';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const Native = window.CourierNative;
document.documentElement.classList.toggle('native-app', Boolean(Native));
const feedback = kind => emitFeedback(kind, state?.settings, Native);
document.addEventListener('click', event => {
  const button = event.target.closest('button, summary');
  if (button && !button.disabled && button.type !== 'submit' && !button.matches('#themeToggle,#feedbackTest,#confirmImport,#deleteDay,#reopenPeriod,[data-calc="="]')) feedback('tap');
}, true);
let state, selectedPeriod = periodFor(today()).id, view = 'summary', editingId = null, pendingImport = null, homePage = 0;
let toastTimer, forecastScreen, weatherAttempt = 0, requestedModel = null;
const icons = { back: icon['arrow-left'], plus: icon.plus, share: icon['file-export'], chevron: icon['chevron-right'], down: icon['chevron-down'] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const amount = (value, major = false) => `<span class="${major ? 'major-amount' : 'amount'}${value == null ? ' empty' : ''}">${esc(money(value))}</span>`;
const oldNightPlan=error=>/^Ночная работа пересекает следующий день с заданной суммой/.test(error?.message??'');
function snapshotIfPossible(f,now=new Date(),kind='MORNING') {
  try{return ensureForecast(f,now,kind);}catch(error){if(!oldNightPlan(error))throw error;return f;}
}
function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}
window.nativeError = notify;
function persist(next, quiet = false) {
  next = { ...next, forecast:evaluateForecasts(snapshotIfPossible(snapshotIfPossible(syncSlots(next.forecast,next.entries)),new Date(),'NOWCAST')) };
  assertForecastCapacity(next.forecast);
  const serialized = JSON.stringify(next);
  if (new TextEncoder().encode(serialized).length > 8_000_000) throw new Error('Локальная база больше 8 МБ. Сохраните резервную копию перед дальнейшим импортом. Данные не изменены.');
  if (Native) {
    if (!Native.writeState(serialized)) throw new Error('Не удалось сохранить данные на телефоне. Повторите попытку.');
  } else {
    localStorage.setItem('courier-finance-v1', serialized);
  }
  state = next;
  applyAppearance();
  if (!quiet) feedback('success');
  warmForecast();
}
function warmForecast() {
  if(!state)return;let key;try{key=forecastKey(state.forecast);}catch(error){if(oldNightPlan(error))return;throw error;}if(key===requestedModel)return;requestedModel=key;
  prepareForecast(state.forecast).then(artifact=>{
    if(forecastKey(state.forecast)!==key){warmForecast();return;}
    try{persist({...state,forecast:{...state.forecast,trainedModel:artifact}},true);if(view==='forecast')forecastScreen?.modelReady?.();}catch(error){notify(error.message);}
  }).catch(error=>notify(error.message));
}
function openForecast(initial = 'today') {
  const synced=syncSlots(state.forecast,state.entries);
  const updated=evaluateForecasts(snapshotIfPossible(synced));
  if (JSON.stringify(updated) !== JSON.stringify(state.forecast)) {
    try { persist({...state,forecast:updated},true); } catch(error) { notify(error.message); }
  }
  view='forecast';editingId=null;
  forecastScreen=mountForecast({root:app,getState:()=>state,commit:persist,heading,nav:()=>bottomNav('forecast'),leave:summary,notify,Native,initial});
}
window.receiveForecastImport = text => { if(view!=='forecast')openForecast(); forecastScreen.receiveImport(text); };
window.receiveWeather = text => {
  try {
    const p=weatherLocation(state.forecast);if(!p.weatherCity)return;
    const cache=weatherCache(JSON.parse(text),p);
    persist({...state,forecast:{...state.forecast,weather:cache,location:state.forecast.location??p}},true);
    if(view==='summary'){const y=scrollY;summary();window.scrollTo(0,y);}
  } catch(error) { notify(error.message); }
};
window.weatherFailed = () => { if(view==='summary' && $('#weatherStatus')) $('#weatherStatus').textContent=weatherParts(state.forecast.weather,weatherLocation(state.forecast)).available?'Нет связи · кэш устарел':'Погода недоступна'; };
function weatherWidget() {
  const p=weatherLocation(state.forecast),w=weatherParts(state.forecast.weather,p);
  const status=w.available?w.stale?'Кэш погоды устарел':'Open-Meteo':'Погода недоступна';
  return `<button class="header-weather" id="refreshWeather" type="button" aria-label="${esc(status)}. Обновить погоду" title="${esc(status)}"><span class="weather-icons">${w.parts.map(v=>`<span class="weather-mini" data-weather-code="${v.code??''}" aria-label="${v.label}: ${weatherDescription(v.code)}, ${v.temp==null?'нет данных':Math.round(v.temp)+'°'}" title="${v.label} · ${weatherDescription(v.code)}"><span aria-hidden="true">${weatherSymbol(v.code)}</span><strong>${v.temp==null?'—':Math.round(v.temp)+'°'}</strong></span>`).join('')}</span><span id="weatherStatus" class="${w.available&&w.stale?'weather-cache':'sr-only'}">${w.available&&w.stale?'Кэш':esc(status)}</span></button>`;
}
function refreshWeather(force=false) {
  const p=weatherLocation(state.forecast);
  if(!Native?.fetchWeather||!p.weatherCity)return;
  const stale=weatherParts(state.forecast.weather,p).stale;
  if(force||stale&&Date.now()-weatherAttempt>1800000) {weatherAttempt=Date.now();Native.fetchWeather(p.weatherCity,p.timezone);}
}
function applyAppearance() {
  const theme = state?.settings?.theme ?? 'dark';
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#000000' : '#f4f7f3';
  Native?.applyTheme?.(theme);
  const button = $('#themeToggle');
  if (button) {
    button.innerHTML = theme === 'dark' ? icon.sun : icon.moon;
    button.setAttribute('aria-label', theme === 'dark' ? 'Включить дневную тему' : 'Включить ночную тему');
    button.title = button.getAttribute('aria-label');
  }
  if ($('#themeSelect')) $('#themeSelect').value = theme;
  if ($('#paceGauge')) { const s = calculate(state,selectedPeriod); drawPaceGauge(s.pace,s.terms.basePace,s.paymentConditions.paceMet); }
}
document.addEventListener('click', event => {
  if (!event.target.closest('#themeToggle')) return;
  try { persist(updateSettings(state,{theme:state.settings.theme === 'dark' ? 'light' : 'dark'})); }
  catch (error) { notify(error.message); feedback('error'); }
});
function themeButton() {
  const dark = state.settings.theme === 'dark', label = dark ? 'Включить дневную тему' : 'Включить ночную тему';
  return `<button class="export-icon theme-toggle" id="themeToggle" type="button" aria-label="${label}" title="${label}">${dark ? icon.sun : icon.moon}</button>`;
}
function resetScroll() { window.scrollTo(0, 0); }
function heading(title) {
  return `<div class="page-heading"><button class="back" type="button" aria-label="Назад" id="goBack">${icons.back}</button><h1>${title}</h1>${themeButton()}</div>`;
}
function bottomNav(active) {
  const host=$('#bottomNav');host.hidden=false;
  const links=[['summary','Главная','home','navSummary'],['period','Период','calendar','navPeriod'],['add','Добавить слот','plus','navAddSlot'],['forecast','Прогноз','chart-bar','navForecast'],['settings','Настройки','settings','navSettings']];
  host.innerHTML=links.map(([key,label,image,id])=>key==='add'?`<button id="${id}" class="nav-add" type="button" aria-label="${label}">${icon.plus}</button>`:`<button id="${id}" class="nav-item ${active===key||(active==='history'&&key==='period')?'active':''}" type="button" ${active===key||active==='history'&&key==='period'?'aria-current="page"':''}>${icon[image]}<span>${label}</span></button>`).join('');
  $('#navSummary').onclick=summary;$('#navPeriod').onclick=periodDetails;$('#navAddSlot').onclick=()=>form();$('#navForecast').onclick=()=>openForecast();$('#navSettings').onclick=settings;
}
function cycleDate() {
  const p = periodFor(selectedPeriod);
  return today() >= p.start && today() <= p.end ? today() : p.end;
}
function drawPaceGauge(pace, target, met) {
  const canvas = $('#paceGauge');
  if (!canvas) return;
  const size = 146, scale = Math.min(devicePixelRatio || 1, 3);
  canvas.width = size * scale; canvas.height = size * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  const palette = getComputedStyle(document.documentElement);
  ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.strokeStyle = palette.getPropertyValue('--gauge-track').trim();
  ctx.beginPath(); ctx.arc(73,73,65,0,Math.PI*2); ctx.stroke();
  if (pace > 0) {
    ctx.strokeStyle = palette.getPropertyValue(met ? '--gauge-good' : '--gauge-pending').trim();
    ctx.beginPath(); ctx.arc(73,73,65,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(pace/target,1)); ctx.stroke();
  }
}
function periods() {
  return [...new Set([selectedPeriod, periodFor(today()).id, ...state.entries.map(e => e.periodId), ...Object.keys(state.closures), ...state.settings.paymentRules.map(r => r.effectivePeriodStart)])].sort().reverse();
}
function navigation() {
  return `<div class="period-navigation"><button class="period-arrow" id="previousPeriod" aria-label="Предыдущий период" type="button">${icon['chevron-left']}</button><select id="periodPicker" class="period-select" aria-label="Расчётный период">${periods().map(id => `<option value="${id}" ${id === selectedPeriod ? 'selected' : ''}>${esc(periodLabel(id))}</option>`).join('')}</select><button class="period-arrow" id="nextPeriod" aria-label="Следующий период" type="button">${icons.chevron}</button></div>`;
}
function bindNavigation(rerender) {
  $('#periodPicker').addEventListener('change', e => { selectedPeriod = e.target.value; rerender(); });
  $('#previousPeriod').addEventListener('click', () => { selectedPeriod = shiftPeriod(selectedPeriod, -1).id; rerender(); });
  $('#nextPeriod').addEventListener('click', () => { selectedPeriod = shiftPeriod(selectedPeriod, 1).id; rerender(); });
}
function financeHint(s) {
  if (s.hours == null) return s.latest ? 'Выплаты сохранены. Введите часы за день — тогда появится расчёт дохода.' : 'Добавьте первый день — появятся ваши показатели.';
  return `Оценка по введённым часам при итоговом темпе от ${goalText(s.terms.basePace)}.${s.hoursRecorded < s.entries.length ? ` Часы внесены для ${s.hoursRecorded} из ${s.entries.length} записей.` : ''}${s.hiddenMinutes ? ' Запас учитывает округление прежних часов до целого числа.' : ''}`;
}
function cycleBonusLabel(cycle, terms) {
  const rates = [...new Set(cycle.breakdown.map(row => row.cycleBonusPercent))];
  return rates.length > 1 ? 'За 12 недель' : `За 12 недель · ${percentText(rates[0] ?? terms.cycleBonusPercent)}%`;
}
function orderWord(value) {
  return ({one:'заказ',few:'заказа',many:'заказов',other:'заказа'})[new Intl.PluralRules('ru').select(value)];
}
function meterSize(value) {
  const length = String(value ?? '').replace(/\s/g, '').length;
  return length > 8 ? ' wide' : length > 4 ? ' compact' : '';
}
function paymentStatus(s) {
  const c = s.paymentConditions;
  let title, detail;
  if (c.status === 'met') { title = 'Условия выплаты выполнены'; detail = `Минимум ${c.minimumHours} ч и темп от ${goalText(s.terms.basePace)} достигнуты.`; }
  else if (!s.entries.length) { title = 'Условия выплаты'; detail = `От ${c.minimumHours} ч и темп от ${goalText(s.terms.basePace)} заказа/ч.`; }
  else {
    title = c.status === 'risk' ? 'Выплата под риском' : 'Условия требуют проверки';
    detail = c.hoursMet === false ? `До ${c.minimumHours} ч ещё ${hoursText(c.missingHours)} ч.` : c.hoursMet ? `Минимум ${c.minimumHours} ч набран.` : 'Часы пока неизвестны.';
    detail += c.paceMet === false ? ` Темп ниже ${goalText(s.terms.basePace)}.` : c.paceMet == null ? ' Темп пока неизвестен.' : c.complete ? ' Темп достигнут.' : ' Часть часов или заказов не внесена.';
  }
  return `<section class="payment-status ${c.status}" id="paymentStatus" role="status">${icon['info-circle']}<div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div></section>`;
}
function summary() {
  app.className = 'overview'; view = 'summary'; editingId = null;
  const s = calculate(state, selectedPeriod), cycle = calculatePremiumCycle(state, cycleDate());
  const gap = s.pace == null ? null : Math.max(0, s.requiredOrders - s.orders);
  app.innerHTML=`<header class="overview-top"><div class="overview-toolbar">${weatherWidget()}<div class="header-tools"><button class="export-icon" id="export" type="button" aria-label="Экспорт для ChatGPT">${icons.share}</button>${themeButton()}</div></div><button class="period-button" id="choosePeriod" type="button" aria-label="Выбрать расчётный период">${icon.calendar}${esc(periodLabel(selectedPeriod))}${icons.down}</button>${s.closure?'<p class="summary-close-status">Период закрыт</p>':''}</header>
    <section class="rhythm" aria-labelledby="paceTitle"><div class="pace-hero"><div><h2 id="paceTitle">Темп периода</h2><p id="summaryPace" class="hero-pace"><strong class="${paceText(s.pace).length > 7 ? 'wide' : paceText(s.pace).length > 5 ? 'compact' : ''}">${paceText(s.pace)}</strong> заказа/ч</p></div><div class="gauge"><canvas id="paceGauge" role="img" aria-label="${s.pace == null ? 'Пока нет данных о темпе' : `Выполнение нормы: ${Math.round(s.pace / s.terms.basePace * 100)}%`}"></canvas><div class="gauge-label" data-state="${s.paymentConditions.paceMet === false ? 'below' : 'other'}"><strong>${s.pace == null ? '—' : Math.round(s.pace / s.terms.basePace * 100) + '%'}</strong><span>Цель ${goalText(s.terms.basePace)}<br>заказа/ч</span></div></div></div>
    <div class="meters" aria-label="Сумма часов и заказов за период"><div class="meter">${icon.clock}<div><p class="meter-value${meterSize(hoursText(s.hours))}" id="summaryHours">${hoursText(s.hours)}<span class="unit"> ч</span></p><p class="meter-label">отработано</p></div></div><div class="meter">${icon.package}<div><p class="meter-value${meterSize(s.orders)}"><span id="summaryOrders">${s.orders ?? '—'}</span><span class="orders-unit"> ${s.orders == null ? 'заказов' : orderWord(s.orders)}</span></p><p class="meter-label">выполнено</p></div></div></div>
    <div class="pace-block"><div class="norm-row">${icon.target}<span>До нормы</span><div><strong>${gap ?? '—'}${gap == null ? '' : ' ' + orderWord(gap)}</strong></div></div><p class="reserve-line" id="summaryReserve">Можно без заказов: ${reserveText(s.reserve)}</p>${s.pace != null && !s.matchedCounters ? '<p class="hint" id="paceNote">Неполные данные · темп по введённым итогам</p>' : ''}</div></section>${paymentStatus(s)}
    <section class="income-hero" aria-labelledby="incomeTitle"><h2 id="incomeTitle">Общий доход</h2><div id="summaryGross">${amount(s.grossUserIncome, true)}</div><div class="income-parts"><div><span>За часы</span><strong>${esc(money(s.hourlyBase))}</strong></div><div><span>Чаевые</span><strong>${esc(money(s.tips))}</strong></div><div><span>Бонусы</span><strong>${esc(money(s.separateBonus))}</strong></div></div><section class="payouts" aria-label="Выплаты"><div id="summaryPaid"><h2>Выплачено</h2>${amount(s.paidReward)}</div><div><h2>Осталось выплатить</h2><div id="summaryOwed">${amount(s.estimatedYandexOwed)}</div></div></section><button class="premiums-card" id="openPremiums" type="button"><span class="card-heading">Расчётные премии${icons.chevron}</span><span class="premium-teasers"><span>${icon['chart-bar']}<span>За темп · ${percentText(s.terms.paceBonusPercent)}%<strong id="summaryPacePremium">${esc(money(s.pacePremium))}</strong></span></span><span>${icon.gift}<span>${esc(cycleBonusLabel(cycle, s.terms))}<strong id="summaryCyclePremium">${esc(money(cycle.premium))}</strong></span></span></span></button></section><details class="calculation"><summary>Расчёт дохода</summary><p class="hint" id="financeHint">${esc(financeHint(s))}</p></details>`;
  // Keep the existing financial and pace markup, then arrange its three
  // independent sections as a native horizontal carousel.
  const rhythm=$('.rhythm'),status=$('#paymentStatus'),income=$('.income-hero'),premiums=$('#openPremiums'),calculation=$('.calculation');
  premiums.querySelector('.card-heading svg')?.remove();
  const premiumHTML=`<div class="premiums-card">${premiums.innerHTML}</div>`;premiums.remove();
  rhythm.insertAdjacentHTML('beforebegin',pager('homeDeck',[
    {title:'Темп',icon:icon['chart-bar'],html:rhythm.outerHTML+status.outerHTML},
    {title:'Доход',icon:icon.wallet??icon['file-export'],html:income.outerHTML+calculation.outerHTML},
    {title:'Премии',icon:icon.gift,html:`<section class="home-premiums detail-card">${premiumHTML}${cycle.boundaryNote ? `<details class="calculation boundary-note"><summary>Есть старые интервалы</summary><p>${esc(cycle.boundaryNote)}</p></details>` : ''}</section>`}
  ],{label:'Главная'}));
  rhythm.remove();status.remove();income.remove();calculation.remove();
  bindPager($('#homeDeck'),{initial:homePage,onChange:index=>homePage=index});
  bottomNav('summary'); drawPaceGauge(s.pace, s.terms.basePace,s.paymentConditions.paceMet);
  $('#choosePeriod').addEventListener('click', history);
  $('#export').addEventListener('click', () => $('#exportDialog').showModal()); resetScroll();
  $('#refreshWeather')?.addEventListener('click',()=>refreshWeather(true));refreshWeather();
}

function periodDetails() {
  app.className = ''; view = 'period'; editingId = null;
  const s = calculate(state, selectedPeriod), cycle = calculatePremiumCycle(state, cycleDate());
  app.innerHTML = `${heading('Период')}${navigation()}${paymentStatus(s)}
    <section class="detail-card period-overview" aria-label="Итоги периода"><h2>Итоги периода</h2><dl class="period-facts"><div><dt>Часы</dt><dd>${hoursText(s.hours)} ч</dd></div><div><dt>Заказы</dt><dd>${s.orders ?? '—'}</dd></div></dl></section>
    <section class="detail-card cycle-settings"><div class="cycle-header"><h2>12 недель</h2>${cycle.start ? `<span>Цикл ${cycle.cycleNumber}</span>` : ''}</div>${cycle.start ? `<p class="cycle-dates" id="cycleDates">${esc(formatDate(cycle.start))} — ${esc(formatDate(cycle.end))}</p><progress max="84" value="${cycle.elapsedDays}" aria-label="Прошло дней в 12-недельном цикле"></progress><p class="hint">${cycle.status === 'not-started' ? 'Ещё не начался' : `День ${cycle.elapsedDays} из 84`}</p>` : ''}<details id="cycleConfig" class="cycle-config"><summary id="configureCycle">${cycle.start ? 'Изменить дату начала' : 'Указать дату начала'}${icons.down}</summary><form id="settingsForm" novalidate><div class="field cycle-start"><label for="premiumCycleStart">Начало первого цикла</label><input type="date" id="premiumCycleStart" name="premiumCycleStart" min="1900-01-01" max="2200-10-09" value="${esc(state.settings.premiumCycleStart ?? '')}"></div><p class="hint settings-preview" id="cyclePreview"></p><div class="error" id="settingsError" role="alert" hidden></div><button class="button primary" id="saveSettings" type="submit">Сохранить дату</button></form></details></section>
    <div class="actions period-actions"><button class="button quiet" id="periodHistory" type="button">Записи периода${icons.chevron}</button><button class="button quiet export-action" id="periodExport" type="button">${icons.share}Экспорт для ChatGPT</button></div>`;
  bottomNav('period'); $('#goBack').addEventListener('click', summary); bindNavigation(periodDetails);
  function previewCycle() {
    try {
      const next = updateSettings(state, { premiumCycleStart: $('#premiumCycleStart').value });
      const nextCycle = calculatePremiumCycle(next, $('#premiumCycleStart').value || today());
      $('#cyclePreview').textContent = nextCycle.start ? `${formatDate(nextCycle.start)} — ${formatDate(nextCycle.end)}` : 'Не настроено';
    } catch (error) { $('#cyclePreview').textContent = error.message; }
  }
  $('#premiumCycleStart').addEventListener('input', previewCycle); previewCycle();
  $('#settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    try { persist(updateSettings(state, { premiumCycleStart: $('#premiumCycleStart').value })); periodDetails(); notify('Дата сохранена'); }
    catch (error) { $('#settingsError').textContent = error.message; $('#settingsError').hidden = false; feedback('error'); }
  });
  $('#periodExport').addEventListener('click', () => $('#exportDialog').showModal());
  $('#periodHistory').addEventListener('click', history); resetScroll();
}
function settings() {
  app.className = ''; view = 'settings'; editingId = null;
  const choices = [...new Set([...periods(), ...[-1,1,2,3,4].map(n => shiftPeriod(selectedPeriod,n).id)])].sort().reverse();
  const initial = paymentTermsFor(state, selectedPeriod);
  const ruleHistory = () => state.settings.paymentRules.length ? `<details class="calculation payment-history"><summary>История условий</summary>${[...state.settings.paymentRules].reverse().map(rule => `<div class="payment-rule"><strong>С ${esc(formatDate(rule.effectivePeriodStart))}</strong><span>${esc(money(rule.hourlyRate))}/ч · темп ${goalText(rule.basePace)}</span><span>Темп ${goalText(rule.premiumPace)}: ${percentText(rule.paceBonusPercent)}% · 12 недель: ${percentText(rule.cycleBonusPercent)}%</span></div>`).join('')}</details>` : '';
  app.innerHTML = `${heading('Настройки')}<section class="detail-card appearance-card"><h2>Тема</h2><div class="field theme-field"><label for="themeSelect" class="sr-only">Оформление</label><select id="themeSelect" class="period-select"><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Дневная</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Ночная · AMOLED</option></select></div></section>
    <section class="detail-card payment-settings"><h2>Условия оплаты</h2><form id="paymentForm" novalidate><div class="field payment-period"><label for="paymentPeriod">Начиная с периода</label><select id="paymentPeriod" class="period-select">${choices.map(id => `<option value="${id}" ${id === selectedPeriod ? 'selected' : ''}>${esc(periodLabel(id))}</option>`).join('')}</select></div><div class="form-grid">
    ${field('hourlyRate','Ставка за час',initial.hourlyRate,{unit:'₽',full:true})}
    ${field('basePace','Темп для оплаты',initial.basePace,{unit:'заказа/ч',full:true})}
    ${field('premiumPace','Темп для премии',initial.premiumPace,{unit:'заказа/ч',full:true})}
    ${field('minimumHours','Минимум часов за период',initial.minimumHours ?? 80,{unit:'ч',full:true})}
    ${field('criticalPace','Критический темп',initial.criticalPace ?? initial.basePace,{unit:'заказа/ч',full:true})}
    ${field('paceBonusPercent','Премия за темп',initial.paceBonusPercent,{unit:'%'})}
    ${field('cycleBonusPercent','Премия за 12 недель',initial.cycleBonusPercent,{unit:'%'})}</div>
    <div class="error" id="paymentError" role="alert" hidden></div><button class="button primary" id="savePaymentTerms" type="submit">Сохранить условия</button></form><div id="paymentHistory">${ruleHistory()}</div></section>
    <section class="detail-card"><h2>Отклик</h2><label class="switch-row" for="soundEnabled"><span>Звуки</span><input type="checkbox" role="switch" id="soundEnabled" ${state.settings.soundEnabled ? 'checked' : ''}></label><label class="switch-row" for="hapticsEnabled"><span>Виброотклик</span><input type="checkbox" role="switch" id="hapticsEnabled" ${state.settings.hapticsEnabled ? 'checked' : ''}></label><button class="button quiet" id="feedbackTest" type="button">Проверить отклик</button></section><div class="error" id="preferencesError" role="alert" hidden></div><p class="hint version-label">Версия ${APP_VERSION}</p>`;
  const paymentFields=['hourlyRate','basePace','premiumPace','minimumHours','criticalPace','paceBonusPercent','cycleBonusPercent'];
  const periodField=$('.payment-period'),fieldGrid=$('#paymentForm .form-grid');
  const paymentTitles=['Период','₽/час','Темп оплаты','Темп премии','Мин. часы','Крит. темп','% темп','% 12 недель'];
  periodField.insertAdjacentHTML('beforebegin',pager('paymentDeck',[
    {title:paymentTitles[0],html:periodField.outerHTML},
    ...paymentFields.map((key,index)=>({title:paymentTitles[index+1],html:fieldGrid.querySelector('#'+key).closest('.field').outerHTML}))
  ],{label:'Условия оплаты'}));
  periodField.remove();fieldGrid.remove();
  const paymentPager=bindPager($('#paymentDeck'));
  bottomNav('settings'); $('#goBack').addEventListener('click', summary);
  $('#themeSelect').addEventListener('change', event => {
    try { persist(updateSettings(state, { theme:event.target.value })); $('#preferencesError').hidden = true; }
    catch (error) { event.target.value = state.settings.theme; $('#preferencesError').textContent = error.message; $('#preferencesError').hidden = false; feedback('error'); }
  });
  $('#paymentPeriod').addEventListener('change', event => {
    const terms = paymentTermsFor(state,event.target.value);
    for (const key of ['hourlyRate','basePace','premiumPace','paceBonusPercent','cycleBonusPercent','minimumHours','criticalPace']) $('#' + key).value = String(terms[key] ?? (key==='minimumHours'?80:terms.basePace)).replace('.',',');
    $('#paymentError').hidden = true;
  });
  $('#paymentForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const rule = { effectivePeriodStart:$('#paymentPeriod').value };
      for (const key of ['hourlyRate','basePace','premiumPace','paceBonusPercent','cycleBonusPercent','minimumHours','criticalPace']) rule[key] = $('#' + key).value;
      const base=paymentTermsFor(state,rule.effectivePeriodStart);
      paymentFields.forEach((key,index)=>{
        try { setPaymentTerms(state,{...base,effectivePeriodStart:rule.effectivePeriodStart,[key]:rule[key]}); }
        catch(error) { paymentPager.go(index+1);$('#'+key).focus();throw error; }
      });
      persist(setPaymentTerms(state,rule));
      $('#paymentError').hidden = true; $('#paymentHistory').innerHTML = ruleHistory();
      notify(`Условия сохранены с ${formatDate(rule.effectivePeriodStart)}`);
    } catch (error) { $('#paymentError').textContent = error.message; $('#paymentError').hidden = false; feedback('error'); }
  });
  for (const key of ['soundEnabled', 'hapticsEnabled']) {
    $('#' + key).addEventListener('change', event => {
      try { persist(updateSettings(state, { [key]: event.target.checked })); $('#preferencesError').hidden = true; }
      catch (error) { event.target.checked = state.settings[key]; $('#preferencesError').textContent = error.message; $('#preferencesError').hidden = false; feedback('error'); }
    });
  }
  $('#feedbackTest').addEventListener('click', () => feedback('success')); resetScroll();
}
function field(key, label, value = '', { unit = '₽', full = false, integer = false, labelClass = '', note = '', signed = false, validation = false } = {}) {
  return `<div class="field${full ? ' full' : ''}"><label for="${key}" class="${labelClass}">${label}</label><div class="field-box"><input id="${key}" name="${key}" type="text" inputmode="${integer ? 'numeric' : 'decimal'}" autocomplete="off" maxlength="${integer ? 7 : 14}" class="with-unit${key === 'dailyOrders' ? ' orders-input' : ''}" value="${esc(value)}" aria-describedby="${key}-note${validation ? ` ${key}-error` : ''}" ${validation ? 'aria-invalid="false"' : ''} ${signed ? '' : ''}><span class="field-unit${key === 'dailyOrders' ? ' orders' : ''}" aria-hidden="true">${unit}</span></div>${note ? `<span class="field-note" id="${key}-note">${note}</span>` : `<span id="${key}-note" hidden></span>`}${validation ? `<span class="field-error" id="${key}-error" role="status" hidden></span>` : ''}</div>`;
}
function form(id = null) {
  const original = state.entries.find(e => e.id === id);
  if (id != null && !original) { notify('Запись не найдена. Откройте историю.'); return; }
  const entryId = original?.id ?? newEntryId();
  let saving = false;
  app.className = 'form-page';
  view = 'form'; editingId = original?.id ?? null;
  $('#bottomNav').hidden = true;
  const p = periodFor(selectedPeriod);
  const dateDefault = today() >= p.start && today() <= p.end ? today() : p.end;
  const e = original ?? { date: dateDefault };
  const carried = e.legacyReading?.interpretation === 'cumulative' && !e.legacyReading.hoursEdited;
  const inputHint = carried ? dayCaption(e) : ''; 
  // Earlier versions stored omitted deductions as 0; keep those fields optional on edit.
  const val = key => e[key] == null || (['tax', 'parkCommission'].includes(key) && e[key] === 0) ? '' : String(e[key]).replace('.', ',');
  app.innerHTML = `${heading(original ? 'Изменить запись' : 'Добавить слот')}<form id="dayForm" novalidate><div class="form-scroll"><div class="form-grid"><div class="field full"><label for="date">Дата</label><div class="date-box"><span id="dateVisible">${esc(formatDate(e.date, true))}</span>${icon.calendar}<input name="date" id="date" type="date" lang="ru" value="${esc(e.date)}" required></div><p class="form-period" id="formPeriod">Период: ${esc(periodLabel(periodFor(e.date)))}</p></div>
    ${inputHint ? `<p class="hint optional-reading">${esc(inputHint)}</p>` : ''}
    <p class="hint slot-hint" id="slotHint" hidden></p>
    ${field('dailyHours', carried ? 'Часы за интервал' : 'Часы за слот', val('dailyHours'), { unit: 'ч', labelClass: 'daily-label', note: carried ? 'Время между прежними записями' : '' })}
    ${field('dailyOrders', carried ? 'Заказы за интервал' : 'Заказы за слот', val('dailyOrders'), { integer: true, unit: 'заказов', labelClass: 'daily-label', note: carried ? 'Количество между записями' : '' })}
    ${field('reward', 'Вознаграждение', val('reward'), { full: true })}
    ${field('tax', 'Налог', val('tax'), { unit: '₽', note: `Ориентир ${TAX_PERCENT_MIN}–${TAX_PERCENT_MAX}%`, validation: true })}
    ${field('parkCommission', 'Комиссия парка', val('parkCommission'), { unit: '₽', note: `Ориентир ${PARK_COMMISSION_PERCENT}%`, validation: true })}
    ${field('tips', 'Чаевые', val('tips'))}${field('separateBonus', 'Отдельные бонусы', val('separateBonus'))}</div>
    <details class="additional slot-working"><summary>Рабочее время дня${icons.down}</summary><div id="slotWorkingEditor"></div></details>
    <div id="formError" class="error" role="alert" hidden></div>${original ? '<button type="button" id="deleteDay" class="danger-button">Удалить эту запись</button>' : ''}</div><div class="save-area"><button class="button primary" id="saveDay" type="submit">${original ? 'Сохранить изменения' : 'Сохранить слот'}</button></div></form>`;
  $('#goBack').addEventListener('click', () => { history(); });
  let workingDirty=false;
  function renderWorking(date) {
    workingDirty=false;
    const actual=state.forecast.days[date];
    const mode=!actual?.workConfirmed?'unknown':actual.precision==='intervals'?'intervals':actual.workingMin===0?'rest':'total';
    const host=$('#slotWorkingEditor');
    const work=actual?.intervals.filter(i=>i.state==='WORK')??[];
    const pauses=actual?.intervals.filter(i=>i.state==='UNAVAILABLE')??[];
    const unknown=actual?.intervals.filter(i=>i.state==='UNKNOWN')??[];
    const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    host.innerHTML=`<label for="slotWorkMode">Фактически работал</label><select id="slotWorkMode" class="period-select"><option value="unknown">Не указывать</option><option value="intervals">Интервалы С—До</option><option value="total">Итого за день</option><option value="rest">Выходной</option></select><div id="slotIntervals">${intervalField('slotWorkHours',mode==='intervals'?work:[],mode==='intervals'?actual.workingMin:null)}</div><div id="slotTotal">${field('slotWorkTotal','Часы фактической работы',mode==='total'?String(actual.workingMin/60).replace('.',','):'',{unit:'ч',full:true})}</div>${pauses.length?`<p class="hint">Сохранённая пауза: ${pauses.map(i=>clock(i.start)+'–'+clock(i.end)).join(', ')}</p>`:''}${unknown.length?`<p class="hint">Неизвестное окно: ${unknown.map(i=>clock(i.start)+'–'+clock(i.end)).join(', ')}</p>`:''}`;
    $('#slotWorkMode').value=mode;
    bindIntervals(host);
    const show=()=>{$('#slotIntervals').hidden=$('#slotWorkMode').value!=='intervals';$('#slotTotal').hidden=$('#slotWorkMode').value!=='total';};
    show();
    $('#slotWorkMode').addEventListener('change',()=>{workingDirty=true;show();});
    $('#slotWorkHours').addEventListener('input',()=>{workingDirty=true;});
    $('#slotWorkTotal').addEventListener('input',()=>{workingDirty=true;});
  }
  renderWorking(e.date);
  function refreshDeductions() {
    let check = null;
    try { check = deductionChecks({ reward: $('#reward').value, tax: $('#tax').value, parkCommission: $('#parkCommission').value }); }
    catch { /* The reward's number format is validated on save. */ }
    for (const key of ['tax', 'parkCommission']) {
      const rate = key === 'tax' ? `${TAX_PERCENT_MIN}–${TAX_PERCENT_MAX}%` : `${PARK_COMMISSION_PERCENT}%`;
      const guide = check ? (key === 'tax' ? `${money(check.expectedTax.min)}–${money(check.expectedTax.max)}` : money(check.expectedCommission)) : null;
      $(`#${key}-note`).textContent = `Ориентир ${rate}${guide ? `: ${guide}` : ''}`;
      const error = check?.errors.find(e => e.field === key);
      const warning = check?.warnings.find(e => e.field === key);
      const status = $(`#${key}-error`);
      status.textContent = error?.message ?? warning?.message ?? '';
      status.hidden = !error && !warning;
      status.classList.toggle('field-warning', Boolean(warning) && !error);
      $(`#${key}`).classList.toggle('has-warning', Boolean(warning) && !error);
      $(`#${key}`).setAttribute('aria-invalid', String(Boolean(error)));
    }
  }
  for (const key of ['reward', 'tax', 'parkCommission']) {
    $(`#${key}`).addEventListener('input', () => { refreshDeductions(); $('#formError').hidden = true; });
  }
  refreshDeductions();
  function refreshSlotHint() {
    const count = state.entries.filter(row => row.date === $('#date').value && row.id !== editingId).length;
    $('#slotHint').hidden = count === 0;
    $('#slotHint').textContent = `Других слотов за эту дату: ${count}`;
  }
  refreshSlotHint();
  $('#date').addEventListener('change', event => {
    try { $('#formPeriod').textContent = `Период: ${periodLabel(periodFor(event.target.value))}`; $('#dateVisible').textContent = formatDate(event.target.value, true); }
    catch { $('#formPeriod').textContent = ''; }
    refreshSlotHint();
    renderWorking(event.target.value);
  });
  $('#dayForm').addEventListener('submit', event => {
    event.preventDefault();
    if (saving) return;
    const fields = Object.fromEntries(new FormData(event.target));
    try {
      saving = true; $('#saveDay').disabled = true;
      refreshDeductions();
      // The retired supplementary fields remain in legacy entries and exports.
      let next = upsertEntry(state, { ...fields, displayedNet:original?.displayedNet ?? null, note:original?.note ?? '', id: entryId }, editingId);
      if (workingDirty) {
        const mode=$('#slotWorkMode').value;
        const actual=mode==='intervals'?intervalValue(app,'slotWorkHours'):{workingMin:mode==='total'?$('#slotWorkTotal').value:null};
        next=withSlotWorkingTime(next,fields.date,{mode,...actual});
      }
      persist(next);
      selectedPeriod = periodFor(fields.date).id;
      document.activeElement?.blur();
      summary(); notify('Запись сохранена');
    } catch (error) {
      saving = false; $('#saveDay').disabled = false;
      feedback('error');
      const node = $('#formError'); node.textContent = error.message; node.hidden = false;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  $('#deleteDay')?.addEventListener('click', () => {
    if (!confirm('Удалить только эту запись?')) return;
    try { persist({ ...state, entries: state.entries.filter(row => row.id !== editingId) }); history(); notify('Запись удалена'); }
    catch (error) { notify(error.message); }
  });
  resetScroll();
}

function dayCaption(e) {
  const legacy = e.legacyReading;
  if (!legacy) return '';
  if (legacy.interpretation === 'daily' || legacy.hoursEdited) return 'Прежняя дневная запись';
  return `Время ${legacy.fromDate ? `между ${formatDate(legacy.fromDate)} и ${formatDate(legacy.date)}` : `с начала периода по ${formatDate(legacy.date)}`}. Часы отдельных дней неизвестны.`;
}

function history() {
  app.className = '';
  view = 'history'; editingId = null;
  bottomNav('history');
  const s = calculate(state, selectedPeriod);
  const card = (e, title) => {
    const readingHtml = `<div class="day-meters"><span>${hoursText(e.dailyHours)} ч</span><span>${e.dailyOrders ?? '—'} заказов</span></div><p class="day-delta" ${!dayCaption(e) && e.dailyHours != null && e.dailyOrders != null ? 'hidden' : ''}>${esc(dayCaption(e))}${e.dailyHours == null ? ' · часы не записаны' : ''}${e.dailyOrders == null ? ' · заказы не записаны' : ''}</p>`;
    return `<article class="day-card"><div class="day-head"><h2>${esc(title)}</h2><button class="edit-day" data-date="${e.date}" data-entry="${esc(e.id)}" type="button" aria-label="Редактировать ${esc(title)}">Изменить</button></div>${readingHtml}<div class="day-row"><span>Вознаграждение</span>${amount(e.reward)}</div><div class="day-row"><span>Чаевые</span>${amount(e.tips)}</div><div class="day-row"><span>Отдельные бонусы</span>${amount(e.separateBonus)}</div>${e.displayedNet != null ? `<div class="day-row"><span>Итог на экране</span>${amount(e.displayedNet)}</div>` : ''}${e.note ? `<p class="day-note">${esc(e.note)}</p>` : ''}</article>`;
  };
  const groups = [...new Set(s.entries.map(e => e.date))].reverse().map(date => {
    const d = calculateDay(state, date);
    if (d.entries.length === 1) return card(d.entries[0], formatDate(date, true));
    return `<section class="day-group"><h2>${esc(formatDate(date, true))}</h2><p class="day-total">Всего за день: ${hoursText(d.hours)} ч · ${d.orders ?? '—'} заказов<br>Вознаграждение: ${esc(money(d.paidReward))}</p><div class="slot-list">${d.entries.map((e, i) => card(e, `Слот ${i + 1}`)).reverse().join('')}</div></section>`;
  });
  app.innerHTML = `${heading('История')}${navigation()}<div class="history-list">${groups.join('')}</div>${s.entries.length ? '' : '<div class="empty-history"><h2>Пока нет записей</h2><p>Добавьте часы, заказы и выплаты за слот.</p></div>'}
    ${s.closure ? `<p class="closure-fact">Период закрыт. Финальная доплата: ${esc(money(s.closure.finalAdjustment))}</p>` : ''}
    <div class="history-footer"><button class="button quiet export-action" id="historyExport" type="button">${icons.share}Экспорт для ChatGPT</button><button class="button quiet" id="closePeriod" type="button">${s.closure ? 'Изменить закрытие периода' : 'Закрытие периода'}</button><button class="button quiet" id="importData" type="button">Импорт JSON</button><input type="file" id="importInput" accept=".json,application/json" hidden></div>`;
  $('#goBack').addEventListener('click', summary);
  bindNavigation(history);
  document.querySelectorAll('.edit-day').forEach(button => button.addEventListener('click', () => form(button.dataset.entry)));
  
  $('#historyExport').addEventListener('click', () => $('#exportDialog').showModal());
  $('#closePeriod').addEventListener('click', closure);
  $('#importData').addEventListener('click', () => {
    if (Native) Native.importData(); else $('#importInput').click();
  });
  $('#importInput').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2000000) { notify('Файл больше 2 МБ.'); return; }
    try { window.receiveImport(await file.text()); } catch (error) { notify(error.message); }
    event.target.value = '';
  });
  resetScroll();
}

function closure() {
  app.className = '';
  view = 'closure';
  $('#bottomNav').hidden = true;
  const old = state.closures[selectedPeriod];
  app.innerHTML = `${heading('Закрытие периода')}<p class="closure-info">${esc(periodLabel(selectedPeriod))}</p><form id="closureForm" novalidate>${field('finalAdjustment', 'Финальная доплата', old?.finalAdjustment == null ? '' : String(old.finalAdjustment).replace('.', ','), { signed: true, note: 'Фактическая сумма «Бонусы и корректировки»' })}<div class="additional"><div class="field"><label for="closureNote">Примечание</label><textarea id="closureNote" name="note" placeholder="Необязательно" maxlength="4000">${esc(old?.note)}</textarea></div></div><div id="closureError" class="error" role="alert" hidden></div><div class="save-area"><button class="button primary" type="submit">Сохранить закрытие</button></div>${old ? '<button type="button" id="reopenPeriod" class="danger-button">Снять отметку о закрытии</button>' : ''}</form>`;
  $('#goBack').addEventListener('click', history);
  $('#closureForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (!$('#finalAdjustment').value.trim()) throw new Error('Введите финальную доплату. Можно указать 0.');
      const fact = { finalAdjustment: parseMoney($('#finalAdjustment').value, 'Финальная доплата', true), note: $('#closureNote').value.trim(), closedAt: old?.closedAt ?? new Date().toISOString() };
      persist({ ...state, closures: { ...state.closures, [selectedPeriod]: fact } });
      history(); notify('Закрытие сохранено');
    } catch (error) { feedback('error'); $('#closureError').textContent = error.message; $('#closureError').hidden = false; }
  });
  $('#reopenPeriod')?.addEventListener('click', () => {
    const next = { ...state, closures: { ...state.closures } }; delete next.closures[selectedPeriod];
    try { persist(next); history(); notify('Период открыт'); } catch (error) { notify(error.message); }
  });
  resetScroll();
}

async function exportFile(backup, share) {
  const stamp = today();
  const filename = backup ? `courier-backup-${stamp}.json` : `courier-report-${stamp}.md`;
  const mime = backup ? 'application/json' : 'text/markdown';
  const content = backup ? JSON.stringify(state) : markdownReport(state, selectedPeriod, stamp);
  if (Native) {
    Native.exportFile(filename, content, mime, share ? 'share' : 'save');
    return;
  }
  const file = new File([content], filename, { type: mime });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Доход курьера' }); }
    catch (error) { if (error.name !== 'AbortError') notify('Не удалось поделиться. Используйте «Сохранить файл».'); }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (share) notify('Файл скачан. Прикрепите его к чату ChatGPT.');
}
$('#shareReport').addEventListener('click', () => exportFile(false, true));
$('#saveReport').addEventListener('click', () => exportFile(false, false));
$('#backupReport').addEventListener('click', () => exportFile(true, false));
$('#closeExport').addEventListener('click', () => $('#exportDialog').close());
window.receiveImport = text => {
  try {
    const raw = JSON.parse(text);
    const checked = normalizeState(raw);
    pendingImport = raw;
    $('#importDescription').textContent = `Записей в файле: ${checked.entries.length}; дней: ${new Set(checked.entries.map(e => e.date)).size}; закрытых периодов: ${Object.keys(checked.closures).length}.`;
    $('#importError').hidden = true;
    $('#importDialog').showModal();
  } catch (error) { notify(`Не удалось импортировать: ${error.message}`); }
};
$('#cancelImport').addEventListener('click', () => { pendingImport = null; $('#importDialog').close(); });
$('#confirmImport').addEventListener('click', () => {
  try {
    if (!pendingImport) return;
    persist(mergeImport(state ?? emptyState(), pendingImport));
    pendingImport = null;
    $('#importDialog').close(); history(); notify('Данные импортированы');
  } catch (error) { feedback('error'); $('#importError').textContent = error.message; $('#importError').hidden = false; }
});
window.appBack = () => {
  const openDialog = document.querySelector('dialog[open]');
  if (openDialog) { openDialog.close(); return true; }
  if (view === 'summary') return false;
  if (view === 'forecast' && forecastScreen?.back()) return true;
  if (view === 'form' || view === 'closure') history(); else summary();
  return true;
};

try {
  const raw = Native ? Native.readState() : localStorage.getItem('courier-finance-v1');
  state = raw ? normalizeState(JSON.parse(raw)) : emptyState();
  applyAppearance();
  summary();
  if (Object.keys(state.forecast.days).length || state.forecast.profiles.length) {
    try { persist({...state,forecast:evaluateForecasts(snapshotIfPossible(syncSlots(state.forecast,state.entries)))},true); }
    catch(error) { notify(error.message); }
  }
} catch (error) {
  app.innerHTML = `<div class="fatal"><h1>Не удалось открыть данные</h1><p>${esc(error.message)}</p><p>Сохранённые записи не изменены. Можно восстановить резервную копию JSON.</p><button id="recover" class="button primary" type="button">Открыть резервную копию</button><input id="recoverFile" type="file" accept=".json,application/json" hidden></div>`;
  $('#recover').addEventListener('click', () => { if (Native) Native.importData(); else $('#recoverFile').click(); });
  $('#recoverFile').addEventListener('change', async event => { const file = event.target.files[0]; if (file) window.receiveImport(await file.text()); });
}
Native?.ready();

// Refresh date boundaries on return from the background; never promise an exact background alarm.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;try{persist({...state},true);if(view==='summary')summary();}catch(error){notify(error.message);}});
