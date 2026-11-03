import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const js=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
const finish=css.slice(css.lastIndexOf('/* SHIFT CONTROL · Unslop finish'));
test('Unslop refinement keeps the SHIFT CONTROL palette and restores deliberate card geometry',()=>{
  const palette=css.slice(css.lastIndexOf('/* SHIFT CONTROL · Unslop pass'),css.lastIndexOf('/* SHIFT CONTROL · Unslop finish'));
  assert.match(palette,/--bg:#10151a/);assert.match(palette,/--surface:#171e23/);assert.match(palette,/--accent:#ff7952/);
  assert.match(palette,/--income-surface:#ffbd57/);
  assert.match(finish,/--card-radius:16px/);assert.match(finish,/--control-radius:12px/);
  assert.match(finish,/#homeDeck \.home-focus/);assert.match(finish,/background:var\(--income-surface\)/);
  assert.doesNotMatch(finish,/clip-path:polygon|radial-gradient|machined edges|border-radius:3px/);assert.match(finish,/clip-path:none!important/);
});
test('both themes and five bottom actions retain legible states',()=>{
  assert.match(css,/:root\[data-theme=light\] \{/);
  assert.match(css,/\.bottom-nav\{[^}]*background:var\(--nav-surface\)/);
  assert.match(finish,/\.nav-item\.active/);
  assert.match(js,/\['summary','Главная'/);
  assert.match(js,/\['forecast','Прогноз'/);
});
test('native 48dp control size and 200 percent font-safety retained',()=>{
  assert.match(css,/\.edit-day\{[^}]*min-height:48px/);
  assert.match(css,/:root\[data-text-scale="large"\] #homeDeck \.home-focus \.gauge canvas\{[\s\S]*?display:none/);
  assert.match(forecast,/durationField\('todaySlotHours','Полный слот',slot,'',30\)/);
  assert.match(forecast,/durationField\('todayWorkHours','Из них буду работать',work,'',30\)/);
});

test('light-theme signal-colored labels meet WCAG AA contrast on the page background',()=>{
  const light=[...css.matchAll(/:root\[data-theme=light\]\s*\{([^}]+)\}/g)].map(m=>m[1]).find(block=>/--accent:/.test(block));
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
  assert.ok(contrast(token('accent'),token('bg'))>=4.5,'accent labels need >=4.5:1 on the light canvas');
});

test('all nine Unslop passes have concrete CSS and product copy signals',()=>{
  assert.match(finish,/--space-1:4px/);
  assert.match(finish,/--space-6:24px/);
  assert.match(finish,/#app svg \{ width:18px!important; height:18px!important; stroke-width:1\.5!important;/);
  assert.match(finish,/font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(finish,/home-stack::before/);
  assert.match(finish,/background-image:none!important/);
  assert.doesNotMatch(css,/transition\s*:\s*all|animate-pulse/);
  assert.match(js,/function orderWord\(value\) \{ return plural\(value,/);
});
