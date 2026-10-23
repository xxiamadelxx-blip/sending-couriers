import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculate, emptyState, markdownReport, mergeImport, normalizeState,
  paceText, reserveText, upsertEntry
} from '../web/core.mjs';

const period = '2026-10-02';
// Counter and exported money fields reconstructed from the attached Markdown.
// This is a regression fixture, never a replacement for the user's full backup.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/pace-report-2026-10-13.json', import.meta.url), 'utf8'));
const reportState = () => normalizeState(structuredClone(fixture));

test('13 October report shows 1.808 orders/hour and 33 minutes despite a blank rest-day order field', () => {
  const state = reportState(), before = JSON.stringify(state);
  const s = calculate(state, period);
  assert.equal(s.hours, 120); assert.equal(s.orders, 217);
  assert.equal(paceText(s.pace), '1,808');
  assert.equal(s.reserve, 33); assert.equal(reserveText(s.reserve), '0 ч 33 мин');
  assert.equal(s.matchedCounters, false);
  assert.equal(s.hoursRecorded, 9); assert.equal(s.ordersRecorded, 8);
  assert.equal(s.hourlyBase, 43200); assert.equal(s.paidReward, 20000);
  assert.equal(s.tips, 395); assert.equal(s.separateBonus, 3750);
  assert.equal(s.grossUserIncome, 47345); assert.equal(s.estimatedYandexOwed, 23200);
  assert.equal(JSON.stringify(state), before, 'calculating never rewrites an unknown order count');
});

test('partial totals survive JSON reload and import; manually entering zero only completes the day', () => {
  const original = reportState();
  const reloaded = normalizeState(JSON.parse(JSON.stringify(original)));
  const imported = mergeImport(emptyState(), JSON.parse(JSON.stringify(original)));
  for (const state of [reloaded, imported]) {
    assert.equal(state.entries.find(e => e.date === '2026-10-10').dailyOrders, null);
    assert.equal(paceText(calculate(state, period).pace), '1,808');
    assert.equal(calculate(state, period).reserve, 33);
  }
  const rest = original.entries.find(e => e.date === '2026-10-10');
  const completed = upsertEntry(original, { ...rest, dailyOrders: 0 }, rest.date);
  const s = calculate(completed, period);
  assert.equal(s.matchedCounters, true); assert.equal(s.hours, 120); assert.equal(s.orders, 217);
  assert.equal(s.reserve, 33); assert.equal(s.grossUserIncome, 47345);
  assert.equal(original.entries.find(e => e.date === rest.date).dailyOrders, null);
});

test('separately entered hours and orders use their period totals without excluding idle hours', () => {
  let state = upsertEntry(emptyState(), { date: period, dailyHours: 8.5, reward: 0 });
  state = upsertEntry(state, { date: '2026-10-03', dailyOrders: 20, reward: 0 });
  state = upsertEntry(state, { date: '2026-10-04', reward: 500 });
  state = upsertEntry(state, { date: '2026-10-16', dailyHours: 100, dailyOrders: 1000 });
  const s = calculate(state, period);
  assert.equal(s.hours, 8.5); assert.equal(s.orders, 20);
  assert.equal(paceText(s.pace), '2,353'); assert.equal(s.reserve, 156);
  assert.equal(s.matchedCounters, false);
  const allOrdersMissing = reportState();
  allOrdersMissing.entries.forEach(e => { e.dailyOrders = null; });
  assert.equal(calculate(allOrdersMissing, period).pace, null);
  assert.equal(calculate(allOrdersMissing, period).reserve, null);
});

test('partial totals retain the exact 1.8 threshold and no negative or infinite reserve', () => {
  for (const [lastOrders, pace, minutes] of [[15, '1,792', 0], [16, '1,800', 0], [17, '1,808', 33]]) {
    const state = reportState();
    state.entries.at(-1).dailyOrders = lastOrders;
    const s = calculate(state, period);
    assert.equal(paceText(s.pace), pace); assert.equal(s.reserve, minutes);
  }
  const zeroOrders = upsertEntry(upsertEntry(emptyState(), { date: period, dailyHours: 14 }), { date: '2026-10-03', dailyOrders: 0 });
  assert.equal(calculate(zeroOrders, period).pace, 0);
  assert.equal(calculate(zeroOrders, period).reserve, 0);
  const zeroHours = upsertEntry(emptyState(), { date: period, dailyHours: 0, dailyOrders: 20 });
  assert.equal(calculate(zeroHours, period).pace, null);
  assert.equal(calculate(zeroHours, period).reserve, null);
});

test('Markdown exports the computed partial pace and explains missing counters without replacing them', () => {
  const md = markdownReport(reportState(), period, '2026-10-13');
  assert.match(md, /Текущий темп: 1,808 заказа\/ч/);
  assert.match(md, /Можно без заказов до 1,80: 0 ч 33 мин/);
  assert.match(md, /Темп и запас рассчитаны по введённым итогам; часть дневных часов или заказов не заполнена/);
  assert.match(md, /\| 2026-10-10 \| 14 \| — \|/);
  assert.doesNotMatch(md, /Если набор дней.*темп и запас не определяются/);
  assert.doesNotMatch(md, /NaN|Infinity/);
});
