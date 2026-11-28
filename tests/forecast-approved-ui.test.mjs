import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const duration=await readFile(new URL('../web/duration-control.mjs',import.meta.url),'utf8');
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');

test('approved Forecast visual: two existing persisted time controls and real unknown state',()=>{
  const simple=forecast.slice(forecast.indexOf('function simpleView(ctx)'),forecast.indexOf('function todayView(ctx)'));
  const preview=forecast.slice(forecast.indexOf('function refreshSimpleForecastPreview(ctx,date,read)'),forecast.indexOf('function simpleView(ctx)'));
  assert.match(simple,/durationField\('todayWorkHours','Активные часы',work,'',30\)/);
  assert.match(simple,/durationField\('todaySlotHours','Полный слот',slot,'',30\)/);
  assert.match(simple,/refreshSimpleForecastPreview\(ctx,date,read\)/);
  assert.match(simple,/saveForecastHours\(data\(\),date,pair\.slotMin,pair\.workingMin\)/);
  assert.match(simple,/class="forecast-band forecast-insufficient"/);
  assert.match(simple,/id="simpleCount"/);
  assert.match(simple,/id="simpleRange"/);
  assert.match(simple,/Активное время — работа\. Полный слот включает простой\./);
  assert.match(simple,/Прогноз заказов/);
  assert.match(simple,/По активным часам/);
  assert.match(simple,/Темп активного времени/);
  assert.match(simple,/class="forecast-facts-card"/);
  assert.ok(simple.indexOf('class="forecast-simple-plan"')<simple.indexOf('class="forecast-simple-hero"'),'Time controls precede the forecast result');
  assert.match(preview,/result\.central==null/);
  assert.match(preview,/result\.preparing/);
  assert.match(preview,/result\.lower/);
  assert.match(preview,/result\.upper/);
});

test('Forecast sliders move by 30 minutes while exact numeric entry remains available',()=>{
  const simple=forecast.slice(forecast.indexOf('function simpleView(ctx)'),forecast.indexOf('function todayView(ctx)'));
  assert.match(duration,/step="\$\{stepMinutes\}"/);
  assert.match(simple,/durationField\('todaySlotHours','Полный слот',slot,'',30\)/);
  assert.match(simple,/durationField\('todayWorkHours','Активные часы',work,'',30\)/);
  assert.match(duration,/const sync=\(\)=>syncDuration\(root,id\)/);
  assert.match(duration,/--duration-fill/);
  assert.match(css,/\.forecast-page \.forecast-simple-plan \.duration-slider::-webkit-slider-runnable-track/);
  assert.match(css,/var\(--duration-fill/);
});

test('approved Forecast excludes navigation redesign; preserves actual five actions and the plus',()=>{
  for(const key of ["['summary','Главная'","['period','Период'","['forecast','Прогноз'","['settings','Настройки'"])assert.ok(app.includes(key),key);
  assert.ok(app.includes("['add','Добавить слот','plus','navAddSlot']"));
  assert.match(css,/\.bottom-nav \.nav-add\{[\s\S]*?background:var\(--accent\)/);
  assert.match(css,/\.bottom-nav \.nav-add\{[^}]*border-radius:50%/);
});
