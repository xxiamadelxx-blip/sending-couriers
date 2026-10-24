import { emptyForecast, normalizeForecast, mergeForecast, forecastReport, weekPlan,forecastDay, addDays } from './forecast.mjs';
export const RATE = 360;
export const THRESHOLD = 1.8;
export const SCHEMA_VERSION = 6;
export const APP_VERSION = '1.7.13';
export const MIN_PAYMENT_HOURS = 80;
export const PREMIUM_PACE = 2.8;
export const PREMIUM_PERCENT = 5;
export const TAX_PERCENT_MIN = 4;
export const TAX_PERCENT_MAX = 6;
export const PARK_COMMISSION_PERCENT = 5;
const DAY = 86400000;
const ANCHOR = Date.UTC(2026, 8, 18);
const moneyFields = ['reward', 'tax', 'parkCommission', 'tips', 'separateBonus'];

export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k).value).join('-');
}
export function dateMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Выберите дату.');
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) throw new Error('Дата должна быть между 1900 и 2200 годом.');
  const stamp = Date.UTC(year, month - 1, day);
  if (new Date(stamp).toISOString().slice(0, 10) !== value) throw new Error('Проверьте дату.');
  return stamp;
}
export function isoDate(stamp) { return new Date(stamp).toISOString().slice(0, 10); }
export function periodFor(date) {
  const stamp = dateMillis(date);
  const start = ANCHOR + Math.floor((stamp - ANCHOR) / (14 * DAY)) * 14 * DAY;
  return { id: isoDate(start), start: isoDate(start), end: isoDate(start + 13 * DAY) };
}
export function shiftPeriod(id, step) { return periodFor(isoDate(dateMillis(id) + step * 14 * DAY)); }
export function formatDate(date, long = false) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC', day: 'numeric', month: long ? 'long' : 'short', year: 'numeric'
  }).format(new Date(dateMillis(date))).replace(/ г\.$/, '');
}
export function periodLabel(period) {
  const p = typeof period === 'string' ? periodFor(period) : period;
  const formatter = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  return `${formatter.format(new Date(dateMillis(p.start)))} — ${formatter.format(new Date(dateMillis(p.end)))} ${p.end.slice(0, 4)}`;
}
export function parseInteger(raw, label) {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s)) || Number(s) > 1000000) {
    throw new Error(`${label}: введите целое число от 0 до 1 000 000.`);
  }
  return Number(s);
}
export function parseHours(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) throw new Error('Часы за день: введите 0 или положительное число, до двух знаков после запятой.');
  if (Number(s) > 1000000) throw new Error('Часы за день: число слишком велико.');
  return Math.round(Number(s) * 100) / 100;
}
export function hoursText(value) {
  return value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}
export function parseMoney(raw, label = 'Сумма', signed = false) {
  const s = String(raw ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!s) return 0;
  const pattern = signed ? /^-?\d+(?:\.\d{0,2})?$/ : /^\d+(?:\.\d{0,2})?$/;
  if (!pattern.test(s)) throw new Error(`${label}: введите сумму в рублях, до двух знаков после запятой.`);
  const amount = Number(s);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1000000000) throw new Error(`${label}: сумма слишком велика.`);
  return Math.round(amount * 100) / 100;
}
export function money(amount) {
  if (amount == null) return '— ₽';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}
