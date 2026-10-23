import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, calculateDay, emptyState, upsertEntry, normalizeState, mergeImport, markdownReport } from '../web/core.mjs';

const date = '2026-10-13', period = '2026-10-02';
const slot = (extras = {}) => ({ date, dailyHours: 4, dailyOrders: 17, reward: 1700, tax: 84, parkCommission: 200, tips: 90, ...extras });
function twoSlots() {
  return upsertEntry(upsertEntry(emptyState(), slot({ note: 'Утро' })), slot({ dailyOrders: 10, reward: 900, tax: 10, parkCommission: 130, tips: 5, separateBonus: 25, note: 'Вечер' }));
}

test('two slots on one date save separately and add hours, orders and all money exactly once', () => {
  const state = twoSlots(), s = calculate(state, period);
  assert.equal(state.entries.length, 2);
  assert.notEqual(state.entries[0].id, state.entries[1].id);
  assert.equal(s.hours, 8); assert.equal(s.orders, 27);
  assert.equal(s.paidReward, 2600); assert.equal(s.tax, 94); assert.equal(s.parkCommission, 330);
  assert.equal(s.tips, 95); assert.equal(s.separateBonus, 25);
  assert.equal(s.grossUserIncome, 3000); assert.equal(s.estimatedYandexOwed, 280);
});

test('identical slots are legitimate separate records; edits target their stable ID', () => {
  let state = upsertEntry(upsertEntry(emptyState(), slot()), slot());
  const first = structuredClone(state.entries[0]), second = state.entries[1];
  state = upsertEntry(state, slot({ dailyHours: 3.5, dailyOrders: 12, reward: 1200 }), second.id);
  assert.deepEqual(state.entries.find(e => e.id === first.id), first);
  assert.equal(state.entries.find(e => e.id === second.id).dailyHours, 3.5);
  assert.equal(calculate(state, period).hours, 7.5);
  assert.equal(calculate(state, period).orders, 29);
  const afterDelete = { ...state, entries: state.entries.filter(e => e.id !== second.id) };
  assert.equal(calculate(afterDelete, period).hours, 4);
  assert.equal(afterDelete.entries.length, 1);
  assert.throws(() => upsertEntry(state, slot(), 'missing-entry'), /не найден/);
  assert.throws(() => upsertEntry(state, slot(), date), /конкретн/);
});

test('moving one slot onto an occupied date preserves its ID and other period contributions', () => {
  let state = twoSlots();
  const movedId = state.entries[1].id;
  state = upsertEntry(state, slot({ date: '2026-10-16', dailyHours: 2, dailyOrders: 5, reward: 300 }));
  state = upsertEntry(state, { ...state.entries.find(e => e.id === movedId), date: '2026-10-16' }, movedId);
  assert.equal(calculate(state, period).hours, 4);
  assert.equal(calculate(state, '2026-10-16').hours, 6);
  assert.equal(calculate(state, '2026-10-16').paidReward, 1200);
  assert.equal(state.entries.find(e => e.id === movedId).date, '2026-10-16');
});

test('schema-3 JSON reload and repeated import keep both same-date IDs without duplicating money', () => {
  const state = twoSlots(), backup = JSON.parse(JSON.stringify(state));
  assert.equal(backup.schemaVersion, 6);
  assert.deepEqual(normalizeState(backup), state);
  assert.deepEqual(mergeImport(state, backup), state);
  assert.deepEqual(mergeImport(mergeImport(emptyState(), backup), backup), state);
  const changed = structuredClone(backup);
  changed.entries[1].dailyHours = 3;
  const merged = mergeImport(state, changed);
  assert.equal(merged.entries.length, 2); assert.equal(calculate(merged, period).hours, 7);
  assert.deepEqual(merged.entries[0], state.entries[0]);
});

