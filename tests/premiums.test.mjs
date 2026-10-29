import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../web/core.mjs';

const add = (state, date, hours, orders, extra = {}) => core.upsertEntry(state, { date, dailyHours: hours, dailyOrders: orders, ...extra });

test('pace premium uses the exact 2.8 boundary and only the hourly base', () => {
  let state = add(core.emptyState(), '2026-10-02', 10, 28, { reward: 1000, tips: 100, separateBonus: 200 });
  let result = core.calculate(state, '2026-10-02');
  assert.equal(result.pacePremium, 180);
  assert.equal(result.grossUserIncome, 3900);
  assert.equal(result.estimatedYandexOwed, 2600);
  assert.equal(result.paidReward, 1000);
  state = add(state, '2026-10-03', 0.01, 0);
  result = core.calculate(state, '2026-10-02');
  assert.equal(result.pacePremium, 0, 'display rounding must not qualify a below-threshold pace');
});

test('unknown and zero counters stay distinct for pace premium', () => {
  assert.equal(core.calculate(core.emptyState(), '2026-10-02').pacePremium, null);
  assert.equal(core.calculate(add(core.emptyState(), '2026-10-02', 5, null), '2026-10-02').pacePremium, null);
  assert.equal(core.calculate(add(core.emptyState(), '2026-10-02', 5, 0), '2026-10-02').pacePremium, 0);
  assert.equal(core.calculate(add(core.emptyState(), '2026-10-02', 0, 0), '2026-10-02').pacePremium, null);
});

test('12-week start setting never changes two-week periods, slots or closures', () => {
  let state = add(core.emptyState(), '2026-10-02', 8, 24);
  state.closures['2026-10-02'] = { finalAdjustment: 700, note: 'fact', closedAt: '2026-10-16T00:00:00Z' };
  const before = JSON.stringify({ entries: state.entries, closures: state.closures });
  state = core.updateSettings(state, { premiumCycleStart: '2026-10-07' });
  assert.equal(JSON.stringify({ entries: state.entries, closures: state.closures }), before);
  assert.deepEqual(core.periodFor('2026-10-15'), { id: '2026-10-02', start: '2026-10-02', end: '2026-10-15' });
  assert.deepEqual(core.normalizeState(JSON.parse(JSON.stringify(state))), state);
});

test('12-week premium covers exactly 84 days, rolls over and compounds neither premium', () => {
  let state = core.updateSettings(core.emptyState(), { premiumCycleStart: '2026-10-07' });
  for (const [date, hours] of [['2026-10-06', 100], ['2026-10-07', 10], ['2026-12-29', 20], ['2026-12-30', 50]]) state = add(state, date, hours, hours * 3, { reward: 100, tips: 400, separateBonus: 500 });
  const cycle = core.calculatePremiumCycle(state, '2026-12-29');
  assert.equal(cycle.start, '2026-10-07'); assert.equal(cycle.end, '2026-12-29');
  assert.equal(cycle.hours, 30); assert.equal(cycle.hourlyBase, 10800); assert.equal(cycle.totalIncome, 12600); assert.equal(cycle.premium, 630);
  assert.equal(cycle.entries.length, 2);
  assert.equal(core.calculatePremiumCycle(state, '2026-12-30').premium, 945);
  assert.equal(core.calculatePremiumCycle(state, '2026-10-06').premium, null);
});

test('cycle is unconfigured until a start date is entered and missing hours never invent a premium', () => {
  let state = add(core.emptyState(), '2026-10-02', null, null, { reward: 0 });
  assert.equal(core.calculatePremiumCycle(state, '2026-10-03').status, 'unconfigured');
  state = core.updateSettings(state, { premiumCycleStart: '2026-10-02' });
  assert.equal(core.calculatePremiumCycle(state, '2026-10-03').premium, null);
  state = add(state, '2026-10-03', 0, 0);
  const cycle = core.calculatePremiumCycle(state, '2026-10-03');
  assert.equal(cycle.premium, 0); assert.equal(cycle.missingHours, 1);
  assert.throws(() => core.updateSettings(state, { premiumCycleStart: '2026-02-30' }));
  assert.throws(() => core.updateSettings(state, { premiumCycleStart: '2200-12-31' }), /полного цикла/);
  assert.equal(core.calculatePremiumCycle(core.updateSettings(state, { premiumCycleStart: '2200-10-09' }), '2200-10-09').end, '2200-12-31');
});

