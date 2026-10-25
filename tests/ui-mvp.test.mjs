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
 assert.ok(section.includes('class="day-money"'));\n assert.ok(!section.includes('class="day-money" role="group"'), 'Android must expose each monetary row after transfer upgrade');
 for(const v of ['Вознаграждение','Чаевые','Отдельные бонусы','Итог на экране'])assert.ok(section.includes(v));
 assert.ok(section.includes('data-entry="${esc(e.id)}"'));
});
test('UI M2: Android form cancel exercises the real visible Back and checks history/summary',()=>{
 assert.match(qa,/device\.tap_node\('Назад'\)/);
 assert.match(qa,/Canceling the form must restore history with bottom navigation/);
 assert.match(qa,/device\.tap_node\('Главная'\)/);
 assert.doesNotMatch(qa,/device\.adb\('shell', 'input', 'keyevent', '4'\)\s*device\.adb\('shell', 'input', 'keyevent', '4'\)/);
});
