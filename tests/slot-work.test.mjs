import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,upsertEntry,calculate,normalizeState} from '../web/core.mjs';
import {parseWindows,saveDay,syncSlots,saveForecastHours,planDay,predict,addDays} from '../web/forecast.mjs';
import {withSlotWorkingTime} from '../web/slot-work.mjs';

const date='2026-10-13',period='2026-10-02';
const entry=(extra={})=>({date,dailyHours:7,dailyOrders:18,reward:1500,tips:30,...extra});
const windows=parseWindows('10:00–15:00;17:00–21:00');
function first() {
  const s=upsertEntry(emptyState(),entry());
  return withSlotWorkingTime(s,date,{mode:'intervals',intervals:windows});
}

test('two same-day slots add their own money and counts, but share one actual work day',()=>{
  let s=first();s=upsertEntry(s,entry({dailyOrders:10,reward:900,tips:0}));s={...s,forecast:syncSlots(s.forecast,s.entries)};
  assert.equal(s.entries.length,2);
  assert.equal(s.forecast.days[date].workingMin,540);
  assert.equal(s.forecast.days[date].appAccountedMin,840);
  assert.equal(s.forecast.days[date].orders,28);
  assert.equal(calculate(s,period).hours,14);
  assert.equal(calculate(s,period).orders,28);
  assert.equal(calculate(s,period).paidReward,2400);
  assert.equal(calculate(s,period).tips,30);
  assert.equal(normalizeState(JSON.parse(JSON.stringify(s))).forecast.days[date].workingMin,540);
});

test('two new slots persist once and inform the next day forecast with the same saved 14/8 setting',()=>{
  const day='2026-10-16',next='2026-10-17';
  let s=emptyState();
  for(let i=1;i<=10;i++){
    const d=addDays(day,-i);
    s=upsertEntry(s,{date:d,dailyHours:14,dailyOrders:24,reward:0,tips:0});
    s=withSlotWorkingTime(s,d,{mode:'total',workingMin:'8'});
  }
  s={...s,forecast:syncSlots(s.forecast,s.entries)};
  s={...s,forecast:saveForecastHours(s.forecast,next,840,480)};
  const earlier=predict(s.forecast,next);
  s=upsertEntry(s,{date:day,dailyHours:7,dailyOrders:20,reward:400,tips:10});
  s=upsertEntry(s,{date:day,dailyHours:7,dailyOrders:20,reward:500,tips:0});
  s=withSlotWorkingTime(s,day,{mode:'total',workingMin:'8'});
  s={...s,forecast:syncSlots(s.forecast,s.entries)};
  const restored=normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.entries.filter(e=>e.date===day).length,2);
  assert.equal(restored.forecast.days[day].orders,40);
  assert.equal(restored.forecast.days[day].appAccountedMin,840);
  assert.equal(restored.forecast.days[day].workingMin,480);
  assert.equal(planDay(restored.forecast,next).workingMin,480);
  assert.equal(planDay(restored.forecast,next).slotMin,840);
  assert.equal(planDay(restored.forecast,addDays(next,1)).workingMin,480);
  assert.equal(planDay(restored.forecast,addDays(next,1)).slotMin,840);
  const later=predict(restored.forecast,next);
  assert.equal(later.comparableN,earlier.comparableN+1);
  assert.ok(later.central>earlier.central);
  const repeated=syncSlots(restored.forecast,restored.entries);
  assert.equal(predict(repeated,next).central,later.central);
  assert.deepEqual(repeated,restored.forecast);
});

test('editing and deleting slots recalculates totals, preserving work and honest source metadata',()=>{
  let s=first();s=upsertEntry(s,entry({dailyOrders:10,reward:900,tips:0}));
  const id=s.entries[1].id;
  s=upsertEntry(s,entry({dailyOrders:20,reward:900,tips:0}),id);
  s={...s,forecast:syncSlots(s.forecast,s.entries)};
  assert.equal(s.forecast.days[date].orders,38);
  s={...s,entries:s.entries.filter(e=>e.id!==id)};
  s={...s,forecast:syncSlots(s.forecast,s.entries)};
  assert.equal(s.forecast.days[date].orders,18);
  s={...s,entries:[]};
  s={...s,forecast:syncSlots(s.forecast,s.entries)};
  assert.equal(s.forecast.days[date].workingMin,540);
  assert.equal(s.forecast.days[date].orders,null);
  assert.equal(s.forecast.days[date].appAccountedMin,null);
  for(const key of ['orders','appAccountedMin']){
    assert.equal(s.forecast.days[date].fieldSources[key].kind,'UNKNOWN');
    assert.equal(s.forecast.days[date].fieldSources[key].status,'UNKNOWN');
  }
  assert.deepEqual(syncSlots(s.forecast,s.entries),s.forecast);
});