test('backup retains cycle start and importing old data preserves the chosen start', () => {
  let state = core.updateSettings(core.emptyState(), { premiumCycleStart: '2026-10-07' });
  state = add(state, '2026-10-08', 10, 28);
  const backup = JSON.parse(JSON.stringify(state));
  assert.equal(core.normalizeState(backup).settings.premiumCycleStart, '2026-10-07');
  const older = { schemaVersion: 2, entries: [{ date: '2026-10-09', dailyHours: 1, dailyOrders: 3 }], closures: {} };
  assert.equal(core.mergeImport(state, older).settings.premiumCycleStart, '2026-10-07');
  assert.equal(core.mergeImport(state, backup).entries.length, 1);
  const conflicting = core.updateSettings(core.emptyState(), { premiumCycleStart: '2026-10-01' });
  assert.throws(() => core.mergeImport(state, conflicting), /12-недельного/);
});

test('ChatGPT diagnostic export includes both formulas, cycle dates, IDs and audit instructions', () => {
  let state = core.updateSettings(core.emptyState(), { premiumCycleStart: '2026-10-02' });
  state = add(state, '2026-10-02', 10, 28);
  const text = core.markdownReport(state, '2026-10-02', '2026-10-03');
  for (const expected of ['2,80', '12 недель', '2026-10-02', '2026-12-24', '180', state.entries[0].id, 'Проверь', 'не являются фактическими выплатами']) assert.ok(text.includes(expected), expected);
});

test('legacy intervals crossing either cycle boundary warn without inventing a daily allocation', () => {
  let state = core.normalizeState({schemaVersion:1,entries:[
    {date:'2026-10-02',displayedHours:30,displayedOrders:60},
    {date:'2026-10-08',displayedHours:40,displayedOrders:80},
    {date:'2026-12-26',displayedHours:30,displayedOrders:60},
    {date:'2026-12-30',displayedHours:40,displayedOrders:80}
  ],closures:{}});
  state = core.updateSettings(state,{premiumCycleStart:'2026-10-05'});
  const cycle = core.calculatePremiumCycle(state,'2026-10-10');
  assert.equal(cycle.end,'2026-12-27');
  assert.equal(cycle.hours,40, '10 hours dated Oct 8 plus 30 hours dated Dec 26; no fabricated splitting');
  assert.equal(cycle.premium,720);
  assert.deepEqual(cycle.boundaryEntries.map(e=>e.date),['2026-10-08','2026-12-30']);
  assert.match(cycle.boundaryNote,/по датам записей/);
  const report=core.markdownReport(state,'2026-10-02','2026-10-10');
  assert.match(report,/точно разделить их по границе невозможно/);
  assert.match(report,/day-2026-12-30/);
});

test('12-week tracker follows the Home general income exactly, including tips and separate bonuses',()=>{
 let state=core.updateSettings(core.emptyState(),{premiumCycleStart:'2026-08-21'});
 state=add(state,'2026-10-16',8,4,{reward:500,tips:120,separateBonus:200});
 const home=core.calculate(state,'2026-10-16');
 const cycle=core.calculatePremiumCycle(state,'2026-10-29');
 assert.equal(home.grossUserIncome,3200);
 assert.equal(cycle.start,'2026-08-21');assert.equal(cycle.end,'2026-11-12');
 assert.equal(cycle.totalIncome,3200);
 assert.equal(cycle.premium,160);
 assert.equal(cycle.hourlyBase,2880);
});
test('12-week tracker reports unknown when no verified hours exist, never invents paid money',()=>{
 let state=core.updateSettings(core.emptyState(),{premiumCycleStart:'2026-08-21'});
 assert.equal(core.calculatePremiumCycle(state,'2026-10-29').totalIncome,null);
 state=add(state,'2026-10-18',null,null,{reward:500,tips:200,separateBonus:100});
 const cycle=core.calculatePremiumCycle(state,'2026-10-29');
 assert.equal(cycle.totalIncome,null);assert.equal(cycle.premium,null);assert.equal(cycle.missingHours,1);
});

