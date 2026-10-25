import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const js=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
const v2=css.slice(css.indexOf('/* VISUAL V2 / SHIFT CONTROL'));
test('new design uses a new intentional palette and cuts the old rounded chat-card silhouette',()=>{
  assert.match(v2,/--teal:#ff7952/);
  assert.match(v2,/--console-hero:#202b32/);
  assert.match(v2,/#homeDeck \.home-focus\{[^}]*border-radius:3px/);
  assert.match(v2,/#homeDeck \.income-hero\{[^}]*background:var\(--signal-panel\)/);
  assert.match(v2,/#homeDeck \.home-premiums\{[^}]*border-radius:0/);
});
test('both themes and five bottom actions retain legible states',()=>{
  assert.match(v2,/:root\[data-theme="light"\] \{/);
  assert.match(v2,/\.bottom-nav\{[^}]*background:var\(--nav-surface\)/);
  assert.match(v2,/\.nav-item\.active/);
  assert.match(js,/\['summary','Главная'/);
  assert.match(js,/\['forecast','Прогноз'/);
});
test('native 48dp control size and 200 percent font-safety retained',()=>{
  assert.match(v2,/\.edit-day\{[^}]*min-height:48px/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge canvas\{[\s\S]*?display:none/);
  assert.match(forecast,/durationField\('todaySlotHours','Слот',slot\)/);
  assert.match(forecast,/durationField\('todayWorkHours','Из них буду работать',work\)/);
});