test('old daily backups acquire deterministic IDs; an old-date update leaves the new slot intact', () => {
  const old = { schemaVersion: 2, entries: [slot()], closures: {} };
  const first = normalizeState(old), second = normalizeState(old);
  assert.equal(first.schemaVersion, 6); assert.equal(first.entries[0].id, second.entries[0].id);
  assert.equal(old.entries[0].id, undefined, 'reading never mutates the original backup');
  let state = upsertEntry(first, slot({ dailyHours: 2, dailyOrders: null, reward: 900 }));
  const newSlot = structuredClone(state.entries.find(e => e.id !== first.entries[0].id));
  const updatedOld = structuredClone(old); updatedOld.entries[0].dailyHours = 5;
  state = mergeImport(state, updatedOld);
  assert.equal(state.entries.length, 2); assert.equal(calculate(state, period).hours, 7);
  assert.deepEqual(state.entries.find(e => e.id === newSlot.id), newSlot);
  assert.equal(calculate(state, period).orders, 17);
});

test('legacy cumulative recalculation replaces only the original ID, never a same-date new slot', () => {
  const old = entries => ({ schemaVersion: 1, entries, closures: {} });
  const reading = (date, hours, orders) => ({ date, displayedHours: hours, displayedOrders: orders, reward: 0 });
  let state = normalizeState(old([reading(period, 14, 20), reading('2026-10-03', 28, 60)]));
  state = upsertEntry(state, slot({ date: period, dailyHours: 2, dailyOrders: 3, reward: 500 }));
  const extra = structuredClone(state.entries.find(e => !e.legacyReading));
  state = mergeImport(state, old([reading(period, 20, 30)]));
  assert.equal(calculate(state, period).hours, 30); assert.equal(calculate(state, period).orders, 63);
  assert.deepEqual(state.entries.find(e => e.id === extra.id), extra);
  assert.equal(state.entries.find(e => e.date === '2026-10-03').dailyHours, 8);
});

test('invalid IDs and ambiguous old day imports reject before changing separate slots', () => {
  const state = twoSlots(), before = JSON.stringify(state);
  const duplicate = structuredClone(state); duplicate.entries[1].id = duplicate.entries[0].id;
  assert.throws(() => normalizeState(duplicate), /повтор/);
  const missing = structuredClone(state); delete missing.entries[1].id;
  assert.throws(() => normalizeState(missing), /идентификатор/i);
  assert.throws(() => upsertEntry(state, slot({ id: state.entries[0].id })), /повтор/);
  assert.throws(() => mergeImport(state, { schemaVersion: 2, entries: [slot()], closures: {} }), /несколько слотов/);
  assert.equal(JSON.stringify(state), before);
});

test('slot Markdown distinguishes records and shows day totals without counting them twice', () => {
  const md = markdownReport(twoSlots(), period, date);
  assert.match(md, /Итоги по дням/); assert.match(md, /Слоты и записи/);
  assert.match(md, /Слот \/ запись/);
  assert.match(md, /\| 2026-10-13 \| 8 \| 27 \| 2.?600\s?₽/);
  assert.match(md, /Часы за период: 8/); assert.match(md, /Заказы за период: 27/);
  assert.doesNotMatch(md, /налог|комисси|NaN|Infinity/i);
});

test('29 slots across fourteen days preserve unique IDs, day sums and period money after repeated import', () => {
  let state = emptyState();
  for (let i = 0; i < 14; i++) {
    const date = new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10);
    state = upsertEntry(state, { date, dailyHours: 1.25, dailyOrders: 3, reward: 330, tax: 41, parkCommission: 130 });
    state = upsertEntry(state, { date, dailyHours: 2.75, dailyOrders: 7, reward: 177 });
  }
  state = upsertEntry(state, { date: period, dailyHours: 1, dailyOrders: 2, reward: 100 });
  assert.equal(state.entries.length, 29); assert.equal(new Set(state.entries.map(e => e.id)).size, 29);
  const s = calculate(state, period), d = calculateDay(state, period);
  assert.equal(s.dayCount, 14); assert.equal(s.hours, 57); assert.equal(s.orders, 142);
  assert.equal(s.paidReward, 7198); assert.equal(s.grossUserIncome, 20520); assert.equal(s.estimatedYandexOwed, 13322);
  assert.equal(d.entries.length, 3); assert.equal(d.hours, 5); assert.equal(d.orders, 12);
  const backup = JSON.parse(JSON.stringify(state));
  assert.deepEqual(mergeImport(mergeImport(state, backup), backup), state);
});
