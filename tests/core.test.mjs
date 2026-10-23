import test from 'node:test';
import assert from 'node:assert/strict';
import {
  periodFor, shiftPeriod, isoDate, parseMoney, parseInteger, parseHours, emptyState, upsertEntry,
  calculate, reserveMinutes, reserveText, markdownReport, mergeImport, normalizeState,
  deductionChecks, pendingLegacy
} from '../web/core.mjs';

const period = '2026-10-02';
const day = (date, hours, orders, extras = {}) => ({ date, dailyHours: hours, dailyOrders: orders, reward: 0, tax: '', parkCommission: '', tips: 0, separateBonus: 0, ...extras });
const oldDay = (date, hours, orders, extras = {}) => ({ date, displayedHours: hours, displayedOrders: orders, reward: 0, tax: 0, parkCommission: 0, tips: 0, separateBonus: 0, note: 'Прежняя запись', createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...extras });
const oldState = entries => ({ schemaVersion: 1, entries, closures: {} });

test('Friday periods remain 14 days across months, years, leap dates and earlier dates', () => {
  assert.deepEqual(periodFor('2026-10-01'), { id: '2026-09-18', start: '2026-09-18', end: '2026-10-01' });
  assert.equal(periodFor('2026-10-15').id, period);
  assert.equal(periodFor('2026-10-16').id, '2026-10-16');
  assert.equal(shiftPeriod('2026-09-18', 1).id, period);
  for (const date of ['2026-12-31', '2027-01-01', '2024-02-29', '2026-09-17']) {
    const p = periodFor(date);
    assert.equal(new Date(p.start).getUTCDay(), 5);
    assert.equal((Date.parse(p.end) - Date.parse(p.start)) / 86400000, 13);
  }
  assert.throws(() => periodFor('2026-02-30'));
});

test('two daily 14-hour entries add to 28 and recalculate all finances', () => {
  let state = upsertEntry(emptyState(), day('2026-10-02', 14, 0));
  state = upsertEntry(state, day('2026-10-03', 14, 36, { reward: 3600, tips: 90 }));
  const s = calculate(state, period);
  assert.equal(s.hours, 28); assert.equal(s.orders, 36);
  assert.equal(s.hourlyBase, 10080); assert.equal(s.grossUserIncome, 10170);
  assert.equal(s.estimatedYandexOwed, 6480); assert.equal(s.pace, 36 / 28);
  assert.equal(s.reserve, 0);
});

test('daily model scales across 42 arbitrary days, reverse insertion, decimal hours and three periods', () => {
  const hours = [0.1, 14, 8.25, 3.5, 0, 12.1];
  const orders = [1, 36, 22, 9, 0, 27];
  const rewards = [0, 330, 177, 3300.5, 5000, 100.13];
  const deductions = [0, 13.2, 7.08, 132.02, 200, 4.01];
  const rows = Array.from({ length: 42 }, (_, i) => day(isoDate(Date.parse(period) + i * 86400000), hours[i % 6], orders[i % 6], { reward: rewards[i % 6], tax: deductions[i % 6], parkCommission: deductions[i % 6] }));
  let state = emptyState();
  for (const row of rows.toReversed()) state = upsertEntry(state, row);
  for (const id of [period, '2026-10-16', '2026-10-30']) {
    const expected = rows.filter(e => periodFor(e.date).id === id);
    const s = calculate(state, id);
    assert.equal(s.hours, Math.round(expected.reduce((sum, e) => sum + e.dailyHours, 0) * 100) / 100);
    assert.equal(s.orders, expected.reduce((sum, e) => sum + e.dailyOrders, 0));
    assert.equal(s.paidReward, Math.round(expected.reduce((sum, e) => sum + e.reward, 0) * 100) / 100);
    assert.equal(s.hourlyBase, Math.round(s.hours * 360 * 100) / 100);
  }
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))), state);
});

