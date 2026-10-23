import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {emptyState} from '../web/core.mjs';
import {saveDay,saveForecastHours,forecastClock,addDays} from '../web/forecast.mjs';

const {chromium}=createRequire(import.meta.url)(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root=fileURLToPath(new URL('../web/',import.meta.url));
const out=fileURLToPath(new URL('../verification/1.7.8/',import.meta.url));await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root))throw Error();
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.mjs':'application/javascript','.css':'text/css'}[extname(path)]??'application/octet-stream'});
  res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:fileURLToPath(new URL('../../tools/headless/chrome-headless-shell-linux64/chrome-headless-shell',import.meta.url)),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const date=forecastClock(emptyState().forecast).date;
const runs=[];
try{for(const width of [360,390])for(const theme of ['dark','light']){
  const state=emptyState();state.settings.theme=theme;state.settings.soundEnabled=false;state.settings.hapticsEnabled=false;
  for(let i=1;i<=10;i++)state.forecast=saveDay(state.forecast,{date:addDays(date,-i),orders:24,ordersConfirmed:true,workingMin:480,workConfirmed:true,precision:'total',completed:true});
  state.forecast=saveForecastHours(state.forecast,date,840,480);
  const context=await browser.newContext({viewport:{width,height:820},locale:'ru-RU',timezoneId:'Europe/Moscow',isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(s=>{
    if(!localStorage.getItem('qa-simple'))localStorage.setItem('qa-simple',JSON.stringify(s));window.importRequests=0;
    window.CourierNative={readState:()=>localStorage.getItem('qa-simple'),writeState:v=>(localStorage.setItem('qa-simple',v),true),ready:()=>{},feedback:()=>{},applyTheme:()=>{},importForecast:()=>{window.importRequests++;}};
  },state);
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#navForecast').click();
  await page.waitForFunction(()=>document.querySelector('#simpleCount')?.textContent.includes('24'));
  assert.equal(await page.locator('#todaySlotHours').inputValue(),'14');
  assert.equal(await page.locator('#todayWorkHours').inputValue(),'8');
  assert.equal(await page.locator('.forecast-tabs,.forecast-tools,#todayModelStatus,#todayPlanResult,#remainingForecast,#workDayForm').count(),0);
  assert.doesNotMatch(await page.locator('.forecast-page').innerText(),/рабочих окон|снимок|модель|источник|профиль|факт дня/i);
  await page.screenshot({path:`${out}/Simple-forecast-${width}-${theme}.png`});
  await page.locator('#todayWorkHours').fill('6');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-simple')).forecast.weekConfig?.workingMin===360);
  await page.waitForFunction(()=>document.querySelector('#simpleCount')?.textContent.includes('18'));
  await page.reload();await page.locator('#navForecast').click();
  assert.equal(await page.locator('#todayWorkHours').inputValue(),'6');
  assert.equal(await page.locator('#todaySlotHours').inputValue(),'14');
  await page.locator('#todayWorkHours').fill('9');await page.locator('#navSummary').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-simple')).forecast.weekConfig?.workingMin===540);
  await page.locator('#navForecast').click();assert.equal(await page.locator('#todayWorkHours').inputValue(),'9');
  await page.locator('#importForecast').click();assert.equal(await page.evaluate(()=>window.importRequests),1);
  const imported={format:'forecast-history-1',days:[{date:addDays(date,-11),orders:30,ordersConfirmed:true,workingMin:480,workConfirmed:true,precision:'total',completed:true}]};
  await page.evaluate(text=>window.receiveForecastImport(text),JSON.stringify(imported));
  assert.equal(await page.evaluate(d=>JSON.parse(localStorage.getItem('qa-simple')).forecast.days[d].orders,addDays(date,-11)),30);
  assert.equal(await page.locator('#confirmForecastImport').count(),0);
  if(width===360&&theme==='dark'){
    await page.evaluate(async d=>{
      const {parseWindows,addDays}=await import('./forecast.mjs');const state=JSON.parse(localStorage.getItem('qa-simple'));
      state.forecast.weekConfig=null;
      state.forecast.plans[addDays(d,-1)]={workingMin:120,slotMin:240,intervals:parseWindows('22:00–02:00'),precision:'intervals'};
      state.forecast.plans[d]={workingMin:540,slotMin:840,intervals:[],precision:'total'};
      localStorage.setItem('qa-simple',JSON.stringify(state));
    },date);
    await page.reload();await page.locator('#navForecast').click();
    await page.locator('#todayWorkHours').fill('8');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-simple')).forecast.weekConfig?.mode==='simple');
    assert.equal(await page.locator('#forecastError').isHidden(),true);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);runs.push({width,theme,result:'PASS'});await context.close();
}
await writeFile(`${out}/simple-forecast-ui.json`,JSON.stringify({result:'PASS',androidRuntimeTested:false,syntheticData:true,runs},null,2));
console.log(`PASS: ${runs.length} simple forecast and persistent 14/8 plan UI scenarios`);
}finally{await browser.close();server.close();}
