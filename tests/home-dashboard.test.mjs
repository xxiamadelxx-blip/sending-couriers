import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
test('first launch has a single accessible action instead of empty statistics',()=>{
  assert.match(app,/const emptyDashboard=!s\.entries\.length&&!s\.closure/);
  assert.match(app,/id="homeEmptyAdd"/);
  assert.match(app,/\$\('#homeEmptyAdd'\)\?\.addEventListener\('click',\(\)=>form\(\)\)/);
  assert.match(app,/emptyDashboard\?emptyPanel:filledPanel/);
});
test('pace and payout decision are grouped in semantic reading order',()=>{
  assert.match(app,/class="home-focus" aria-label="Темп и условие выплаты"/);
  assert.match(app,/\$\{rhythm\.outerHTML\}\$\{status\.outerHTML\}/);
  assert.match(app,/\$\{income\.outerHTML\}/);
  assert.match(css,/#homeDeck \.home-focus \.payment-status/);
});
test('two forecast duration controls and large text remain visible in the source',()=>{
  assert.match(forecast,/durationField\('todaySlotHours','Слот',slot\)/);
  assert.match(forecast,/durationField\('todayWorkHours','Из них буду работать',work\)/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.pace-hero/);
  assert.match(css,/button:focus-visible/);
});

test('at 200% font scale the progress value is not overlaid on the ring',()=>{
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge-label\{[\s\S]*?position:static/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge\{[^}]*display:block/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge canvas\{[\s\S]*?display:none/);
});