test('editing replaces the day contribution, backdated insertion adds it, and deletion removes it', () => {
  let state = upsertEntry(emptyState(), day('2026-10-02', 10, 20));
  state = upsertEntry(state, day('2026-10-04', 3, 7));
  state = upsertEntry(state, day('2026-10-03', 2.5, 5));
  const createdAt = state.entries[0].createdAt;
  assert.equal(calculate(state, period).hours, 15.5);
  state = upsertEntry(state, day('2026-10-02', 8, 16), '2026-10-02');
  assert.equal(calculate(state, period).hours, 13.5);
  assert.equal(calculate(state, period).orders, 28);
  assert.equal(state.entries[0].createdAt, createdAt);
  state = { ...state, entries: state.entries.filter(e => e.date !== '2026-10-03') };
  assert.equal(calculate(state, period).hours, 11);
  assert.equal(calculate(state, period).orders, 23);
});

test('moving a record between periods onto an occupied date preserves separate IDs', () => {
  let state = upsertEntry(emptyState(), day('2026-10-03', 8, 18, { reward: 1200 }));
  state = upsertEntry(state, day('2026-10-16', 2, 5, { reward: 300 }));
  const moved = upsertEntry(state, day('2026-10-16', 8, 18, { reward: 1200 }), state.entries[0].id);
  assert.equal(calculate(moved, period).hours, null);
  assert.equal(calculate(moved, '2026-10-16').hours, 10);
  assert.equal(calculate(moved, '2026-10-16').paidReward, 1500);
});

test('fractions are exact hundredths of hours and reserve uses entered daily duration', () => {
  let state = upsertEntry(emptyState(), day('2026-10-02', '0,10', 1));
  state = upsertEntry(state, day('2026-10-03', '0.20', 1));
  const s = calculate(state, period);
  assert.equal(s.hours, 0.3); assert.equal(s.hourlyBase, 108);
  assert.equal(reserveMinutes(10, 21), 100);
  assert.equal(reserveMinutes(10, 22), 133);
  assert.equal(reserveMinutes(10, 18), 0);
  assert.equal(reserveText(100), '1 ч 40 мин');
  assert.equal(reserveText(0), '0 ч'); assert.equal(reserveText(null), '—');
});

test('paid reward remains full; tips, bonuses, deductions and closure are separate', () => {
  let state = upsertEntry(emptyState(), day('2026-10-02', 5, 12, { reward: 1000.1, tax: 40, parkCommission: 40, tips: 0.1, separateBonus: 20.2 }));
  state = upsertEntry(state, day('2026-10-03', 10, 23, { reward: 800.2, tax: 32.01, parkCommission: 32.01, tips: 0.2, separateBonus: 30.3 }));
  state.closures[period] = { finalAdjustment: 900.4, closedAt: '2026-10-16', note: '' };
  const s = calculate(state, period);
  assert.equal(s.hours, 15); assert.equal(s.orders, 35);
  assert.equal(s.hourlyBase, 5400); assert.equal(s.paidReward, 1800.3);
  assert.equal(s.grossUserIncome, 5450.8); assert.equal(s.estimatedYandexOwed, 3599.7);
  assert.equal(s.tax, 72.01); assert.equal(s.parkCommission, 72.01);
});

test('rest day accepts zero reward and blank counters, without inventing time', () => {
  let state = upsertEntry(emptyState(), day('2026-10-02', 8, 20, { reward: 1000 }));
  state = upsertEntry(state, { date: '2026-10-03', dailyHours: '', dailyOrders: '', reward: '0', note: 'Выходной' });
  assert.equal(state.entries[1].dailyHours, null); assert.equal(state.entries[1].dailyOrders, null);
  const s = calculate(state, period);
  assert.equal(s.hours, 8); assert.equal(s.orders, 20); assert.equal(s.hoursRecorded, 1);
  assert.equal(s.entries.length, 2); assert.equal(s.paidReward, 1000);
});

test('backdated money-only record keeps hours optional and updates full payment and extra sums', () => {
  let state = upsertEntry(emptyState(), day('2026-10-06', 8, 20, { reward: 1000 }));
  state = upsertEntry(state, { date: '2026-10-02', reward: '500,75', tax: 20.03, parkCommission: 20.03, tips: 4.5 });
  const s = calculate(state, period);
  assert.equal(s.hours, 8); assert.equal(s.orders, 20);
  assert.equal(s.paidReward, 1500.75); assert.equal(s.grossUserIncome, 2884.5);
  assert.equal(s.estimatedYandexOwed, 1379.25);
});

