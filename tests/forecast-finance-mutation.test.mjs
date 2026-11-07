import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,setPaymentTerms,calculateScenario,forecastFinances} from '../web/core.mjs';
import {emptyForecast,saveProfile,saveDay,parseWindows,addDays} from '../web/forecast.mjs';

const start='2026-10-16';
function profile() {
  return saveProfile(emptyForecast(),{
    effectiveFrom:'2026-01-01',timezone:'Europe/Moscow',zone:'Test',outsidePayment:'UNKNOWN',
    week:Array.from({length:7},()=>({intervals:parseWindows('09:00–14:00;17:00–21:00'),accountedMin:840}))
  },'2026-01-01T00:00:00Z');
}
function history() {
  let data=profile();
  for(let i=1;i<=28;i++)data=saveDay(data,{
    date:addDays(start,-i),orders:27,ordersConfirmed:true,workingMin:540,workConfirmed:true,
    precision:'total',completed:true,appAccountedMin:840,accountedConfirmed:true
  });
  return data;
}
function stateWithTerms() {
  const state=setPaymentTerms(emptyState(),{
    effectivePeriodStart:start,hourlyRate:360,basePace:1.8,premiumPace:2.8,
    paceBonusPercent:5,cycleBonusPercent:5,minimumHours:80,criticalPace:1.8
  });
  state.forecast=history();
  return state;
}

test('scenario uses ceiling targets, exact hourly base and unknowns stay unknown',()=>{
  const terms={hourlyRate:360,basePace:1.8,premiumPace:2.8,paceBonusPercent:5};
  const result=calculateScenario({hours:43,orders:62},terms);
  assert.equal(result.hourlyBase,15480);
  assert.equal(result.normOrders,78);
  assert.equal(result.missingNorm,16);
  assert.equal(result.premiumOrders,121);
  assert.equal(result.missingPremium,59);
  assert.equal(result.pace,62/43);
  assert.equal(result.pacePremium,0);
  const met=calculateScenario({hours:43,orders:78},terms);
  assert.equal(met.missingNorm,0);
  assert.ok(met.pace>=1.8);
  const premiumMet=calculateScenario({hours:43,orders:121},terms);
  assert.equal(premiumMet.premiumOrders,121);
  assert.equal(premiumMet.missingPremium,0);
  assert.equal(premiumMet.pacePremium,774);
  assert.equal(premiumMet.reserve,1453);
  const zero=calculateScenario({hours:0,workingHours:43,orders:0,completedOrders:100},terms);
  assert.equal(zero.hours,0);
  assert.equal(zero.orders,0);
  assert.equal(zero.normOrders,0);
  assert.equal(zero.missingNorm,0);
  assert.equal(zero.pace,null);
  assert.equal(zero.reserve,null);
  const fractional=calculateScenario({hours:0.5,orders:1},terms);
  assert.equal(fractional.pace,2);
  assert.equal(fractional.normOrders,1);
  assert.equal(fractional.reserve,3);
  const unknown=calculateScenario({hours:'',orders:62},terms);
  assert.equal(unknown.hours,null);
  assert.equal(unknown.normOrders,null);
  assert.equal(unknown.missingNorm,null);
  assert.equal(unknown.missingPremium,null);
  assert.equal(unknown.pace,null);
  assert.equal(unknown.reserve,null);
});

test('seven 14-hour slots keep accounted hours separate from 9 active hours',()=>{
  const state=stateWithTerms(),overrides={};
  for(let i=0;i<7;i++)overrides[addDays(start,i)]={workingMin:540,slotMin:840,accountedMin:840,precision:'total',intervals:[]};
  const result=forecastFinances(state,start,overrides,start).weekFinancial;
  assert.equal(result.orders,189);
  assert.equal(result.hours,98);
  assert.equal(result.hourlyBase,35280);
  assert.equal(result.normOrders,177);
  assert.equal(result.missingNorm,0);
  assert.equal(result.rows.reduce((n,row)=>n+(row.workingMin??0),0),3780);
  assert.equal(result.rows.reduce((n,row)=>n+(row.accountedMin??0),0),5880);
});

test('today projection adds only remaining confirmed work and stops at completed fact',()=>{
  const state=stateWithTerms();
  state.forecast=saveDay(state.forecast,{
    date:start,orders:100,ordersConfirmed:true,completed:false,asOfMinute:17*60,
    precision:'intervals',intervals:parseWindows('09:00–14:00;17:00–21:00'),
    workConfirmed:true,appAccountedMin:840,accountedConfirmed:true
  });
  let row=forecastFinances(state,start,{},start).weekFinancial.rows[0];
  assert.equal(row.source,'fact+remaining');
  assert.ok(row.orders>100&&row.orders<127);
  state.forecast=saveDay(state.forecast,{date:start,completed:true});
  row=forecastFinances(state,start,{},start).weekFinancial.rows[0];
  assert.equal(row.orders,100);
  assert.equal(row.source,'fact');
});

test('incomplete past fact remains unknown instead of becoming zero',()=>{
  const state=stateWithTerms(),past=addDays(start,-1);
  state.forecast=saveDay(state.forecast,{
    date:past,orders:12,ordersConfirmed:true,completed:false,workConfirmed:false,
    precision:'unknown',appAccountedMin:null,accountedConfirmed:false
  });
  const result=forecastFinances(state,past,{},start).weekFinancial;
  assert.equal(result.complete,false);
  assert.equal(result.risk,'unknown');
  assert.equal(result.rows[0].orders,null);
  assert.equal(result.rows[0].accountedMin,null);
});
