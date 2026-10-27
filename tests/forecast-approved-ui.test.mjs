import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const duration=await readFile(new URL('../web/duration-control.mjs',import.meta.url),'utf8');
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');

test('approved Forecast visual: two existing persisted time controls and real unknown state',()=>{
  const simple=forecast.slice(forecast.indexOf('  function simpleView()'),forecast.indexOf('  function readPair('));
  for(const id of ['todaySlotHours','todayWorkHours'])assert.ok(simple.includes(`durationField('${id}'`),id);
  assert.match(simple,/saveForecastHours\(data\(\),date,pair\.slotMin,pair\.workingMin\)/);
  assert.match(simple,/class="forecast-band forecast-insufficient"/);
  assert.match(simple,/id="simpleCount"/);
  assert.match(simple,/id="simpleRange"/);
  assert.match(simple,/result\.central==null/);
  assert.match(simple,/result\.preparing/);
  assert.match(simple,/result\.lower/);
  assert.match(simple,/result\.upper/);
});

test('approved Forecast: visual-only slider track fill uses existing minutes and does not change the step',()=>{
  assert.match(duration,/step="15"/);
  assert.match(duration,/const sync=\(\)=>syncDuration\(root,id\)/);
  assert.match(duration,/--duration-fill/);
  assert.match(css,/\.forecast-page \.forecast-simple-plan \.duration-slider::-webkit-slider-runnable-track/);
  assert.match(css,/var\(--duration-fill/);
});

test('approved Forecast excludes navigation redesign; preserves actual five actions and the plus',()=>{
  for(const key of ["['summary','Главная'","['period','Период'","['forecast','Прогноз'","['settings','Настройки'"])assert.ok(app.includes(key),key);
  assert.ok(app.includes("['add','Добавить слот','plus','navAddSlot']"));
  assert.match(css,/\.nav-add\{[\s\S]*?background:var\(--signal-panel\)/);
});