test('hours and orders can be entered independently; recorded totals determine pace', () => {
  let state = upsertEntry(emptyState(), { date: '2026-10-02', dailyHours: '8,5', reward: 900 });
  let s = calculate(state, period);
  assert.equal(s.hours, 8.5); assert.equal(s.orders, null); assert.equal(s.hourlyBase, 3060);
  assert.equal(s.pace, null); assert.equal(s.reserve, null);
  state = upsertEntry(state, { date: '2026-10-03', dailyOrders: 20, reward: 0 });
  assert.equal(calculate(state, period).orders, 20);
  assert.equal(calculate(state, period).pace, 20 / 8.5);
  assert.equal(calculate(state, period).reserve, 156);
  assert.equal(calculate(state, period).matchedCounters, false);
  state = upsertEntry(state, day('2026-10-02', 8.5, 19, { reward: 900 }), '2026-10-02');
  state = upsertEntry(state, day('2026-10-03', 4, 20), '2026-10-03');
  assert.equal(calculate(state, period).pace, 39 / 12.5);
});

test('empty, money-only and explicit zero-hour states have no false time or infinite pace', () => {
  const empty = calculate(emptyState(), period);
  assert.equal(empty.hours, null); assert.equal(empty.paidReward, null);
  const moneyOnly = upsertEntry(emptyState(), { date: period, reward: 0, tips: 3.25 });
  for (const key of ['hours', 'orders', 'hourlyBase', 'grossUserIncome', 'estimatedYandexOwed', 'pace', 'reserve']) assert.equal(calculate(moneyOnly, period)[key], null);
  const zero = calculate(upsertEntry(emptyState(), day(period, 0, 0)), period);
  assert.equal(zero.hours, 0); assert.equal(zero.hourlyBase, 0); assert.equal(zero.pace, null);
  assert.doesNotMatch(markdownReport(moneyOnly, period), /NaN|Infinity|null/);
});

test('hour and money parsers allow decimal commas and reject negative, malformed or excessive precision', () => {
  assert.equal(parseHours('8,5'), 8.5); assert.equal(parseHours('0.01'), 0.01);
  assert.equal(parseMoney('1 234,56'), 1234.56); assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('-35,90', 'Доплата', true), -35.9);
  for (const value of ['-1', '', '1e2', '1.001', 'NaN', 'Infinity', '1000001']) assert.throws(() => parseHours(value));
  for (const value of ['1.5', '', '-1', '1e2']) assert.throws(() => parseInteger(value, 'Заказы'));
  for (const value of ['-5', '1,234', '1e3', 'NaN', '+3']) assert.throws(() => parseMoney(value));
});

test('negative daily money is rejected, and reward above the hourly base preserves negative owed', () => {
  for (const key of ['reward', 'tax', 'parkCommission', 'tips', 'separateBonus']) assert.throws(() => upsertEntry(emptyState(), day(period, 5, 10, { [key]: -1 })));
  assert.equal(calculate(upsertEntry(emptyState(), day(period, 1, 3, { reward: 600 })), period).estimatedYandexOwed, -240);
});

test('percentage differences warn only; user amounts save exactly without changing the original state', () => {
  const state = upsertEntry(emptyState(), { date: period, reward: 0 });
  const before = JSON.stringify(state);
  for (const field of ['tax', 'parkCommission']) {
    const next = upsertEntry(state, { date: '2026-10-03', reward: 330, [field]: 177 });
    assert.equal(next.entries[1][field], 177);
    assert.equal(JSON.stringify(state), before);
  }
  const check = deductionChecks({ reward: 330, tax: 177, parkCommission: 177 });
  assert.deepEqual(check.errors, []);
  assert.deepEqual(check.warnings.map(e => e.field), ['tax', 'parkCommission']);
  assert.match(check.warnings[0].message, /Сумму можно сохранить/);
});

