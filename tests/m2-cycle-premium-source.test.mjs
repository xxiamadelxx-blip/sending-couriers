import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, updateSettings, upsertEntry, calculate, calculatePremiumCycle } from '../web/core.mjs';

// Financial-rule control confirmed in the user's canonical Courier Forecast Sheet:
// 12-week 5% base excludes tips and park/separate bonuses. Neither can be
// mistaken for an hourly guarantee or an order reward.
test('M2 financial parity: cycle 5% excludes tips and separate bonuses but Home still shows them', () => {
  let state=updateSettings(emptyState(),{premiumCycleStart:'2026-08-21'});
  state=upsertEntry(state,{date:'2026-10-16',dailyHours:10,dailyOrders:20,
      reward:500,tips:120,separateBonus:200});
  const home=calculate(state,'2026-10-16','2026-10-29');
  assert.equal(home.hourlyBase,3600);
  assert.equal(home.grossUserIncome,3920,'Home keeps its independently reported money categories');
  const cycle=calculatePremiumCycle(state,'2026-10-29');
  assert.equal(cycle.hourlyBase,3600);
  assert.equal(cycle.totalIncome,3600,'5 percent eligible base is only the hourly amount');
  assert.equal(cycle.premium,180,'exact 5 percent of 3600 RUB');
  assert.equal(cycle.breakdown[0].totalIncome,3600);
});
test('M2 migration: second slot changes 5% only by eligible hours, not tips',()=>{
  let state=updateSettings(emptyState(),{premiumCycleStart:'2026-08-21'});
  state=upsertEntry(state,{date:'2026-10-18',dailyHours:6,dailyOrders:12,
      reward:200,tips:0,separateBonus:0});
  state=upsertEntry(state,{date:'2026-10-18',dailyHours:4,dailyOrders:9,
      reward:700,tips:950,separateBonus:600});
  const cycle=calculatePremiumCycle(state,'2026-10-29');
  assert.equal(cycle.hours,10);
  assert.equal(cycle.totalIncome,3600);
  assert.equal(cycle.premium,180);
  assert.equal(state.entries.length,2,'historical slot identities not merged');
});
