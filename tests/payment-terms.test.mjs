import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, normalizeState, updateSettings, setPaymentTerms, paymentTermsFor, calculate, calculatePremiumCycle, upsertEntry, mergeImport, markdownReport, periodFor } from '../web/core.mjs';
const oldPeriod='2026-10-02',current='2026-10-16',next='2026-10-30';
const rule=(from=current,overrides={})=>({effectivePeriodStart:from,hourlyRate:420,basePace:2.1,premiumPace:3.25,paceBonusPercent:7.5,cycleBonusPercent:8,...overrides});
const add=(s,date,hours=10,orders=33)=>upsertEntry(s,{date,dailyHours:hours,dailyOrders:orders,reward:1000,tips:10,separateBonus:50,tax:77,parkCommission:123});
test('schema4 upgrades with legacy terms and a real dark-theme preference',()=>{
 const s=normalizeState({schemaVersion:4,entries:[],closures:{},settings:{premiumCycleStart:oldPeriod,soundEnabled:false}});
 assert.equal(s.schemaVersion,6);assert.equal(s.settings.theme,'dark');assert.deepEqual(s.settings.paymentRules,[]);
 assert.equal(paymentTermsFor(s,oldPeriod).hourlyRate,360);assert.equal(paymentTermsFor(s,oldPeriod).basePace,1.8);assert.equal(paymentTermsFor(s,oldPeriod).premiumPace,2.8);
 assert.equal(s.settings.soundEnabled,false);assert.equal(s.settings.premiumCycleStart,oldPeriod);
});
test('versioned terms change the chosen fortnight and future, preserving prior periods and actual money',()=>{
 let s=add(add(add(emptyState(),oldPeriod),current),next);const original=JSON.stringify(s.entries);
 s=setPaymentTerms(s,rule());
 assert.equal(calculate(s,oldPeriod).hourlyBase,3600);const c=calculate(s,current);
 assert.equal(c.hourlyBase,4200);assert.equal(c.pacePremium,315);assert.equal(c.requiredOrders,21);assert.equal(c.reserve,342);assert.equal(c.grossUserIncome,4260);assert.equal(c.estimatedYandexOwed,3200);assert.equal(c.paidReward,1000);assert.equal(c.tax,77);assert.equal(c.parkCommission,123);
 assert.equal(calculate(s,next).hourlyBase,4200);assert.equal(JSON.stringify(s.entries),original);
 s=setPaymentTerms(s,rule(next,{hourlyRate:400,cycleBonusPercent:2.5}));s=setPaymentTerms(s,rule(current,{hourlyRate:450}));
 assert.equal(calculate(s,current).hourlyBase,4500);assert.equal(calculate(s,next).hourlyBase,4000);assert.equal(calculate(s,oldPeriod).hourlyBase,3600);
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))),s);assert.equal(periodFor(current).id,current);
});
test('custom pace premium compares exact counters and honours zero-percent disable',()=>{
 let s=setPaymentTerms(emptyState(),rule());s=add(s,current,1000.01,3250);
 assert.equal(calculate(s,current).pace.toFixed(3),'3.250');assert.equal(calculate(s,current).pacePremium,0);
 s=setPaymentTerms(s,rule(current,{paceBonusPercent:0}));assert.equal(calculate(s,current).pacePremium,0);
 const zero=add(setPaymentTerms(emptyState(),rule()),current,0,0);assert.equal(calculate(zero,current).pace,null);assert.equal(calculate(zero,current).pacePremium,null);
});
test('12-week premium uses each period rate and percentage, with per-period kopeck rounding',()=>{
 let s=updateSettings(emptyState(),{premiumCycleStart:'2026-08-21'});s=add(add(add(s,oldPeriod),current),next);
 s=setPaymentTerms(setPaymentTerms(s,rule()),rule(next,{hourlyRate:400,cycleBonusPercent:2.5}));
 const c=calculatePremiumCycle(s,'2026-11-12');assert.equal(c.hours,30);assert.equal(c.hourlyBase,11800);assert.equal(c.premium,616);assert.equal(c.breakdown.length,3);
 let cents=updateSettings(emptyState(),{premiumCycleStart:'2026-08-21'});cents=setPaymentTerms(cents,rule(oldPeriod,{hourlyRate:10,cycleBonusPercent:5}));cents=add(add(cents,oldPeriod,0.01,0),current,0.01,0);
 assert.equal(calculatePremiumCycle(cents,'2026-10-22').premium,0.02);
});
test('old imports preserve rules/theme; explicit backups restore them and conflicts reject atomically',()=>{
 const s=updateSettings(setPaymentTerms(add(emptyState(),current),rule()),{theme:'light'});
 const merged=mergeImport(s,{schemaVersion:4,entries:[],closures:{},settings:{soundEnabled:false}});assert.deepEqual(merged.settings.paymentRules,s.settings.paymentRules);assert.equal(merged.settings.theme,'light');
 assert.deepEqual(mergeImport(emptyState(),s).settings,s.settings);
 const conflict=JSON.parse(JSON.stringify(s));conflict.settings.paymentRules[0].hourlyRate=999;const before=JSON.stringify(s);assert.throws(()=>mergeImport(s,conflict),/условия/i);assert.equal(JSON.stringify(s),before);
});
test('invalid rules and themes fail before mutation',()=>{
 const s=emptyState(),before=JSON.stringify(s);
 for(const x of [{hourlyRate:0},{hourlyRate:-1},{hourlyRate:Infinity},{hourlyRate:'1e3'},{hourlyRate:'2.001'},{basePace:0},{basePace:'1.2345'},{premiumPace:NaN},{paceBonusPercent:-1},{cycleBonusPercent:101},{effectivePeriodStart:'2026-10-32'}])assert.throws(()=>setPaymentTerms(s,rule(current,x)),JSON.stringify(x));
 assert.throws(()=>updateSettings(s,{theme:'blue'}));assert.throws(()=>updateSettings(s,{paymentRules:[rule(),rule()]}));assert.equal(JSON.stringify(s),before);
});
test('backdated slots and moves resolve the destination period terms without changing paid amounts',()=>{
 let s=setPaymentTerms(emptyState(),rule());s=add(s,current);const e=s.entries[0];s=upsertEntry(s,{...e,date:oldPeriod},e.id);
 assert.equal(calculate(s,oldPeriod).hourlyBase,3600);assert.equal(calculate(s,oldPeriod).paidReward,1000);assert.equal(s.entries[0].id,e.id);
 s=add(s,current);assert.equal(calculate(s,current).hourlyBase,4200);
});
test('ChatGPT report carries actual terms and cycle contributions',()=>{
 let s=updateSettings(setPaymentTerms(add(emptyState(),current),rule()),{premiumCycleStart:'2026-08-21'});
 const text=markdownReport(s,current,'2026-10-22');for(const expected of ['420','2,10','3,25','7,5','8%','Условия оплаты','Вклад периодов'])assert.ok(text.includes(expected),expected);
 assert.doesNotMatch(text,/Ставка: 360/);
});
test('midperiod change preserves earlier hours, splits same-day slots, backup, and cycle premium',()=>{
 let s=updateSettings(emptyState(),{premiumCycleStart:'2026-10-16'});
 s=add(s,'2026-10-22',5,15);s=add(s,'2026-10-23',3,10);s=add(s,'2026-10-23',2,6);
 const actual=s.entries.map(e=>[e.id,e.reward,e.tips,e.tax,e.parkCommission]);
 s=setPaymentTerms(s,rule('2026-10-23',{hourlyRate:500,cycleBonusPercent:10}));
 assert.equal(paymentTermsFor(s,'2026-10-22').hourlyRate,360);
 assert.equal(paymentTermsFor(s,'2026-10-23').hourlyRate,500);
 const result=calculate(s,'2026-10-16','2026-10-24');
 assert.equal(result.hours,10);assert.equal(result.hourlyBase,4300);assert.equal(result.estimatedYandexOwed,1300);
 assert.equal(result.grossUserIncome,4480);assert.deepEqual(s.entries.map(e=>[e.id,e.reward,e.tips,e.tax,e.parkCommission]),actual);
 const cycle=calculatePremiumCycle(s,'2026-10-24');
 assert.equal(cycle.hourlyBase,4300);assert.equal(cycle.premium,340);assert.equal(cycle.breakdown.length,2);
 assert.equal(calculateDayFor(s,'2026-10-22'),1800);assert.equal(calculateDayFor(s,'2026-10-23'),2500);
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))).settings.paymentRules,s.settings.paymentRules);
});
function calculateDayFor(state,date){return calculate({...state,entries:state.entries.filter(e=>e.date===date)},periodFor(date).id,date).hourlyBase;}