test('4000 reward with 84 tax and 200 commission saves; only tax has a warning', () => {
  const input = day(period, 14.2, 40, { reward: 4000, tax: 84, parkCommission: 200 });
  const check = deductionChecks(input);
  assert.deepEqual(check.expectedTax, { min: 160, max: 240 });
  assert.equal(check.expectedCommission, 200);
  assert.deepEqual(check.warnings.map(e => e.field), ['tax']); assert.deepEqual(check.errors, []);
  const state = upsertEntry(emptyState(), input);
  assert.equal(state.entries[0].tax, 84); assert.equal(state.entries[0].parkCommission, 200);
  const s = calculate(state, period);
  assert.equal(s.paidReward, 4000); assert.equal(s.grossUserIncome, 5112); assert.equal(s.estimatedYandexOwed, 1112);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))), state);
});

test('tax accepts the entire inclusive 4–6% interval; commission guide is 5%', () => {
  for (const tax of [160, 180, 200, 220, 240]) {
    const check = deductionChecks({ reward: 4000, tax, parkCommission: 200 });
    assert.deepEqual(check.warnings, []); assert.deepEqual(check.errors, []);
  }
  for (const tax of [0, 84, 159.99, 240.01, 9999]) assert.deepEqual(deductionChecks({ reward: 4000, tax }).warnings.map(e => e.field), ['tax']);
  for (const parkCommission of [0, 160, 199.99, 200.01, 9999]) assert.deepEqual(deductionChecks({ reward: 4000, parkCommission }).warnings.map(e => e.field), ['parkCommission']);
});

test('all guides scale to arbitrary rewards using exact kopeck rounding and exclude extras', () => {
  for (const [reward, min, max, commission] of [['330', 13.2, 19.8, 16.5], ['177', 7.08, 10.62, 8.85], ['3 300,50', 132.02, 198.03, 165.03], ['100.12', 4, 6.01, 5.01], ['100.13', 4.01, 6.01, 5.01], ['0.09', 0, 0.01, 0], ['0.10', 0, 0.01, 0.01], ['0.13', 0.01, 0.01, 0.01], ['1000000000', 40000000, 60000000, 50000000]]) {
    const check = deductionChecks({ reward, tax: String(min), parkCommission: String(commission), tips: 9000, separateBonus: 50000 });
    assert.deepEqual(check.expectedTax, { min, max }); assert.equal(check.expectedCommission, commission);
    assert.deepEqual(check.warnings, []); assert.deepEqual(check.errors, []);
  }
});

test('blank deductions are optional; explicit zero and unrelated positive amounts still save', () => {
  assert.deepEqual(deductionChecks({ reward: 330, tax: ' ', parkCommission: '' }).warnings, []);
  const zero = upsertEntry(emptyState(), { date: period, reward: 330, tax: 0, parkCommission: 0 });
  assert.equal(zero.entries[0].tax, 0); assert.equal(zero.entries[0].parkCommission, 0);
  assert.deepEqual(deductionChecks({ reward: 0, tax: 0, parkCommission: 0 }).warnings, []);
  const backdated = upsertEntry(emptyState(), { date: period, reward: 0, tax: 84, parkCommission: 200 });
  assert.equal(backdated.entries[0].tax, 84); assert.equal(backdated.entries[0].parkCommission, 200);
});

test('changing reward recalculates warnings and saves the entered deductions without replacing them', () => {
  const state = upsertEntry(emptyState(), day(period, 8, 20, { reward: 300, tax: 12, parkCommission: 15 }));
  const input = day(period, 9, 22, { reward: 330, tax: 12, parkCommission: 15 });
  assert.equal(deductionChecks(input).warnings.length, 2);
  const next = upsertEntry(state, input, period);
  assert.equal(next.entries.length, 1); assert.equal(next.entries[0].createdAt, state.entries[0].createdAt);
  assert.equal(next.entries[0].tax, 12); assert.equal(next.entries[0].parkCommission, 15);
  assert.equal(calculate(next, period).hours, 9); assert.equal(calculate(next, period).paidReward, 330);
  assert.equal(state.entries[0].reward, 300);
});

