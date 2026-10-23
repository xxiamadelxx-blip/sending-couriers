import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {emptyState,upsertEntry,calculate} from '../web/core.mjs';
import {emptyForecast,saveProfile,saveDay,parseWindows,addDays,localClock} from '../web/forecast.mjs';
const require=createRequire(import.meta.url),{chromium}=require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root=fileURLToPath(new URL('../web/',import.meta.url)),out=fileURLToPath(new URL('../verification/1.7.1/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.writeHead(200,{'Content-Type':{'.mjs':'application/javascript','.css':'text/css','.html':'text/html'}[extname(p)]??'application/octet-stream'});res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:fileURLToPath(new URL('../../tools/headless/chrome-headless-shell-linux64/chrome-headless-shell',import.meta.url)),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const nowDate=localClock().date;
function fixture(theme='dark') {
 let state=emptyState();state.settings.theme=theme;state.settings.soundEnabled=false;state.settings.hapticsEnabled=false;
 state=upsertEntry(state,{date:nowDate,dailyHours:14,dailyOrders:27,reward:2400,tips:80});
 let f=saveProfile(emptyForecast(),{effectiveFrom:addDays(nowDate,-60),timezone:'Europe/Moscow',zone:'Тестовый район',outsidePayment:'UNKNOWN',week:Array.from({length:7},()=>({intervals:parseWindows('09:00–14:00;17:00–21:00'),accountedMin:840}))});
 for(let i=1;i<=35;i++) f=saveDay(f,{date:addDays(nowDate,-i),orders:27+i%4,ordersConfirmed:true,workingMin:540,workConfirmed:true,precision:'total'});
 state.forecast=f;return state;
}
const results=[];
async function layout(page,name,width,theme) {
 const bad=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth>innerWidth,boxes:[...document.querySelectorAll('main input,main button,main select,main h1')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1);}).map(e=>e.id||e.tagName)}));
 assert.deepEqual(bad,{scroll:false,boxes:[]},name);await page.screenshot({path:`${out}/forecast-${name}-${width}-${theme}.png`,fullPage:true});
}
try {
 for(const width of [360,390])for(const theme of ['dark','light']) {
  const ctx=await browser.newContext({viewport:{width,height:820},locale:'ru-RU',timezoneId:'Europe/Moscow',hasTouch:true,isMobile:true});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const initial=fixture(theme),financeBefore=calculate(initial,initial.entries[0].periodId);
  await page.addInitScript(s=>localStorage.getItem('courier-finance-v1')||localStorage.setItem('courier-finance-v1',JSON.stringify(s)),initial);await page.goto(url);await page.locator('#openForecast').click();await layout(page,'today',width,theme);assert.match(await page.locator('.forecast-number').innerText(),/\d/);
  await page.locator('#editToday').click();await page.locator('#workPrecision').selectOption('intervals');await page.locator('#factWork').fill('09:00–14:00;17:00–21:00');await page.locator('summary').filter({hasText:'Остальное время отчёта'}).click();await page.locator('#reportWindow').fill('07:00–21:00');await page.locator('#restUnavailable').check();await page.locator('#dayCompleted').check();await layout(page,'fact',width,theme);await page.locator('#saveWorkDay').click();assert.equal(await page.locator('#forecastError').isVisible(),false);
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('courier-finance-v1'))),d=saved.forecast.days[nowDate];assert.equal(d.workingMin,540);assert.equal(d.unavailableMin,300);assert.equal(d.appAccountedMin,840);assert.equal(d.orders,27);assert.equal(d.completed,true);assert.deepEqual(calculate(saved,initial.entries[0].periodId),financeBefore);
  const morning=JSON.stringify(saved.forecast.snapshots.filter(s=>s.kind==='MORNING'));
  await page.locator('[data-tab="week"]').click();assert.equal(await page.locator('#weekWork0').isDisabled(),true);await page.locator('#weekStart').fill(addDays(nowDate,1));await page.locator('#weekStart').dispatchEvent('change');await page.locator('#weekWork0').fill('5');await page.locator('#weekSlot0').fill('14');await page.locator('#weekSlot0').fill('');assert.match(await page.locator('#weekAssumption0').innerText(),/неизвестны/);await page.locator('#weekSlot0').fill('14');await page.locator('#compareWeek').click();await layout(page,'week',width,theme);await page.locator('#saveWeek').click();assert.match(await page.locator('main').innerText(),/Сохранённые сценарии/);
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('courier-finance-v1')));assert.equal(saved.forecast.scenarios.length,1);assert.equal(saved.forecast.days[nowDate].workingMin,540);assert.equal(JSON.stringify(saved.forecast.snapshots.filter(s=>s.kind==='MORNING')),morning);
  await page.locator('[data-tab="accuracy"]').click();await layout(page,'accuracy',width,theme);assert.match(await page.locator('main').innerText(),/WAPE/);
  await page.locator('[data-tab="data"]').click();await page.evaluate(()=>window.receiveForecastImport(JSON.stringify({format:'forecast-history-1',days:[{date:'2026-01-15',orders:10,ordersConfirmed:true,workingMin:null,precision:'unknown'}]})));await page.locator('#confirmForecastImport').click();saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('courier-finance-v1')));assert.equal(saved.forecast.days['2026-01-15'].orders,10);assert.equal(saved.forecast.days['2026-01-15'].workingMin,null);assert.deepEqual(saved.entries,initial.entries);
  await page.locator('[data-tab="today"]').click();await page.locator('#editProfile').click();await layout(page,'profile',width,theme);await page.locator('#profileZone').fill('Другой район');await page.locator('#themeToggle').click();assert.equal(await page.locator('#profileZone').inputValue(),'Другой район');await page.locator('#saveProfile').click();assert.equal(await page.locator('#forecastError').isVisible(),false);
  await page.reload();saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('courier-finance-v1')));assert.equal(saved.forecast.days[nowDate].workingMin,540);assert.equal(JSON.stringify(saved.forecast.snapshots.filter(s=>s.kind==='MORNING')),morning);assert.equal(saved.forecast.profiles.at(-1).zone,'Другой район');assert.deepEqual(errors,[]);results.push({width,theme,result:'PASS',flows:['14h-report-9h-work','today','week-save-compare','accuracy','import','profile','theme-draft','reload']});await ctx.close();
 }
 // Empty install has no personal history and remains usable offline without a profile.
 const ctx=await browser.newContext({viewport:{width:360,height:800}}),page=await ctx.newPage();await page.goto(url);await page.locator('#openForecast').click();assert.equal(await page.locator('#quickHours').isVisible(),true);assert.equal(await page.locator('#setupProfile').count(),0);await ctx.close();
 await writeFile(`${out}/forecast-ui-results.json`,JSON.stringify({result:'PASS',androidRuntimeTested:false,results},null,2));console.log(`PASS: ${results.length} forecast UI runs at 360/390 in day/AMOLED; manual facts, immutable morning, plans, import, theme, reload`);
}finally{await browser.close();server.close();}
