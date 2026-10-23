import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,upsertEntry,calculate,setPaymentTerms,normalizeState,markdownReport} from '../web/core.mjs';
const period='2026-10-16';
const add=(state,hours,orders,date=period)=>upsertEntry(state,{date,dailyHours:hours,dailyOrders:orders,reward:9400,tips:0,separateBonus:0});
test('63 hours and 94 orders show both payout risks without inventing or withholding actual money',()=>{
 const state=add(emptyState(),63,94),before=JSON.stringify(state),s=calculate(state,period);
 assert.deepEqual(s.paymentConditions,{status:'risk',minimumHours:80,hoursMet:false,paceMet:false,missingHours:17,missingOrders:20,complete:true});
 assert.equal(s.hourlyBase,22680);assert.equal(s.paidReward,9400);assert.equal(s.estimatedYandexOwed,13280);assert.equal(s.tips,0);assert.equal(JSON.stringify(state),before);
});
test('80-hour boundary and exact base-pace threshold are independent requirements',()=>{
 let s=calculate(add(emptyState(),79.99,300),period);assert.equal(s.paymentConditions.status,'risk');assert.equal(s.paymentConditions.missingHours,.01);assert.equal(s.paymentConditions.paceMet,true);
 s=calculate(add(emptyState(),80,144),period);assert.equal(s.paymentConditions.status,'met');assert.equal(s.paymentConditions.missingHours,0);
 s=calculate(add(emptyState(),80,143),period);assert.equal(s.paymentConditions.status,'risk');assert.equal(s.paymentConditions.hoursMet,true);assert.equal(s.paymentConditions.missingOrders,1);
 s=calculate(add(emptyState(),80.01,144),period);assert.equal(s.pace.toFixed(3),'1.800');assert.equal(s.paymentConditions.paceMet,false);assert.equal(s.paymentConditions.status,'risk');
});
test('unknown or incomplete counters never claim confirmed payout eligibility',()=>{
 let c=calculate(emptyState(),period).paymentConditions;assert.equal(c.status,'unknown');assert.equal(c.hoursMet,null);assert.equal(c.paceMet,null);assert.equal(c.missingHours,null);
 c=calculate(add(emptyState(),120,null),period).paymentConditions;assert.equal(c.status,'unknown');assert.equal(c.hoursMet,true);assert.equal(c.paceMet,null);
 const s=add(add(emptyState(),80,144),null,null,'2026-10-17');c=calculate(s,period).paymentConditions;assert.equal(c.status,'unknown');assert.equal(c.complete,false);assert.equal(c.hoursMet,true);assert.equal(c.paceMet,true);
 const legacy=normalizeState({schemaVersion:1,closures:{},entries:[{date:period,displayedHours:30,displayedOrders:60},{date:'2026-10-17',displayedHours:80,displayedOrders:144}]});c=calculate(legacy,period).paymentConditions;assert.equal(c.hoursMet,true);assert.equal(c.paceMet,true);assert.equal(c.status,'unknown');assert.equal(c.complete,false);
 c=calculate(add(emptyState(),0,0),period).paymentConditions;assert.equal(c.status,'risk');assert.equal(c.missingHours,80);
});
test('slots add towards 80 hours and use the selected period custom target',()=>{
 let s=add(add(emptyState(),40,84),40,84);s=setPaymentTerms(s,{effectivePeriodStart:period,hourlyRate:400,basePace:2.1,premiumPace:3,paceBonusPercent:5,cycleBonusPercent:5});
 assert.equal(calculate(s,period).paymentConditions.status,'met');
 s=setPaymentTerms(s,{effectivePeriodStart:period,hourlyRate:400,basePace:2.2,premiumPace:3,paceBonusPercent:5,cycleBonusPercent:5});assert.equal(calculate(s,period).paymentConditions.missingOrders,8);assert.equal(calculate(s,period).paymentConditions.status,'risk');
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))),s);
});
test('ChatGPT report includes eligibility and 80-hour rule alongside unchanged monetary estimates',()=>{
 const report=markdownReport(add(emptyState(),63,94),period,'2026-10-22');
 assert.match(report,/Минимум для выплаты: 80 ч/);assert.match(report,/Условия выплаты: не выполнены/);assert.match(report,/Не хватает часов: 17/);assert.match(report,/не гарантирована/);assert.match(report,/13.280/);
});