test('malformed money remains a format error instead of a percentage warning', () => {
  for (const field of ['tax', 'parkCommission']) {
    for (const value of ['abc', '-1', '1.001', 'NaN', 'Infinity']) {
      const input = { date: period, reward: 4000, [field]: value };
      const check = deductionChecks(input);
      assert.deepEqual(check.errors.map(e => e.field), [field]); assert.deepEqual(check.warnings, []);
      assert.throws(() => upsertEntry(emptyState(), input));
    }
  }
});

test('schema 1 opens automatically as daily input and preserves all money, originals and timestamps', () => {
  const raw = oldState([oldDay(period, 14, 0), oldDay('2026-10-03', 14, 36, { reward: 330, tax: 177, parkCommission: 177, tips: 90, separateBonus: 3750, displayedNet: 9000, finalAdjustment: 5 })]);
  raw.closures[period] = { finalAdjustment: 50, note: 'Закрыт', closedAt: '2026-10-16T00:00:00Z' };
  const before = JSON.stringify(raw);
  const state = normalizeState(raw);
  assert.equal(JSON.stringify(raw), before); assert.equal(state.schemaVersion, 6);
  assert.equal(pendingLegacy(state, period).length, 0); assert.equal(calculate(state, period).hours, 28);
  assert.equal(calculate(state, period).orders, 36); assert.equal(calculate(state, period).paidReward, 330);
  for (let i = 0; i < raw.entries.length; i++) {
    for (const key of ['reward', 'tax', 'parkCommission', 'tips', 'separateBonus', 'note', 'createdAt', 'updatedAt']) assert.equal(state.entries[i][key], raw.entries[i][key]);
    assert.equal(state.entries[i].legacyReading.hours, raw.entries[i].displayedHours);
    assert.equal(state.entries[i].legacyReading.orders, raw.entries[i].displayedOrders);
  }
  assert.equal(state.entries[1].tax, 177); assert.equal(state.entries[1].displayedNet, 9000);
  assert.equal(state.entries[1].finalAdjustment, 5); assert.deepEqual(state.closures, raw.closures);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))), state);
});

test('pending schema 2 from 1.1.0 opens without a choice or an extra write', () => {
  const raw = { schemaVersion: 2, entries: [period, '2026-10-03'].map((date, i) => ({ ...day(date, null, null, { reward: i ? 3600 : 0, tips: i ? 90 : 0 }), legacyReading: { date, hours: 14, orders: i ? 36 : 0, interpretation: 'pending' } })), closures: {} };
  const before = JSON.stringify(raw);
  const state = normalizeState(raw);
  assert.equal(JSON.stringify(raw), before);
  const s = calculate(state, period);
  assert.equal(s.hours, 28); assert.equal(s.orders, 36);
  assert.equal(s.grossUserIncome, 10170); assert.equal(s.estimatedYandexOwed, 6480);
  assert.equal(s.hiddenMinutes, 0); assert.equal(s.pendingCount, 0);
  assert.doesNotMatch(markdownReport(state, period), /выбор|ожидают|способ переноса/i);
});

test('old totals above a day are recognized automatically; missing dates remain an interval', () => {
  const state = normalizeState(oldState([oldDay('2026-09-18', 10, 20), oldDay('2026-09-20', null, null), oldDay('2026-09-30', 179, 345)]));
  assert.equal(state.entries[0].dailyHours, 10); assert.equal(state.entries[1].dailyHours, null);
  assert.equal(state.entries[2].dailyHours, 169); assert.equal(state.entries[2].dailyOrders, 325);
  assert.equal(state.entries[2].legacyReading.fromDate, '2026-09-18');
  const s = calculate(state, '2026-09-18');
  assert.equal(s.hours, 179); assert.equal(s.orders, 345); assert.equal(s.reserve, 701);
  assert.match(markdownReport(state, '2026-09-18'), /Накопительные показания после 2026-09-18/);
});

test('new daily hours add to converted totals and repeated reload never repeats conversion', () => {
  let state = normalizeState(oldState([oldDay(period, 14, 20), oldDay('2026-10-03', 28, 60)]));
  state = upsertEntry(state, day('2026-10-04', 8.5, 20, { reward: 1200 }));
  assert.equal(calculate(state, period).hours, 36.5); assert.equal(calculate(state, period).orders, 80);
  const before = JSON.stringify(state);
  for (let i = 0; i < 3; i++) state = normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(JSON.stringify(state), before); assert.equal(pendingLegacy(state, period).length, 0);
});