test('unknown and rest are explicit, zero reward does not acquire tips or planned hours',()=>{
  let s=upsertEntry(emptyState(),entry({dailyHours:null,dailyOrders:null,reward:0,tips:0}));
  s={...s,forecast:{...s.forecast,plans:{[date]:{workingMin:540,slotMin:840,intervals:windows}}}};
  s=withSlotWorkingTime(s,date,{mode:'unknown'});
  assert.equal(s.forecast.days[date].workingMin,null);
  assert.equal(s.forecast.days[date].orders,null);
  assert.equal(calculate(s,period).paidReward,0);
  assert.equal(calculate(s,period).tips,0);
  s=withSlotWorkingTime(s,date,{mode:'rest'});
  assert.equal(s.forecast.days[date].workingMin,0);
});

test('independent imported totals remain intact; invalid actual work never mutates state',()=>{
  let s=upsertEntry(emptyState(),entry());
  s={...s,forecast:saveDay(s.forecast,{date,source:'import',orders:44,ordersConfirmed:true,appAccountedMin:840,accountedConfirmed:true,precision:'unknown'})};
  const before=s.forecast.snapshots;
  s=withSlotWorkingTime(s,date,{mode:'intervals',intervals:windows});
  assert.equal(s.forecast.days[date].orders,44);
  assert.equal(s.forecast.days[date].appAccountedMin,840);
  assert.equal(s.forecast.days[date].workingMin,540);
  assert.deepEqual(s.forecast.snapshots,before);
  const raw=JSON.stringify(s);
  assert.throws(()=>withSlotWorkingTime(s,date,{mode:'total',workingMin:'25'}),/24/);
  assert.equal(JSON.stringify(s),raw);
});

test('manual pauses remain unavailable when a work window is edited or switched to a total',()=>{
  let s=first();
  s={...s,forecast:saveDay(s.forecast,{date,source:'finance-slots',precision:'intervals',intervals:[...windows,...parseWindows('15:00–17:00','UNAVAILABLE')],workConfirmed:true})};
  assert.equal(s.forecast.days[date].unavailableMin,120);
  s=withSlotWorkingTime(s,date,{mode:'intervals',intervals:parseWindows('10:00–14:59;17:00–21:00')});
  assert.equal(s.forecast.days[date].workingMin,539);
  assert.equal(s.forecast.days[date].unavailableMin,120);
  assert.equal(s.forecast.days[date].intervals.filter(i=>i.state==='UNAVAILABLE').length,1);
  assert.throws(()=>withSlotWorkingTime(s,date,{mode:'intervals',intervals:parseWindows('14:00–16:00')}),/пересекается/);
  const total=withSlotWorkingTime(s,date,{mode:'total',workingMin:'9'});
  assert.equal(total.forecast.days[date].intervals.filter(i=>i.state==='UNAVAILABLE').length,1);
});

test('a saved UNKNOWN interval survives work edits; overlap requires explicit correction',()=>{
  let s=first();
  s={...s,forecast:saveDay(s.forecast,{date,source:'finance-slots',precision:'intervals',intervals:[...parseWindows('10:00–15:00'),...parseWindows('15:00–17:00','UNKNOWN')],workConfirmed:true})};
  const old=s.forecast.days[date].intervals.find(i=>i.state==='UNKNOWN');
  s=withSlotWorkingTime(s,date,{mode:'intervals',intervals:parseWindows('10:00–14:59')});
  assert.deepEqual(s.forecast.days[date].intervals.find(i=>i.state==='UNKNOWN'),old);
  assert.equal(s.forecast.days[date].workingMin,299);
  assert.throws(()=>withSlotWorkingTime(s,date,{mode:'intervals',intervals:parseWindows('14:00–16:00')}),/неизвестное окно/);
  const total=withSlotWorkingTime(s,date,{mode:'total',workingMin:'5'});
  assert.deepEqual(total.forecast.days[date].intervals.find(i=>i.state==='UNKNOWN'),old);
});
