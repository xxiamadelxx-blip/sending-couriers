import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
 assert.ok(x.includes('3450 ₽'));assert.ok(x.includes('Выплачено'));
 assert.doesNotMatch(x,/10:00|15:00|22:00/,'No invented times; existing model stores no per-slot start/end');
});

test('Missing slot hours/orders are unknown, not automatically zero',()=>{
 const x=periodDayMarkup([{id:'unknown-slot',date:'2026-10-20',dailyHours:null,dailyOrders:null,reward:0,tips:0,separateBonus:0}],()=>({hours:null,orders:null,paidReward:0}),date=>date,n=>n==null?'—':String(n),n=>n==null?'—':n+' ₽',esc);
 assert.ok(x.includes('— ч')); assert.ok(x.includes('Заказы не указаны'));assert.ok(x.includes('0 ₽'));
});

test('No facts and malicious notes remain safe',()=>{
 assert.match(periodDayMarkup([],()=>null,date=>date,String,String,esc),/Пока нет записей/);
 const x=periodDayMarkup([{id:'safe',date:'2026-10-19',reward:0,dailyHours:1,dailyOrders:1,note:'<img src=x onerror=alert(1)>'}],()=>({hours:1,orders:1,paidReward:0}),date=>date,String,n=>n+' ₽',esc);
 assert.doesNotMatch(x,/<img/);assert.match(x,/&lt;img/);
});

// Layout hierarchy is a product requirement: daily records must precede secondary information.
test('Period screen shows editable days before conditions and 12-week settings',()=>{
 const source=readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8');
 const page=source.slice(source.indexOf('function periodDetails()'),source.indexOf('function settings()'));
 const days=page.indexOf('class="period-days"');
 const cycle=page.indexOf('class="detail-card cycle-settings period-cycle-compact"');
 assert.ok(days>=0 && cycle>=0,'Daily cards and cycle are present');
 assert.ok(days<cycle,'Daily records must be first');
 assert.doesNotMatch(page,/\$\{paymentStatus\(s\)\}/,'Do not repeat the Home payout warning');
 assert.doesNotMatch(page,/class="detail-card period-summary"|<h2>Итоги периода<\/h2>/,'Do not duplicate Home totals');
 assert.match(page,/form\(button\.dataset\.entry,'period'\)/,'Edit opens the exact selected slot ID');
});


test('Period day CSS keeps date and payout in separate columns with readable metadata spacing',()=>{
 const css=readFileSync(new URL('../web/style.css',import.meta.url),'utf8');
 const start=css.indexOf('#app .period-day>summary {');
 const end=css.indexOf('#app .period-day-slots {',start);
 assert.ok(start>=0&&end>start,'the final scoped Period layout block exists');
 const layout=css.slice(start,end);
 assert.ok(layout.includes('#app .period-day-title { grid-column:1; grid-row:1;'));
 assert.ok(layout.includes('#app .period-day-figures { grid-column:2; grid-row:1;'));
 assert.ok(layout.includes('#app .period-day-figures small { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px 8px;'));
 assert.ok(layout.includes('#app .period-day-chevron { grid-column:3; grid-row:1;'));
 const mobileStart=css.indexOf('@media(max-width:380px)');
 const mobileEnd=css.indexOf('@media(prefers-reduced-motion',mobileStart);
 const mobile=css.slice(mobileStart,mobileEnd);
 assert.ok(mobile.includes('#app .period-day>summary { grid-template-columns:minmax(0,1fr) auto; }'));
 assert.ok(mobile.includes('#app .period-day-chevron { display:none; }'));
});