test('old daily input can be edited immediately; smaller later days still add', () => {
  let state = normalizeState(oldState([oldDay(period, 14, 36), oldDay('2026-10-03', 5, 12)]));
  assert.equal(calculate(state, period).hours, 19);
  state = upsertEntry(state, day(period, 12, 30), period);
  state = upsertEntry(state, day('2026-10-04', 8.5, 20));
  assert.equal(calculate(state, period).hours, 25.5);
  assert.equal(state.entries[0].legacyReading.edited, true);
  assert.equal(state.entries[0].legacyReading.hours, 14);
});

test('automatic processing treats each period independently and preserves closures', () => {
  const raw = oldState([oldDay('2026-09-30', 179, 345), oldDay(period, 14, 0), oldDay('2026-10-03', 14, 36)]);
  raw.closures['2026-09-18'] = { finalAdjustment: 10, note: 'Факт', closedAt: '2026-10-02' };
  const state = normalizeState(raw);
  assert.equal(calculate(state, period).hours, 28); assert.equal(calculate(state, '2026-09-18').hours, 179);
  assert.deepEqual(state.closures, raw.closures);
});

test('ambiguous small totals and decreasing old values default to daily summation without blocking', () => {
  for (const [hours, orders, expected] of [[[14, 20], [20, 40], 34], [[30, 5], [60, 12], 35], [[14, 14], [36, 12], 28]]) {
    const state = normalizeState(oldState([oldDay(period, hours[0], orders[0]), oldDay('2026-10-03', hours[1], orders[1])]));
    assert.equal(calculate(state, period).hours, expected);
    assert.ok(state.entries.every(e => e.legacyReading.interpretation === 'daily'));
  }
});

test('already resolved schema 2 and manual edits remain byte-equivalent after reading and import', () => {
  let state = normalizeState(oldState([oldDay(period, 14, 20), oldDay('2026-10-03', 28, 60)]));
  state = upsertEntry(state, day('2026-10-04', 8.5, 20));
  state = upsertEntry(state, day(period, 12, 22), period);
  const before = JSON.stringify(state);
  assert.equal(JSON.stringify(normalizeState(JSON.parse(before))), before);
  assert.equal(JSON.stringify(mergeImport(emptyState(), JSON.parse(before))), before);
  assert.equal(calculate(state, period).hours, 34.5);
  const resolvedDaily = normalizeState(oldState([oldDay(period, 14, 20)]));
  resolvedDaily.entries[0].dailyHours = 30;
  assert.deepEqual(normalizeState(resolvedDaily), resolvedDaily);
});

test('historical deductions survive reads, restores and note edits unchanged despite warnings', () => {
  const state = normalizeState(oldState([oldDay(period, 14, 36, { reward: 330, tax: 177, parkCommission: 177 })]));
  const restored = mergeImport(emptyState(), JSON.parse(JSON.stringify(state)));
  assert.equal(restored.entries[0].tax, 177); assert.equal(restored.entries[0].parkCommission, 177);
  assert.equal(calculate(restored, period).paidReward, 330);
  const edited = upsertEntry(restored, { ...restored.entries[0], note: 'Изменение' }, period);
  assert.equal(edited.entries[0].tax, 177); assert.equal(edited.entries[0].parkCommission, 177);
  assert.equal(edited.entries[0].note, 'Изменение');
});

test('JSON imports merge dates, preserve other periods and process schema 1 automatically', () => {
  let state = upsertEntry(emptyState(), day(period, 8.5, 20, { reward: 1000, tax: 40 }));
  state = upsertEntry(state, day('2026-10-16', 5, 12));
  const incoming = { schemaVersion: 2, entries: [day(period, 7, 18, { reward: 1200, tax: 48 }), day('2026-10-03', 3, 7)], closures: {} };
  const merged = mergeImport(state, incoming);
  assert.equal(merged.entries.length, 3); assert.equal(calculate(merged, period).hours, 10);
  assert.equal(calculate(merged, '2026-10-16').hours, 5); assert.equal(merged.entries[0].tax, 48);
  const old = mergeImport(state, [oldDay('2026-09-30', 179, 345)]);
  assert.equal(pendingLegacy(old, '2026-09-18').length, 0); assert.equal(calculate(old, '2026-09-18').hours, 179);
  assert.equal(calculate(old, period).hours, 8.5);
});

