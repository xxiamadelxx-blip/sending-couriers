import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
const icons=await readFile(new URL('../web/icons.mjs',import.meta.url),'utf8');
test('first launch has a single accessible action instead of empty statistics',()=>{
  assert.match(app,/const emptyDashboard=!s\.entries\.length&&!s\.closure/);
  assert.match(app,/id="homeEmptyAdd"/);
  assert.match(app,/\$\('#homeEmptyAdd'\)\?\.addEventListener\('click',\(\)=>form\(\)\)/);
  assert.match(app,/emptyDashboard\?emptyPanel:filledPanel/);
});
test('Home empty state keeps the existing package glyph after the staircase icon rollback',()=>{
  assert.match(app,/class="home-empty-symbol" aria-hidden="true">\$\{icon\.package\}/);
  assert.doesNotMatch(app,/brand_mark\.png/);
});
test('pace and payout decision are separate cards in reading order',()=>{
  assert.match(app,/class="home-focus" aria-label="Темп периода"/);
  assert.match(app,/\$\{rhythm\.outerHTML\}<\/section>\$\{status\.outerHTML\}/);
  assert.match(app,/\$\{incomePanel\.outerHTML\}/);
  assert.match(css,/#homeDeck \.payment-status\s*\{[^}]*border-radius:var\(--card-radius\)/);
});
test('home dashboard presents the premium ledger once, outside the gold income slab',()=>{
  assert.match(app,/const incomePanel=income\.cloneNode\(true\);\s*incomePanel\.querySelector\('#openPremiums'\)\?\.remove\(\)/);
  assert.match(app,/\$\{incomePanel\.outerHTML\}/);
  assert.match(app,/class="home-premiums detail-card"/);
});
test('two forecast duration controls and large text remain visible in the source',()=>{
  assert.match(forecast,/durationField\('todaySlotHours','Полный слот',slot,'',30\)/);
  assert.match(forecast,/durationField\('todayWorkHours','Из них буду работать',work,'',30\)/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.pace-hero/);
  assert.match(css,/button:focus-visible/);
});

test('at 200% font scale the progress value is not overlaid on the ring',()=>{
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge-label\{[\s\S]*?position:static/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge\{[^}]*display:block/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge canvas\{[\s\S]*?display:none/);
});

test('SHIFT CONTROL finish uses one orange accent, 4px-derived cards, and one icon scale',()=>{
  const finish=css.slice(css.lastIndexOf('Unslop finish'));
  assert.match(finish,/--space-1:4px/);assert.match(finish,/--card-radius:16px/);assert.match(finish,/--control-radius:12px/);
  assert.doesNotMatch(finish,/\.home-stack::before/);assert.match(finish,/--text-primary:var\(--ink\)/);
  assert.match(finish,/prefers-reduced-motion/);assert.doesNotMatch(finish,/radial-gradient|machined edges|border-radius:3px/);
  const spacing=[...finish.matchAll(/(?:^|[;{])\s*(margin|padding|gap|inset|top|right|bottom|left|row-gap|column-gap)\s*:\s*([^;}]+)/g)];
  const offGrid=spacing.flatMap(m=>[...m[2].matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(x=>Number(x[1])).filter(n=>Math.abs(n)%4!==0));
  assert.deepEqual(offGrid,[]);
  assert.equal((icons.match(/width=\\"18\\"/g)??[]).length,20);
  assert.equal((icons.match(/stroke-width=\\"1\.5\\"/g)??[]).length,20);
  assert.match(forecast,/Пока мало данных/);assert.match(app,/aria-label="Открыть историю изменений"/);
});


test('Settings exposes the payout target, a single expandable secondary section, system theme and changelog',()=>{
  const settings=app.slice(app.indexOf('function settings()'),app.indexOf('function field('));
  assert.match(settings,/field\('basePace','Цель темпа для выплаты'/);
  assert.match(settings,/<details class="payment-more"><summary>Остальные условия<\/summary>/);
  assert.match(settings,/<option value="system"/);
  assert.match(settings,/id="showChangelog"/);
  assert.match(app,/systemThemeQuery\?\.addEventListener/);
});

test('Add Slot validates its money fields, previews accrual live and returns with a confirmation',()=>{
  const form=app.slice(app.indexOf('function form('),app.indexOf('function dayCaption('));
  assert.match(form,/field\('tips', 'Чаевые'/);
  assert.match(form,/field\('tax', 'Налог'/);
  assert.match(form,/field\('parkCommission', 'Комиссия парка'/);
  assert.match(form,/refreshInlineValidation\(\); refreshDeductions\(\); refreshSlotPreview\(\)/);
  assert.match(form,/accruedIncome\(base,tips,tax,commission\)/);
  assert.match(form,/Часы × ставка \+ чаевые − удержания/);
  assert.match(form,/\.focus\(\);throw new Error\('Исправьте значения/);
  assert.match(form,/notify\('Запись сохранена'\)/);
});