export function deductionChecks(input) {
  const reward = parseMoney(input.reward, 'Вознаграждение');
  const rewardCents = Math.round(reward * 100);
  const percentCents = percent => Math.floor((rewardCents * percent + 50) / 100);
  const taxMin = percentCents(TAX_PERCENT_MIN), taxMax = percentCents(TAX_PERCENT_MAX);
  const commission = percentCents(PARK_COMMISSION_PERCENT);
  const expectedTax = { min: taxMin / 100, max: taxMax / 100 };
  const expectedCommission = commission / 100;
  const errors = [];
  const warnings = [];
  for (const [field, label] of [['tax', 'Налог'], ['parkCommission', 'Комиссия парка']]) {
    if (input[field] == null || String(input[field]).trim() === '') continue;
    try {
      const entered = parseMoney(input[field], label);
      const enteredCents = Math.round(entered * 100);
      const outside = field === 'tax' ? enteredCents < taxMin || enteredCents > taxMax : enteredCents !== commission;
      if (outside) {
        warnings.push({ field, message: 'Сумма вне ориентира. Сумму можно сохранить.' });
      }
    } catch (error) { errors.push({ field, message: error.message }); }
  }
  return { reward, expectedTax, expectedCommission, warnings, errors };
}
export function paceText(pace) { return pace == null ? '—' : pace.toFixed(3).replace('.', ','); }
export function reserveMinutes(hours, orders, hiddenMinutes = 0, threshold = THRESHOLD) {
  // Only migrated cumulative readings retain their old unknown minute remainder.
  return Math.max(0, Math.floor((orders / threshold - hours - hiddenMinutes / 60) * 60 + 1e-8));
}
export function reserveText(minutes) {
  if (minutes == null) return '—';
  if (minutes === 0) return '0 ч';
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
export const DEFAULT_PAYMENT_TERMS = Object.freeze({ hourlyRate: RATE, basePace: THRESHOLD, premiumPace: PREMIUM_PACE, paceBonusPercent: PREMIUM_PERCENT, cycleBonusPercent: PREMIUM_PERCENT });
const paymentLabels = {hourlyRate:'Ставка за час',basePace:'Темп для оплаты',premiumPace:'Темп для премии',paceBonusPercent:'Премия за темп',cycleBonusPercent:'Премия за 12 недель',minimumHours:'Минимум часов',criticalPace:'Критический темп'};
function paymentNumber(value, key) {
  const raw = String(value ?? '').trim().replace(',', '.');
  const precision = key.endsWith('Pace') ? 3 : 2;
  if (!new RegExp('^\\d+(?:\\.\\d{1,' + precision + '})?$').test(raw)) throw new Error(`${paymentLabels[key]}: проверьте число.`);
  const number = Number(raw), maximum = key === 'hourlyRate' ? 1000000 : key === 'minimumHours' ? 336 : key.endsWith('Pace') ? 1000 : 100;
  if (!Number.isFinite(number) || number > maximum || (key.endsWith('Percent') ? number < 0 : number <= 0)) throw new Error(`${paymentLabels[key]}: ${key.endsWith('Percent') ? 'от 0 до 100%' : `больше 0 и не больше ${maximum}`}.`);
  return number;
}
function normalizePaymentRule(input) {
  if (!input || typeof input !== 'object') throw new Error('Проверьте условия оплаты.');
  const effectivePeriodStart = String(input.effectivePeriodStart ?? '');
  dateMillis(effectivePeriodStart);
  const result = {effectivePeriodStart};
  for (const key of Object.keys(DEFAULT_PAYMENT_TERMS)) result[key] = paymentNumber(input[key], key);
  for (const key of ['minimumHours','criticalPace']) if (input[key] != null && input[key] !== '') result[key] = paymentNumber(input[key],key);
  return result;
}
function normalizePaymentRules(input = []) {
  if (!Array.isArray(input) || input.length > 500) throw new Error('Проверьте историю условий оплаты.');
  const rules = input.map(normalizePaymentRule).sort((a,b)=>a.effectivePeriodStart.localeCompare(b.effectivePeriodStart));
  if (new Set(rules.map(r=>r.effectivePeriodStart)).size !== rules.length) throw new Error('Условия оплаты за одну дату повторяются.');
  return rules;
}
export function paymentTermsFor(state, period) {
  dateMillis(period);
  return (state.settings?.paymentRules ?? []).filter(r=>r.effectivePeriodStart <= period).at(-1) ?? DEFAULT_PAYMENT_TERMS;
}
export function setPaymentTerms(state, input) {
  const rule = normalizePaymentRule(input);
  return updateSettings(state, {paymentRules:[...(state.settings?.paymentRules ?? []).filter(r=>r.effectivePeriodStart !== rule.effectivePeriodStart),rule]});
}
export function goalText(number) { return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:3}).format(number); }
export function percentText(number) { return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(number); }
function baseForHours(hundredths, rate) {
  const cents = (BigInt(hundredths) * BigInt(Math.round(rate * 100)) + 50n) / 100n;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Почасовая сумма слишком велика. Проверьте часы и ставку.');
  return Number(cents) / 100;
}
function ratedHours(state, entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.dailyHours == null) continue;
    const terms = paymentTermsFor(state, entry.date);
    const key = `${terms.hourlyRate}|${terms.cycleBonusPercent}`;
    const group = groups.get(key) ?? {hourlyRate:terms.hourlyRate,cycleBonusPercent:terms.cycleBonusPercent,hundredths:0};
    group.hundredths += Math.round(entry.dailyHours * 100);
    groups.set(key,group);
  }
  return [...groups.values()].map(group=>({...group,base:baseForHours(group.hundredths,group.hourlyRate)}));
}
function ratedBase(state, entries) {
  return ratedHours(state,entries).reduce((sum,part)=>sum+Math.round(part.base*100),0)/100;
}
function percentage(amount, percent) {
  if (amount == null) return null;
  const cents = (BigInt(Math.round(amount * 100)) * BigInt(Math.round(percent * 100)) + 5000n) / 10000n;
  return Number(cents) / 100;
}
function requiredOrderCount(hundredths, pace) { return Number((BigInt(hundredths) * BigInt(Math.round(pace*1000)) + 99999n) / 100000n); }
function reachesPace(hundredths, orders, pace) { return BigInt(orders)*100000n >= BigInt(hundredths)*BigInt(Math.round(pace*1000)); }
export function emptyState() { return { schemaVersion: SCHEMA_VERSION, entries: [], closures: {}, settings: normalizeSettings(), forecast:emptyForecast() }; }
function normalizeSettings(input) {
  const start = input?.premiumCycleStart;
  if (start != null && start !== '') dateMillis(start);
  if (start && dateMillis(start) + 83 * DAY > dateMillis('2200-12-31')) throw new Error('Для полного цикла выберите начало не позднее 9 октября 2200 года.');
  for (const key of ['soundEnabled', 'hapticsEnabled']) {
    if (input?.[key] != null && typeof input[key] !== 'boolean') throw new Error('Проверьте настройки отклика.');
  }
  const theme = input?.theme ?? 'dark';
  if (!['dark','light'].includes(theme)) throw new Error('Выберите дневную или ночную тему.');
  return { premiumCycleStart: start == null || start === '' ? null : start,
    soundEnabled: input?.soundEnabled ?? true, hapticsEnabled: input?.hapticsEnabled ?? true, theme, paymentRules:normalizePaymentRules(input?.paymentRules) };
}
export function updateSettings(state, input) {
  // The existing fortnight calendar and all original records remain untouched.
  return { ...state, schemaVersion:SCHEMA_VERSION, settings: normalizeSettings({ ...state.settings, ...input }) };
}
export function calculateScenario({ hours: rawHours, orders: rawOrders }, terms = DEFAULT_PAYMENT_TERMS) {
  const hours = String(rawHours ?? '').trim() === '' ? null : parseHours(rawHours);
  const orders = String(rawOrders ?? '').trim() === '' ? null : parseInteger(rawOrders, 'Заказы');
  const hundredths = hours == null ? null : Math.round(hours * 100);
  const hourlyBase = hundredths == null ? null : baseForHours(hundredths,terms.hourlyRate);
  const pace = hours > 0 && orders != null ? orders / hours : null;
  const normOrders = hundredths == null ? null : requiredOrderCount(hundredths,terms.basePace);
  const premiumOrders = hundredths == null ? null : requiredOrderCount(hundredths,terms.premiumPace);
  return { hours, orders, hourlyBase, pace, normOrders, premiumOrders,
    missingNorm: orders == null || normOrders == null ? null : Math.max(0, normOrders - orders),
    missingPremium: orders == null || premiumOrders == null ? null : Math.max(0, premiumOrders - orders),
    pacePremium: pace == null ? null : reachesPace(hundredths,orders,terms.premiumPace) ? percentage(hourlyBase,terms.paceBonusPercent) : 0,
    reserve: pace == null ? null : reserveMinutes(hours, orders,0,terms.basePace) };
}
// One financial path for week/fortnight scenarios. Facts and forecasts are never added twice.
export function forecastFinances(state, start, overrides = {}, clockDate = today()) {
  const week = weekPlan(state.forecast, start, overrides);
  // A day is predicted once per evaluation, shared by the week and fortnight.
  const projected = new Map(week.days.map(d=>[d.date,d]));
  const plannedDay = date => {if(!projected.has(date))projected.set(date,forecastDay(state.forecast,date,overrides));return projected.get(date);};
  const calculateRange = (from, count) => {
    let orders=0, hours=0, complete=true, hasPrediction=false;
    const rows=[];
    for(let i=0;i<count;i++) {
      const date=addDays(from,i),fact=state.forecast.days[date];
      const planned=date<clockDate?null:plannedDay(date);
      const slots=state.entries.filter(e=>e.date===date&&!e.legacyReading?.fromDate);
      let n=null,m=null,source='unknown',lower=null,upper=null;
      if(date<clockDate) {
        // The user's confirmed day total wins; existing slots are an alternative source.
        n=fact?.completed&&fact.ordersConfirmed&&!fact.conflicts.length?fact.orders:slots.length&&slots.every(e=>e.dailyOrders!=null)?slots.reduce((s,e)=>s+e.dailyOrders,0):null;
        m=fact?.accountedConfirmed?fact.appAccountedMin:slots.length&&slots.every(e=>e.dailyHours!=null)?slots.reduce((s,e)=>s+e.dailyHours*60,0):null;
        source='fact';
        lower=upper=n;
      } else if(date===clockDate && fact?.ordersConfirmed && !fact.conflicts.length) {
        if(fact.completed) {n=fact.orders;m=fact.accountedConfirmed?fact.appAccountedMin:null;source='fact';lower=upper=n;}
        else {
          const asOf=fact.asOfMinute;
          const remaining=asOf==null?null:planned.intervals.filter(i=>i.state==='WORK'&&i.end>asOf).reduce((n,i)=>n+i.end-Math.max(i.start,asOf),0);
          const remainingWindows=asOf==null?[]:planned.intervals.filter(i=>i.state==='WORK'&&i.end>asOf).map(i=>({...i,start:Math.max(i.start,asOf)}));
          const estimate=remaining==null?null:weekPlan(state.forecast,date,{[date]:{workingMin:remaining,accountedMin:planned.accountedMin,precision:'intervals',intervals:remainingWindows}}).days[0].forecast;
          n=estimate?.central==null?null:fact.orders+estimate.central;m=planned.accountedMin;source='fact+remaining';hasPrediction=true;
          lower=estimate?.lower==null?null:fact.orders+estimate.lower;upper=estimate?.upper==null?null:fact.orders+estimate.upper;
        }
      } else if(planned) { n=planned.forecast.central; m=planned.accountedMin;source='scenario';hasPrediction=true;lower=planned.forecast.lower;upper=planned.forecast.upper; }
      if(n==null||m==null) complete=false;
      const workingMin=date<clockDate||date===clockDate&&fact?.completed?fact?.workConfirmed?fact.workingMin:null:planned.workingMin;
      if(m>1440) {m=null;complete=false;}
      orders+=n??0;hours+=(m??0)/60;rows.push({date,orders:n,accountedMin:m,workingMin,source,lower,upper});
    }
    const to=addDays(from,count-1),asOf=to < clockDate ? to : clockDate < from ? from : clockDate;
    const terms=paymentTermsFor(state,asOf),minimumHours=terms.minimumHours??MIN_PAYMENT_HOURS;
    const scenario=calculateScenario({hours:complete?hours.toFixed(2):'',orders:complete?orders:''},terms);
    const byRate=new Map();
    for(const row of rows)if(row.accountedMin!=null){const rate=paymentTermsFor(state,row.date).hourlyRate;byRate.set(rate,(byRate.get(rate)??0)+row.accountedMin);}
    const base=complete?[...byRate].reduce((n,[rate,minutes])=>n+Math.round(baseForHours(Math.round(minutes/60*100),rate)*100),0)/100:null;
    const result={...scenario,hourlyBase:base,pacePremium:scenario.pacePremium==null?null:scenario.pacePremium===0?0:percentage(base,terms.paceBonusPercent)};
    const critical=calculateScenario({hours:complete?hours.toFixed(2):'',orders:complete?orders:''},{...terms,basePace:terms.criticalPace??terms.basePace});
    const lowerOrders=rows.every(r=>r.lower!=null)?rows.reduce((n,r)=>n+r.lower,0):null;
    const upperOrders=rows.every(r=>r.upper!=null)?rows.reduce((n,r)=>n+r.upper,0):null;
    return {...result,from,to,rows,complete,hasPrediction,terms,minimumHours,
      lowerOrders,upperOrders,belowCritical:complete?critical.missingNorm>0:null,
      missingHours:complete?Math.max(0,minimumHours-hours):null,
      risk:!complete?'unknown':hours<minimumHours||result.missingNorm>0?'high':hasPrediction&&lowerOrders<result.normOrders?'medium':hasPrediction?'conditional':'met',
      conditionalIncome:complete?result.hourlyBase:null};
  };
  const weekFinancial=calculateRange(start,7),fortnight=calculateRange(periodFor(start).start,14);
  const projectedDays=week.days.map((d,i)=>{
    const r=weekFinancial.rows[i];return {...d,workingMin:r.workingMin,accountedMin:r.accountedMin,status:r.source,
      forecast:{...d.forecast,central:r.orders,lower:r.lower,upper:r.upper}};
  });
  const sum=key=>weekFinancial.rows.every(r=>r[key]!=null)?weekFinancial.rows.reduce((n,r)=>n+r[key],0):null;
  return {week:{...week,days:projectedDays,central:sum('orders'),lower:sum('lower'),upper:sum('upper'),workingMin:sum('workingMin'),accountedMin:sum('accountedMin')},weekFinancial,fortnight};
}
export function calculatePremiumCycle(state, date = today()) {
  const anchor = state.settings?.premiumCycleStart;
  if (!anchor) return { status: 'unconfigured', start: null, end: null, premium: null, hourlyBase: null, hours: null, entries: [], missingHours: 0, elapsedDays: 0, cycleNumber: null, boundaryEntries: [], boundaryNote: '', breakdown:[] };
  const stamp = dateMillis(date), first = dateMillis(anchor);
  const cycleNumber = Math.max(0, Math.floor((stamp - first) / (84 * DAY)));
  const startStamp = first + cycleNumber * 84 * DAY;
  const start = isoDate(startStamp), end = isoDate(startStamp + 83 * DAY);
  const beforeStart = stamp < first;
  const entries = state.entries.filter(e => e.date >= start && e.date <= end).slice().sort(entryOrder);
  const known = entries.filter(e => e.dailyHours != null);
  const hours = known.length ? known.reduce((acc, e) => acc + Math.round(e.dailyHours * 100), 0) / 100 : null;
  const grouped = new Map();
  for (const entry of known) { const key = periodFor(entry.date).id; const rows=grouped.get(key)??[];rows.push(entry);grouped.set(key,rows); }
  const breakdown = [...grouped].sort(([a],[b])=>a.localeCompare(b)).flatMap(([periodId,rows])=>{
    return ratedHours(state,rows).map(part=>({periodId,hours:part.hundredths/100,hourlyRate:part.hourlyRate,
      cycleBonusPercent:part.cycleBonusPercent,hourlyBase:part.base,premium:percentage(part.base,part.cycleBonusPercent)}));
  });
  const hourlyBase = hours == null ? null : breakdown.reduce((sum,b)=>sum+Math.round(b.hourlyBase*100),0)/100;
  const premium = hours == null ? null : breakdown.reduce((sum,b)=>sum+Math.round(b.premium*100),0)/100;
  const boundaryEntries = state.entries.filter(e => {
    const legacy = e.legacyReading;
    if (legacy?.interpretation !== 'cumulative' || legacy.hoursEdited || !(e.dailyHours > 0)) return false;
    const from = legacy.fromDate ? isoDate(dateMillis(legacy.fromDate) + DAY) : periodFor(legacy.date).start;
    const overlaps = from <= end && legacy.date >= start;
    return (overlaps && (from < start || legacy.date > end)) || (legacy.date !== e.date && (overlaps || (e.date >= start && e.date <= end)));
  });
  const boundaryNote = boundaryEntries.length ? 'Старые накопительные интервалы пересекают границу цикла или перенесены на другую дату. Часы отнесены по датам записей; точно разделить их по границе невозможно. Премия за 12 недель — оценка.' : '';
  return {
    status: beforeStart ? 'not-started' : 'estimate', start, end, entries, hours, hourlyBase,
    premium: beforeStart ? null : premium, breakdown, missingHours: entries.length - known.length,
    elapsedDays: Math.min(84, Math.max(0, Math.floor((stamp - startStamp) / DAY) + 1)), cycleNumber: cycleNumber + 1,
    boundaryEntries, boundaryNote
  };
}
export function newEntryId() {
  return globalThis.crypto?.randomUUID?.() ?? `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function checkEntryId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(id)) throw new Error('Проверьте идентификатор записи.');
  return id;
}
function entryOrder(a, b) { return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt); }
export function entriesFor(state, id) {
  return state.entries.filter(e => e.periodId === id).slice().sort(entryOrder);
}
export function pendingLegacy(state, id) {
  return entriesFor(state, id).filter(e => e.legacyReading?.interpretation === 'pending');
}
export function calculate(state, id, asOf = null) {
  const entries = entriesFor(state, id);
  const period = periodFor(id);
  const terms = paymentTermsFor(state,asOf ?? (period.end < today() ? period.end : today() < period.start ? period.start : today()));
  const latest = entries.at(-1);
  const sum = key => entries.reduce((acc, row) => acc + Math.round(row[key] * 100), 0) / 100;
  const hoursRecorded = entries.filter(e => e.dailyHours != null).length;
  const ordersRecorded = entries.filter(e => e.dailyOrders != null).length;
  const pendingCount = pendingLegacy(state, id).length;
  const hoursHundredths = entries.reduce((acc, e) => acc + Math.round((e.dailyHours ?? 0) * 100), 0);
  const hours = pendingCount || !hoursRecorded ? null : hoursHundredths / 100;
  const orders = pendingCount || !ordersRecorded ? null : entries.reduce((acc, e) => acc + (e.dailyOrders ?? 0), 0);
  const base = hours == null ? null : ratedBase(state,entries);
  const paidReward = latest ? sum('reward') : null;
  const tips = latest ? sum('tips') : null;
  const separateBonus = latest ? sum('separateBonus') : null;
  const matchedCounters = entries.every(e => (e.dailyHours == null) === (e.dailyOrders == null));
  // Independent optional counters contribute to period totals. Missing cells stay
  // unknown in storage; they do not suppress a ratio of the recorded totals.
  const pace = hours > 0 && orders != null ? orders / hours : null;
  // Compare integer counters, not the rounded pace displayed in the interface.
  const pacePremium = pace == null ? null : reachesPace(hoursHundredths,orders,terms.premiumPace) ? percentage(base,terms.paceBonusPercent) : 0;
  const hiddenMinutes = entries.some(e => e.legacyReading?.interpretation === 'cumulative' && !e.legacyReading.hoursEdited) ? 59 : 0;
  const minimumHours = terms.minimumHours ?? MIN_PAYMENT_HOURS;
  const hoursMet = hours == null ? null : hoursHundredths >= minimumHours * 100;
  const paceMet = pace == null ? null : reachesPace(hoursHundredths,orders,terms.basePace);
  const complete = entries.length > 0 && hoursRecorded === entries.length && ordersRecorded === entries.length && !pendingCount && !hiddenMinutes;
  const paymentConditions = {
    status: hoursMet === false || paceMet === false ? 'risk' : hoursMet && paceMet && complete ? 'met' : 'unknown',
    minimumHours, hoursMet, paceMet,
    missingHours: hours == null ? null : Math.max(0,Math.round(minimumHours * 100)-hoursHundredths)/100,
    missingOrders: hours == null || orders == null ? null : Math.max(0,requiredOrderCount(hoursHundredths,terms.basePace)-orders), complete
  };
  return {
    paymentConditions,
    entries, latest, hours, orders, pace, terms, requiredOrders: hours == null ? null : requiredOrderCount(hoursHundredths,terms.basePace), hoursRecorded, ordersRecorded, pendingCount, matchedCounters, hiddenMinutes,
    dayCount: new Set(entries.map(e => e.date)).size,
    reserve: pace != null ? reserveMinutes(hours, orders, hiddenMinutes,terms.basePace) : null,
    hourlyBase: base, paidReward, tips, separateBonus, pacePremium,
    tax: latest ? sum('tax') : null, parkCommission: latest ? sum('parkCommission') : null,
    grossUserIncome: base != null ? Math.round((base + tips + separateBonus) * 100) / 100 : null,
    estimatedYandexOwed: base != null ? Math.round((base - paidReward) * 100) / 100 : null,
    closure: state.closures[id] ?? null
  };
}
export function calculateDay(state, date) {
  return calculate({ ...state, entries: state.entries.filter(e => e.date === date) }, periodFor(date).id, date);
}
export function normalizeEntry(input, now = new Date().toISOString()) {
  if (!input || typeof input !== 'object') throw new Error('Проверьте запись дня.');
  const date = String(input.date ?? '');
  const periodId = periodFor(date).id;
  const labels = { reward: 'Вознаграждение', tax: 'Налог', parkCommission: 'Комиссия парка', tips: 'Чаевые', separateBonus: 'Отдельные бонусы' };
  const hoursMissing = input.dailyHours == null || String(input.dailyHours).trim() === '';
  const ordersMissing = input.dailyOrders == null || String(input.dailyOrders).trim() === '';
  const row = {
    id: checkEntryId(input.id ?? newEntryId()), date, periodId,
    dailyHours: hoursMissing ? null : parseHours(input.dailyHours),
    dailyOrders: ordersMissing ? null : parseInteger(input.dailyOrders, 'Заказы за день'),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now, updatedAt: now,
    note: String(input.note ?? '').trim().slice(0, 4000)
  };
  for (const field of moneyFields) row[field] = parseMoney(input[field], labels[field]);
  if (input.displayedNet != null && String(input.displayedNet).trim() !== '') row.displayedNet = parseMoney(input.displayedNet, 'Итоговая сумма');
  if (input.finalAdjustment != null && String(input.finalAdjustment).trim() !== '') row.finalAdjustment = parseMoney(input.finalAdjustment, 'Финальная доплата', true);
  if (input.legacyReading != null) {
    const legacy = input.legacyReading;
    if (!legacy || typeof legacy !== 'object' || !['pending', 'daily', 'cumulative'].includes(legacy.interpretation)) throw new Error('Проверьте формат прежних показаний.');
    const sourceDate = String(legacy.date ?? date);
    dateMillis(sourceDate);
    row.legacyReading = {
      date: sourceDate, hours: parseInteger(legacy.hours, 'Прежние часы'), orders: parseInteger(legacy.orders, 'Прежние заказы'),
      interpretation: legacy.interpretation, edited: legacy.edited === true, hoursEdited: legacy.hoursEdited === true,
      fromDate: legacy.fromDate == null ? null : String(legacy.fromDate)
    };
    if (row.legacyReading.fromDate != null) dateMillis(row.legacyReading.fromDate);
    if (legacy.interpretation === 'pending' && (row.dailyHours != null || row.dailyOrders != null || row.legacyReading.edited || row.legacyReading.hoursEdited || sourceDate !== date)) throw new Error('Прежние показания ещё не перенесены.');
  }
  return row;
}
function normalizeLegacyEntry(input, now) {
  const hoursMissing = input.displayedHours == null || String(input.displayedHours).trim() === '';
  const ordersMissing = input.displayedOrders == null || String(input.displayedOrders).trim() === '';
  if (hoursMissing !== ordersMissing) throw new Error('В прежней записи часы и заказы должны быть указаны вместе.');
  return normalizeEntry({
    ...input, dailyHours: null, dailyOrders: null,
    legacyReading: hoursMissing ? undefined : {
      date: input.date, hours: input.displayedHours, orders: input.displayedOrders, interpretation: 'pending'
    }
  }, now);
}
function resolveLegacyPeriod(state, id, mode) {
  const sources = entriesFor(state, id).filter(e => e.legacyReading && periodFor(e.legacyReading.date).id === id)
    .sort((a, b) => a.legacyReading.date.localeCompare(b.legacyReading.date));
  const replacements = new Map();
  let previous = null;
  for (const row of sources) {
    const legacy = row.legacyReading;
    const eligible = !legacy.edited && (legacy.interpretation === 'pending' || (mode === 'cumulative' && legacy.interpretation === 'cumulative'));
    if (eligible) {
      const hours = mode === 'daily' ? legacy.hours : legacy.hours - (previous?.hours ?? 0);
      const orders = mode === 'daily' ? legacy.orders : legacy.orders - (previous?.orders ?? 0);
      if (hours < 0 || orders < 0) throw new Error('Проверьте прежние показания часов и заказов.');
      replacements.set(row.id, {
        ...row, dailyHours: hours, dailyOrders: orders,
        legacyReading: { ...legacy, interpretation: mode, fromDate: mode === 'cumulative' ? previous?.date ?? null : null }
      });
    }
    previous = legacy;
  }
  return { ...state, entries: state.entries.map(e => replacements.get(e.id) ?? e) };
}
function resolveOldReadings(state) {
  for (const id of new Set(state.entries.filter(e => e.legacyReading?.interpretation === 'pending').map(e => e.periodId))) {
    const sources = entriesFor(state, id).filter(e => e.legacyReading && periodFor(e.legacyReading.date).id === id)
      .sort((a, b) => a.legacyReading.date.localeCompare(b.legacyReading.date));
    const resolved = sources.filter(e => e.legacyReading.interpretation !== 'pending');
    const monotonic = sources.every((e, i) => i === 0 || (e.legacyReading.hours >= sources[i - 1].legacyReading.hours && e.legacyReading.orders >= sources[i - 1].legacyReading.orders));
    // Daily input is the default. Recognize old accumulated totals only when
    // they exceed a day and never decrease, or the stored period already used them.
    // Resolved daily values and manually edited contributions are never reinterpreted.
    const hasDaily = resolved.some(e => e.legacyReading.interpretation === 'daily');
    const accumulated = monotonic && !hasDaily && (resolved.length > 0 || sources.some(e => e.legacyReading.hours > 24));
    state = resolveLegacyPeriod(state, id, accumulated ? 'cumulative' : 'daily');
  }
  return state;
}
export function upsertEntry(state, input, originalRef = null) {
  let existing = originalRef == null ? null : state.entries.find(e => e.id === originalRef);
  // Older internal callers used a date. Permit that only while it names one row.
  if (originalRef != null && !existing) {
    const matches = state.entries.filter(e => e.date === originalRef);
    if (matches.length > 1) throw new Error('Выберите конкретный слот в истории.');
    existing = matches[0];
    if (!existing) throw new Error('Запись не найдена. Откройте историю.');
  }
  if ('displayedHours' in input || 'displayedOrders' in input) throw new Error('Введите часы и заказы за день. Прежние показания можно перенести из JSON-копии.');
  const row = normalizeEntry({ ...input, id: existing?.id ?? input.id ?? newEntryId(), finalAdjustment: input.finalAdjustment === undefined ? existing?.finalAdjustment : input.finalAdjustment, legacyReading: existing?.legacyReading, createdAt: existing?.createdAt ?? input.createdAt });
  if (row.legacyReading && (row.date !== existing.date || row.dailyHours !== existing.dailyHours || row.dailyOrders !== existing.dailyOrders)) {
    row.legacyReading = { ...row.legacyReading, edited: true, hoursEdited: row.legacyReading.hoursEdited || row.dailyHours !== existing.dailyHours };
  }
  // Percentage differences are advice only. normalizeEntry validates the actual
  // money format and stores the user's amounts unchanged.
  const entries = state.entries.filter(e => e.id !== existing?.id).concat(row).sort(entryOrder);
  validateSequence(entries);
  return { ...state, entries };
}
export function validateSequence(entries) {
  if (entries.length > 10000) throw new Error('Слишком много записей.');
  const ids = new Set();
  for (const row of entries) {
    checkEntryId(row.id);
    if (ids.has(row.id)) throw new Error('Идентификатор записи повторяется.');
    ids.add(row.id);
  }
}
function readState(raw) {
  const data = Array.isArray(raw) ? { entries: raw } : raw;
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) throw new Error('В файле должен быть список entries или массив дней.');
  if (data.schemaVersion != null && ![1, 2, 3, 4, 5, SCHEMA_VERSION].includes(data.schemaVersion)) throw new Error('Эта версия файла пока не поддерживается.');
  if (data.entries.length > 10000) throw new Error('В файле слишком много записей.');
  const entries = data.entries.map(e => {
    if (!e || typeof e !== 'object') throw new Error('Проверьте запись дня.');
    const isLegacy = data.schemaVersion === 1 || (data.schemaVersion == null && ('displayedHours' in e || 'displayedOrders' in e));
    if ([2, 3, 4, 5, SCHEMA_VERSION].includes(data.schemaVersion) && ('displayedHours' in e || 'displayedOrders' in e)) throw new Error('Эта версия использует dailyHours и dailyOrders.');
    const current = [3, 4, 5, SCHEMA_VERSION].includes(data.schemaVersion) || (data.schemaVersion == null && e.id != null);
    if (current) checkEntryId(e.id);
    const identified = { ...e, id: current ? e.id : `day-${e.date}` };
    return (isLegacy ? normalizeLegacyEntry : normalizeEntry)(identified, e.updatedAt ?? new Date().toISOString());
  }).sort(entryOrder);
  validateSequence(entries);
  const closures = {};
  for (const [id, value] of Object.entries(data.closures ?? {})) {
    if (periodFor(id).id !== id) throw new Error('Проверьте дату начала закрытого периода.');
    closures[id] = { finalAdjustment: parseMoney(value.finalAdjustment, 'Финальная доплата', true), note: String(value.note ?? '').slice(0, 4000), closedAt: String(value.closedAt ?? new Date().toISOString()) };
  }
  return { schemaVersion: SCHEMA_VERSION, entries, closures, settings: normalizeSettings(data.settings), forecast:normalizeForecast(data.forecast) };
}
export function normalizeState(raw) {
  return resolveOldReadings(readState(raw));
}
export function mergeImport(state, incoming) {
  // Resolve after merging so a partial accumulated import updates adjacent
  // unchanged intervals using all original readings, rather than duplicating time.
  const parsed = readState(incoming);
  const currentStart = state.settings?.premiumCycleStart ?? null;
  const incomingStart = parsed.settings.premiumCycleStart;
  if (currentStart && incomingStart && currentStart !== incomingStart) throw new Error('В копии другая дата начала 12-недельного цикла. Сначала укажите нужную дату во вкладке «Период» и повторите импорт. Записи не изменены.');
  const rules = new Map((state.settings?.paymentRules ?? []).map(r=>[r.effectivePeriodStart,r]));
  if (incoming.settings?.paymentRules != null) {
    for (const rule of parsed.settings.paymentRules) {
      const existing = rules.get(rule.effectivePeriodStart);
      const effective=r=>({...r,minimumHours:r.minimumHours??MIN_PAYMENT_HOURS,criticalPace:r.criticalPace??r.basePace});
      if (existing && JSON.stringify(effective(existing)) !== JSON.stringify(effective(rule))) throw new Error(`В копии другие условия оплаты с ${formatDate(rule.effectivePeriodStart)}. Сначала выберите нужные условия в настройках. Данные не изменены.`);
      rules.set(rule.effectivePeriodStart,existing??rule);
    }
  }
  const settings = normalizeSettings({ ...state.settings, ...(incoming.settings ?? {}), paymentRules:[...rules.values()], premiumCycleStart: currentStart ?? incomingStart });
  const byId = new Map(state.entries.map(e => [e.id, e]));
  const oldInput = incoming.schemaVersion !== SCHEMA_VERSION && !(Array.isArray(incoming) ? incoming : incoming.entries).some(e => e?.id != null);
  for (const row of parsed.entries) {
    let id = row.id;
    if (oldInput && !byId.has(id)) {
      const matches = state.entries.filter(e => e.date === row.date);
      if (matches.length > 1) throw new Error(`В старой копии один итог за ${formatDate(row.date)}, а в приложении несколько слотов. Используйте копию новой версии или исправьте нужную запись в истории.`);
      if (matches.length === 1) id = matches[0].id;
    }
    byId.set(id, { ...row, id });
  }
  const entries = [...byId.values()].sort(entryOrder);
  validateSequence(entries);
  return resolveOldReadings({ schemaVersion: SCHEMA_VERSION, entries, closures: { ...state.closures, ...parsed.closures }, settings, forecast:mergeForecast(state.forecast,incoming.forecast) });
}
function mdSafe(value) {
  return String(value ?? '').replace(/\r?\n/g, ' · ').replace(/\|/g, '\\|').replace(/[<>]/g, s => s === '<' ? '&lt;' : '&gt;');
}
export function markdownReport(state, id, exportDate = today()) {
  const s = calculate(state, id);
  const cycle = calculatePremiumCycle(state, exportDate >= id && exportDate <= periodFor(id).end ? exportDate : periodFor(id).end);
  const slotCounts = new Map();
  const rows = s.entries.map(e => {
    const number = (slotCounts.get(e.date) ?? 0) + 1;
    slotCounts.set(e.date, number);
    const legacy = e.legacyReading;
    const origin = legacy ? `${legacy.edited ? 'Исправлено вручную' : legacy.interpretation === 'daily' ? 'Ввод за день' : `Накопительные показания${legacy.fromDate ? ` после ${legacy.fromDate}` : ' с начала периода'}`}; исходные показания на ${legacy.date}: ${legacy.hours} ч, ${legacy.orders} заказов` : 'Ввод за слот / день';
    return `| ${e.date} | ${hoursText(e.dailyHours)} | ${e.dailyOrders ?? '—'} | ${money(e.reward)} | ${money(e.tips)} | ${money(e.separateBonus)} | ${money(e.displayedNet)} | ${mdSafe(origin)} | ${mdSafe(e.note)} | ${number} |`;
  });
  const days = [...new Set(s.entries.map(e => e.date))].map(date => {
    const d = calculateDay(state, date);
    return `| ${date} | ${hoursText(d.hours)} | ${d.orders ?? '—'} | ${money(d.paidReward)} | ${money(d.tips)} | ${money(d.separateBonus)} |`;
  });
  const p = periodFor(id);
  return [
    '# Courier Forecast Report', '', `Версия приложения: ${APP_VERSION}; формат данных: ${SCHEMA_VERSION}.`,
    'Проверь этот отчёт на ошибки: пересчитай суммы слотов и дней, темп, остаток и обе премии по указанным формулам. Найди пропуски и расхождения. Не придумывай отсутствующие выплаты, заказы или чаевые. Расчётные премии не являются фактическими выплатами. Итоги дней и строки слотов — одни и те же деньги, не складывай их повторно.', '',
    '## Период', `${p.start} — ${p.end}`, `Дата экспорта: ${exportDate}`, '',
    '## Итоги по введённым записям', `- Последняя запись: ${s.latest?.date ?? 'не записана'}`, `- Часы за период: ${hoursText(s.hours)}`, `- Заказы за период: ${s.orders ?? '—'}`,
    `- Дней с записями: ${s.dayCount}; всего записей: ${s.entries.length}.`,
    `- Часы внесены для ${s.hoursRecorded} из ${s.entries.length} записей; заказы — для ${s.ordersRecorded}.`,
    `- Текущий темп: ${paceText(s.pace)} заказа/ч`, `- Можно без заказов до ${goalText(s.terms.basePace)}: ${reserveText(s.reserve)}`,
    ...(s.pace != null && !s.matchedCounters ? ['- Темп и запас рассчитаны по введённым итогам; часть дневных часов или заказов не заполнена.'] : []),
    ...(s.hiddenMinutes ? ['- Для перенесённого спидометра учтён неизвестный остаток до 59 минут.'] : ['- Запас рассчитан по введённым дневным часам.']), '',
    '## Условия выплаты',
    `- Минимум для выплаты: ${s.terms.minimumHours ?? MIN_PAYMENT_HOURS} ч за двухнедельный период; темп от ${goalText(s.terms.basePace)} заказа/ч.`,
    `- Условия выплаты: ${{risk:'не выполнены',met:'выполнены по введённым данным',unknown:'недостаточно полных данных'}[s.paymentConditions.status]}.`,
    `- Не хватает часов: ${hoursText(s.paymentConditions.missingHours)}; заказов при введённых часах: ${s.paymentConditions.missingOrders ?? '—'}.`,
    ...(s.paymentConditions.status !== 'met' ? ['- Почасовая доплата не гарантирована: условия ещё не подтверждены. Финансовые суммы ниже остаются оценкой; фактические выплаты не меняются.'] : []), '',
    '## Финансы периода', `- Почасовая база: ${money(s.hourlyBase)}`, `- Вознаграждение уже выплачено: ${money(s.paidReward)}`,
    `- Осталось получить от Яндекса: ${money(s.estimatedYandexOwed)}`, `- Чаевые: ${money(s.tips)}`,
    `- Отдельные бонусы: ${money(s.separateBonus)}`, `- Общий доход по пользовательской формуле: ${money(s.grossUserIncome)}`, '',
    '## Расчётные премии',
    `- Премия за темп от ${goalText(s.terms.premiumPace)} заказа/ч: ${money(s.pacePremium)}. Формула: ${percentText(s.terms.paceBonusPercent)}% × почасовая база по ставкам дат записей, только при точном темпе ≥ ${goalText(s.terms.premiumPace)}.`,
    `- Начало 12-недельного отсчёта: ${state.settings?.premiumCycleStart ?? 'не настроено'}.`,
    `- Цикл 12 недель: ${cycle.start ? `${cycle.start} — ${cycle.end}` : 'не настроен'}.`,
    `- База за 12 недель по введённым часам: ${money(cycle.hourlyBase)}. Премия по условиям периодов: ${money(cycle.premium)}.`,
    '- Обе премии — оценка от почасовой базы, без чаевых, введённых бонусов и процента на другую премию. Не включены в фактически выплачено, основной доход и остаток; могут уже входить в введённые бонусы или финальную доплату.',
    `- Записей цикла без часов: ${cycle.missingHours}; сумма известна только по введённым часам.`, '',
    ...(cycle.boundaryNote ? [`- Внимание: ${cycle.boundaryNote}`, `- Проверьте интервалы записей: ${cycle.boundaryEntries.map(e => `${e.id} (дата записи ${e.date}, прежний интервал ${e.legacyReading.fromDate ?? 'с начала двухнедельного периода'} — ${e.legacyReading.date})`).map(mdSafe).join('; ')}.`, ''] : []),
    '### Вклад периодов в премию за 12 недель',
    '| Период и тарифная часть | Часы в цикле | Ставка | База | Процент | Премия |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...cycle.breakdown.map(b=>`| ${b.periodId} | ${hoursText(b.hours)} | ${money(b.hourlyRate)} | ${money(b.hourlyBase)} | ${percentText(b.cycleBonusPercent)}% | ${money(b.premium)} |`),
    '- База и премия округляются до копеек отдельно для каждой ставки в периоде, затем складываются. Ставка относится к датам записей; старые накопительные интервалы не распределяются по неизвестным дням.', '',
    '### Записи 12-недельного цикла',
    '| Дата | ID записи | Часы |', '| --- | --- | ---: |',
    ...cycle.entries.map(e => `| ${e.date} | ${mdSafe(e.id)} | ${hoursText(e.dailyHours)} |`), '',
    '## Итоги по дням', 'Суммы записей за дату. Они уже включены в итог периода и не прибавляются повторно.',
    '| Дата | Часы | Заказы | Вознаграждение | Чаевые | Отдельные бонусы |',
    '| --- | ---: | ---: | ---: | ---: | ---: |', ...days, '',
    '## Слоты и записи', 'Каждая строка — отдельный слот или прежняя дневная запись.',
    '| Дата | Часы за слот / перенесённый вклад | Заказы за слот / перенесённый вклад | Вознаграждение | Чаевые | Бонусы | Итог на экране | Источник часов | Примечание | Слот / запись |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |', ...rows,
    ...(s.entries.length ? [] : ['Записей за период пока нет.']), '',
    '## Идентификаторы для поиска ошибок',
    '| ID | Дата | Создано | Изменено |', '| --- | --- | --- | --- |',
    ...s.entries.map(e => `| ${mdSafe(e.id)} | ${e.date} | ${mdSafe(e.createdAt)} | ${mdSafe(e.updatedAt)} |`), '',
    ...(s.closure ? ['## Закрытие периода', `- Фактическая финальная доплата: ${money(s.closure.finalAdjustment)}`, `- Примечание: ${mdSafe(s.closure.note) || '—'}`, '- Финальная доплата сохранена отдельно и не прибавляется повторно к почасовой базе.', ''] : []),
    '## Условия оплаты',
    `- Выбранный период: ${money(s.terms.hourlyRate)}/ч; темп оплаты ${goalText(s.terms.basePace)}; темп премии ${goalText(s.terms.premiumPace)}; премия за темп ${percentText(s.terms.paceBonusPercent)}%; за 12 недель ${percentText(s.terms.cycleBonusPercent)}%.`,
    '| Начиная с даты | Ставка | Темп оплаты | Темп премии | За темп | За 12 недель |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| До первой настройки | ${money(RATE)} | ${goalText(THRESHOLD)} | ${goalText(PREMIUM_PACE)} | ${PREMIUM_PERCENT}% | ${PREMIUM_PERCENT}% |`,
    ...(state.settings?.paymentRules ?? []).map(r=>`| ${r.effectivePeriodStart} | ${money(r.hourlyRate)} | ${goalText(r.basePace)} | ${goalText(r.premiumPace)} | ${percentText(r.paceBonusPercent)}% | ${percentText(r.cycleBonusPercent)}% |`), '',
    '## Правила расчёта', '- Период — 14 дней с пятницы; календарный якорь — 18.09.2026.',
    `- Ставка: ${money(s.terms.hourlyRate)}/ч. Почасовая выплата зависит от минимума ${s.terms.minimumHours ?? MIN_PAYMENT_HOURS} часов и итогового темпа не ниже ${goalText(s.terms.basePace)} заказа/ч.`,
    '- Часы за период = сумма dailyHours всех записей периода; заказы = сумма dailyOrders.',
    '- Несколько слотов за одну дату складываются за день и период. Исправление заменяет только выбранную запись; удаление убирает только её вклад.',
    '- Почасовая база = сумма по ставкам, действовавшим в даты записей; при незавершённом периоде это оценка.',
    '- Общий доход = почасовая база + чаевые + отдельные бонусы.',
    '- Осталось получить = почасовая база − сумма reward; чаевые и отдельные бонусы не уменьшают эту сумму.',
    '- Если вознаграждение превышает базу, разница остаётся отрицательной, без обнуления.',
    `- Запас = max(0, заказы / ${goalText(s.terms.basePace)} − часы). Минуты округляются вниз. Только для перенесённых накопительных показаний дополнительно вычитаются 59 минут.`,
    '- При нулевых часах или отсутствии всех введённых часов либо всех введённых заказов темп и запас не определяются.',
    '- Часы и заказы необязательны независимо друг от друга; пропуски обозначены прочерком и не превращаются в нули.',
    '- Итоги включают только введённые значения. Темп и запас считаются по суммам часов и заказов периода, даже если поля заполнены за разные дни. При пропусках это оценка по внесённым данным.',
    '- Прежние дневные записи учитываются автоматически. Ранее сохранённые вклады дней не преобразуются повторно. Старые возрастающие показания более 24 часов распознаются как накопительные и преобразуются в разницы; разница через пропущенные даты относится ко всему интервалу.',
    '- Финансовые суммы включают все записи периода, включая выходные и дни, добавленные задним числом.',
    '- Если часы ещё не записаны, почасовая база, общий доход и остаток не определяются.', ''
  ].join('\n') + forecastReport(state.forecast ?? emptyForecast());
}
