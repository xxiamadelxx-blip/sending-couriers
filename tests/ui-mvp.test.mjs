import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const qa=await readFile(new URL('../qa/ui_audit_matrix.py',import.meta.url),'utf8');

test('UI M1: slot edit form groups hours and money without discarding any existing field',()=>{
 const section=app.slice(app.indexOf('function form('),app.indexOf('function dayCaption(')>app.indexOf('function form(')?app.indexOf('function dayCaption('):undefined);
 for(const name of ['Время и заказы','Начисления и удержания'])assert.ok(section.includes(name));
 for(const key of ['dailyHours','dailyOrders','reward','tax','parkCommission','tips','separateBonus'])assert.match(section,new RegExp("field\\('"+key+"'"));
 assert.match(css,/\.form-section-heading\{grid-column:1\/-1/);
 assert.match(css,/\.form-page \.save-area \.button\.primary\{min-height:55px/);
});
test('UI M1: period states facts before payment warnings and 12-week controls',()=>{
 const section=app.slice(app.indexOf('function periodDetails('),app.indexOf('function previewCycle('));
 assert.ok(section.indexOf('class="detail-card period-overview"')<section.indexOf('paymentStatus(s)'));
 assert.ok(section.indexOf('paymentStatus(s)')<section.indexOf('class="detail-card cycle-settings"'));
});
test('UI M1: slot history keeps editable ID and complete monetary rows',()=>{
 const section=app.slice(app.indexOf('function history('),app.indexOf('function closure('));
 assert.ok(section.includes('class="day-money"'));
 assert.ok(!section.includes('class="day-money" role="group"'), 'Android must expose each monetary row after transfer upgrade');
 for(const v of ['Вознаграждение','Чаевые','Отдельные бонусы','Итог на экране'])assert.ok(section.includes(v));
 assert.ok(section.includes('data-entry="${esc(e.id)}"'));
});
test('UI M2: Android form cancel exercises the real visible Back and checks history/summary',()=>{
 assert.match(qa,/device\.tap_node\('Назад'\)/);
 assert.match(qa,/Canceling the form must restore history with bottom navigation/);
 assert.match(qa,/device\.tap_node\('Главная'\)/);
 assert.doesNotMatch(qa,/device\.adb\('shell', 'input', 'keyevent', '4'\)\s*device\.adb\('shell', 'input', 'keyevent', '4'\)/);
});

test('UI M2: real money uses Cyrillic/ruble-capable system font, not Android monospace tofu',()=>{
  assert.match(css,/#homeDeck \.income-hero \.major-amount,\s*#homeDeck \.home-premiums \.premium-teasers strong,\s*\.day-money \.day-row span:last-child\{[\s\S]*?font-family:system-ui/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});

test('UI M2: native full audit opens and cancels export, scroll-checks all tariff controls',()=>{
 assert.match(qa,/capture\('export-dialog-360-dark'\)/);
 assert.match(qa,/device\.tap_node\('Закрыть'\)/);
 assert.match(qa,/Export modal remained open/);
 for(const term of ['Темп для оплаты','Темп для премии','Минимум часов за период','Критический темп','Премия за темп','Премия за 12 недель']) assert.ok(qa.includes(term));
 assert.match(qa,/Payment setting not reachable by scroll/);
 assert.match(qa,/capture\(f'settings-field-visible-/);
});