test('12-week historical opening income accumulates once; later slots remain independent',()=>{
 let state=core.updateSettings(core.emptyState(),{premiumCycleStart:'2026-08-21'});
 state=add(state,'2026-10-14',4,7,{tips:10,separateBonus:20});
 state=add(state,'2026-10-16',5,8,{tips:50,separateBonus:150});
 const opening={cycleStart:'2026-08-21',through:'2026-10-15',grossIncome:'100000.00',source:'manual'};
 state=core.updateSettings(state,{cycleOpening:opening});
 const cycle=core.calculatePremiumCycle(state,'2026-10-29');
 assert.equal(cycle.totalIncome,102000);
 assert.equal(cycle.premium,5100);
 assert.equal(cycle.excludedCount,1);
 assert.equal(cycle.entries.length,2,'Original facts are never deleted');
 assert.equal(core.calculate(state,'2026-10-16').grossUserIncome,2000,'Fortnight is unchanged');
 const restored=core.normalizeState(JSON.parse(JSON.stringify(state)));
 assert.deepEqual(restored.settings.cycleOpening,state.settings.cycleOpening);
 assert.equal(core.calculatePremiumCycle(restored,'2026-10-29').premium,5100);
 assert.equal(core.calculatePremiumCycle(restored,'2026-11-13').opening,null,'Opening only belongs to its own 84-day cycle');
});
test('ChatGPT JSON opening report is parsed safely and repeated import cannot double the accumulator',()=>{
 const json=JSON.stringify({type:'courier-12week-income-v1',cycleStart:'2026-08-21',through:'2026-10-15',grossIncome:'100 000,50'});
 const parsed=core.parseCycleIncomeReport(JSON.parse(json));
 assert.equal(parsed.grossIncome,100000.5);
 assert.equal(parsed.source,'chatgpt');
 let state=core.updateSettings(core.emptyState(),{premiumCycleStart:'2026-08-21',cycleOpening:parsed});
 const before=core.calculatePremiumCycle(state,'2026-10-29').premium;
 state=core.updateSettings(state,{cycleOpening:core.parseCycleIncomeReport(JSON.parse(json))});
 assert.equal(core.calculatePremiumCycle(state,'2026-10-29').premium,before);
 assert.equal(before,5000.03);
 assert.throws(()=>core.parseCycleIncomeReport({type:'other',grossIncome:'100000'}),/формат/i);
 assert.throws(()=>core.parseCycleIncomeReport({type:'courier-12week-income-v1',cycleStart:'2026-08-21',through:'2026-10-15',grossIncome:''}),/сумм/i);
});
test('Opening amount validates 84-day dates and never silently overwrites or leaks to next cycle',()=>{
 let state=core.updateSettings(core.emptyState(),{premiumCycleStart:'2026-08-21'});
 for(const through of ['2026-08-20','2026-11-13','2026-02-30']) assert.throws(()=>core.updateSettings(state,{cycleOpening:{cycleStart:'2026-08-21',through,grossIncome:1000,source:'manual'}}));
 state=core.updateSettings(state,{cycleOpening:{cycleStart:'2026-08-21',through:'2026-10-15',grossIncome:80000,source:'manual'}});
 assert.throws(()=>core.updateSettings(state,{premiumCycleStart:'2026-08-22'}),/цикл/i);
 const imported=core.mergeImport(core.emptyState(),state);
 assert.deepEqual(imported.settings.cycleOpening,state.settings.cycleOpening);
 let another=core.updateSettings(core.emptyState(),{premiumCycleStart:'2026-08-21',cycleOpening:{cycleStart:'2026-08-21',through:'2026-10-15',grossIncome:90000,source:'manual'}});
 assert.throws(()=>core.mergeImport(another,state),/накопленн|сумм/i);
 assert.equal(core.calculatePremiumCycle(state,'2026-11-13').premium,null);
 assert.equal(core.updateSettings(state,{cycleOpening:null}).settings.cycleOpening,null);
});
