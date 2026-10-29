import test from 'node:test';
import assert from 'node:assert/strict';
import {periodDayMarkup, orderedPeriodDates} from '../web/period-day-view.mjs';

const entries=[
  {id:'slot18-b',date:'2026-10-18',dailyHours:3.83,dailyOrders:8,reward:1600,tips:0,separateBonus:0,note:''},
  {id:'slot17-a',date:'2026-10-17',dailyHours:6,dailyOrders:12,reward:2100,tips:0,separateBonus:0,note:''},
  {id:'slot18-a',date:'2026-10-18',dailyHours:4.33,dailyOrders:9,reward:1850,tips:0,separateBonus:0,note:''},
  {id:'slot19-a',date:'2026-10-19',dailyHours:9.5,dailyOrders:20,reward:4200,tips:0,separateBonus:0,note:''},
];
const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const facts={ '2026-10-17':{hours:6,orders:12,paidReward:2100},'2026-10-18':{hours:8.16,orders:17,paidReward:3450},'2026-10-19':{hours:9.5,orders:20,paidReward:4200} };
const html=()=>periodDayMarkup(entries,date=>facts[date],date=>date,n=>n==null?'—':String(n),n=>n==null?'—':n+' ₽',esc);

test('Period day groups use descending calendar dates regardless of import order',()=>{
 assert.deepEqual(orderedPeriodDates(entries),['2026-10-19','2026-10-18','2026-10-17']);
 const x=html();assert.ok(x.indexOf('2026-10-19')<x.indexOf('2026-10-18'));assert.ok(x.indexOf('2026-10-18')<x.indexOf('2026-10-17'));
});

test('Two slots share one expandable date card with separate stable id edit controls',()=>{
 const x=html();
 assert.equal((x.match(/<details class="period-day"/g)||[]).length,3);
 assert.equal((x.match(/data-entry="slot18-a"/g)||[]).length,1);
 assert.equal((x.match(/data-entry="slot18-b"/g)||[]).length,1);
 assert.equal((x.match(/data-entry="slot17-a"/g)||[]).length,1);
 assert.ok(x.includes('Слот 1')&&x.includes('Слот 2'));
 assert.ok(x.includes('17 заказов'));
 assert.ok(x.includes('3450 ₽'));
 assert.doesNotMatch(x,/10:00|15:00|22:00/,'No invented times; existing model stores no per-slot start/end');
});

test('Missing slot hours/orders are unknown, not automatically zero',()=>{
 const x=periodDayMarkup([{id:'unknown-slot',date:'2026-10-20',dailyHours:null,dailyOrders:null,reward:0,tips:0,separateBonus:0}],()=>({hours:null,orders:null,paidReward:0}),date=>date,n=>n==null?'—':String(n),n=>n==null?'—':n+' ₽',esc);
 assert.ok(x.includes('— ч')); assert.ok(x.includes('— заказов'));assert.ok(x.includes('0 ₽'));
});

test('No facts and malicious notes remain safe',()=>{
 assert.match(periodDayMarkup([],()=>null,date=>date,String,String,esc),/Пока нет записей/);
 const x=periodDayMarkup([{id:'safe',date:'2026-10-19',reward:0,dailyHours:1,dailyOrders:1,note:'<img src=x onerror=alert(1)>'}],()=>({hours:1,orders:1,paidReward:0}),date=>date,String,n=>n+' ₽',esc);
 assert.doesNotMatch(x,/<img/);assert.match(x,/&lt;img/);
});
