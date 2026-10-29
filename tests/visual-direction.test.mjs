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

test('light-theme signal-colored labels meet WCAG AA contrast on the page background',()=>{
  const light=v2.match(/:root\[data-theme="light"\] \{([^}]+)\}/)?.[1];
  assert.ok(light,'light-theme tokens are present');
  const token=(name)=>light.match(new RegExp('--'+name+':(#[0-9a-fA-F]{6})'))?.[1];
  const luminance=(hex)=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const channels=rgb.map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
    return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
  };
  const contrast=(a,b)=>{
    const x=luminance(a),y=luminance(b);
    return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
  };
  assert.ok(contrast(token('teal'),token('bg'))>=4.5,'signal labels need >=4.5:1 on the light canvas');
});