test('a partial cumulative import recalculates following untouched intervals and preserves new days', () => {
  let state = normalizeState(oldState([oldDay(period, 14, 20), oldDay('2026-10-03', 28, 60)]));
  state = upsertEntry(state, day('2026-10-04', 8.5, 20));
  const merged = mergeImport(state, oldState([oldDay(period, 20, 30)]));
  assert.equal(merged.entries[1].dailyHours, 8); assert.equal(merged.entries[1].dailyOrders, 30);
  assert.equal(calculate(merged, period).hours, 36.5); assert.equal(calculate(merged, period).orders, 80);
  assert.equal(state.entries[0].dailyHours, 14);
});

test('partial imports preserve manually edited contributions and explicit daily interpretations', () => {
  let state = normalizeState(oldState([oldDay(period, 14, 20), oldDay('2026-10-03', 28, 60)]));
  state = upsertEntry(state, day('2026-10-03', 12, 33), '2026-10-03');
  const merged = mergeImport(state, oldState([oldDay(period, 20, 30)]));
  assert.equal(merged.entries[1].dailyHours, 12); assert.equal(merged.entries[1].dailyOrders, 33);
  assert.equal(merged.entries[1].legacyReading.hours, 28);
  const daily = normalizeState(oldState([oldDay(period, 14, 20)]));
  const dailyMerged = mergeImport(daily, oldState([oldDay('2026-10-03', 30, 40)]));
  assert.equal(calculate(dailyMerged, period).hours, 44);
  assert.equal(dailyMerged.entries[0].dailyHours, 14);
});

test('editing orders only retains old hour uncertainty; changing hours removes it', () => {
  let state = normalizeState(oldState([oldDay(period, 30, 70, { finalAdjustment: 5 })]));
  state = upsertEntry(state, day(period, 30, 71), period);
  assert.equal(state.entries[0].legacyReading.edited, true);
  assert.equal(state.entries[0].legacyReading.hoursEdited, false);
  assert.equal(state.entries[0].finalAdjustment, 5);
  assert.equal(calculate(state, period).hiddenMinutes, 59);
  state = upsertEntry(state, day(period, 29.5, 71), period);
  assert.equal(calculate(state, period).hiddenMinutes, 0);
});

test('malformed/future schemas, duplicate dates, bad hour precision and mixed schema field names reject before mutation', () => {
  for (const data of [{ schemaVersion: 7, entries: [] }, { entries: [null] }, { entries: [day(period, 5, 10), day(period, 6, 12)] }, { schemaVersion: 2, entries: [oldDay(period, 14, 36)] }, { schemaVersion: 2, entries: [day(period, '1.001', 2)] }]) assert.throws(() => normalizeState(data));
});

test('Markdown exports daily hours, unknown cells, full finances, provenance and closure without deduction rows', () => {
  let state = upsertEntry(emptyState(), day(period, 8.5, 20, { reward: 1200.5, tax: 48.02, parkCommission: 48.02, tips: 90, separateBonus: 3750, note: 'текст | две\nстроки <tag>' }));
  state = upsertEntry(state, { date: '2026-10-03', reward: 0 });
  state.closures[period] = { finalAdjustment: 100, note: 'факт', closedAt: '2026-10-16' };
  const md = markdownReport(state, period, '2026-10-03');
  assert.match(md, /Часы за период: 8,5/); assert.match(md, /dailyHours/);
  assert.match(md, /\| 2026-10-02 \| 8,5 \| 20 \|/); assert.match(md, /\| 2026-10-03 \| — \| — \| 0\s?₽/);
  assert.match(md, /Фактическая финальная доплата/); assert.match(md, /текст \\\| две · строки &lt;tag&gt;/);
  assert.doesNotMatch(md, /налог|комисси|NaN|Infinity|Текущий спидометр|Изменение отображаемых/i);
});
