import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root = fileURLToPath(new URL('../web/', import.meta.url));
const output = fileURLToPath(new URL('../verification/1.7.1/', import.meta.url));
await mkdir(output, {recursive:true});
const server = createServer(async(req,res)=>{
  try {
    const path = resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
    if(!path.startsWith(root)) throw new Error();
    res.setHeader('Content-Type', {'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.ttf':'font/ttf'}[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:fileURLToPath(new URL('../../tools/headless/chrome-headless-shell-linux64/chrome-headless-shell',import.meta.url)),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const compact=x=>x.replace(/\s/g,'');
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('courier-finance-v1')));
const fixture={schemaVersion:3,entries:Array.from({length:7},(_,i)=>({id:`qa-slot-${i}`,date:`2026-10-${16+i}`,periodId:'2026-10-16',dailyHours:i===6?9:10,dailyOrders:12,reward:i===0?8400:0,tax:0,parkCommission:0,tips:0,separateBonus:0,note:'Синтетический пример макета',createdAt:'2026-10-16T00:00:00Z',updatedAt:'2026-10-16T00:00:00Z'})),closures:{'2026-10-02':{finalAdjustment:700,note:'Факт старого окна',closedAt:'2026-10-16T00:00:00Z'}}};
const results=[];
try {
 for(const width of [360,390]) {
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,locale:'ru-RU',timezoneId:'Europe/Moscow',acceptDownloads:true});
  await context.addInitScript(data=>{if(!localStorage.getItem('courier-finance-v1'))localStorage.setItem('courier-finance-v1',JSON.stringify(data));},fixture);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('#summaryPace').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.locator('#choosePeriod').click();await page.locator('#periodPicker').selectOption('2026-10-16');await page.locator('#goBack').click();
  assert.equal(compact(await page.locator('#summaryPace').innerText()),'1,217заказа/ч');
  assert.equal(compact(await page.locator('#summaryOwed').innerText()),'16440₽');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${output}/rhythm-reference-${width}.png`});
  const overflow=await page.evaluate(()=>({horizontal:document.documentElement.scrollWidth>innerWidth,actionBottom:document.querySelector('#addDay').getBoundingClientRect().bottom,navTop:document.querySelector('#bottomNav').getBoundingClientRect().top}));
  assert.equal(overflow.horizontal,false);
  assert.ok(overflow.actionBottom<=overflow.navTop,`overview actions visible above navigation: ${JSON.stringify(overflow)}`);
  const recordsBefore=(await stored(page)).entries,closuresBefore=(await stored(page)).closures;
  await page.locator('#navPeriod').click();assert.match(await page.locator('main').innerText(),/Начало цикла не задано/);
  assert.equal(compact(await page.locator('#pacePremium').innerText()),'0₽');
  await page.locator('#configureCycle').click();await page.locator('#premiumCycleStart').fill('2026-10-02');await page.locator('#saveSettings').click();
  assert.match(await page.locator('#cycleDates').innerText(),/24 дек/);assert.equal(compact(await page.locator('#cyclePremium').innerText()),'1242₽');
  assert.deepEqual((await stored(page)).entries,recordsBefore);assert.deepEqual((await stored(page)).closures,closuresBefore);
  await page.locator('#navPeriod').click();await page.locator('#configureCycle').click();await page.locator('#premiumCycleStart').fill('2026-10-20');
  await page.screenshot({path:`${output}/settings-${width}.png`});await page.locator('#saveSettings').click();
  assert.equal(compact(await page.locator('#cyclePremium').innerText()),'522₽');
  await page.screenshot({path:`${output}/premiums-${width}.png`,fullPage:true});
  await page.reload();await page.locator('#navPeriod').click();await page.locator('#configureCycle').click();assert.equal(await page.locator('#premiumCycleStart').inputValue(),'2026-10-20');
  await page.locator('#navSummary').click();assert.equal(compact(await page.locator('#summaryHours').innerText()),'69ч');assert.equal(compact(await page.locator('#summaryOwed').innerText()),'16440₽');
  await page.locator('#export').click();let pending=page.waitForEvent('download');await page.locator('#saveReport').click();let download=await pending;
  const report=await readFile(await download.path(),'utf8');for(const expected of ['2,80','12 недель','2026-10-20','qa-slot-0','не являются фактическими выплатами'])assert.ok(report.includes(expected));
  pending=page.waitForEvent('download');await page.locator('#backupReport').click();download=await pending;
  const backup=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(backup.schemaVersion,6);assert.equal(backup.settings.premiumCycleStart,'2026-10-20');await page.locator('#closeExport').click();
  const savedBefore=await stored(page);
  await page.evaluate(()=>window.receiveImport(JSON.stringify({schemaVersion:2,entries:[],closures:{}})));await page.locator('#confirmImport').click();assert.equal((await stored(page)).settings.premiumCycleStart,'2026-10-20');
  await page.evaluate(()=>window.receiveImport(JSON.stringify({schemaVersion:4,settings:{premiumCycleStart:'2026-10-01'},entries:[],closures:{}})));await page.locator('#confirmImport').click();assert.match(await page.locator('#importError').innerText(),/другая дата/);assert.deepEqual(await stored(page),savedBefore);await page.locator('#cancelImport').click();
  assert.deepEqual(errors,[]);
  results.push({width,result:'PASS',overflow,scenarios:['schema3-preserves-IDs','cycle-save-relaunch','84-day-boundary','existing-fortnights-and-closures-unchanged','both-premiums-separate','ChatGPT-export-with-cycle-and-IDs','backup-schema5','old-import-preserves-cycle','conflict-atomic-rejection']});await context.close();
 }
 const boundaryContext=await browser.newContext({viewport:{width:390,height:844}});
 await boundaryContext.addInitScript(()=>localStorage.setItem('courier-finance-v1',JSON.stringify({schemaVersion:1,entries:[{date:'2026-10-02',displayedHours:30,displayedOrders:60},{date:'2026-10-08',displayedHours:40,displayedOrders:80}],closures:{}})));
 const boundaryPage=await boundaryContext.newPage();await boundaryPage.goto(url);await boundaryPage.locator('#navPeriod').click();await boundaryPage.locator('#configureCycle').click();await boundaryPage.locator('#premiumCycleStart').fill('2026-10-05');await boundaryPage.locator('#saveSettings').click();await boundaryPage.locator('.boundary-note summary').click();assert.match(await boundaryPage.locator('#cycleBoundaryNote').innerText(),/точно разделить их по границе невозможно/);assert.equal(compact(await boundaryPage.locator('#cyclePremium').innerText()),'180₽');await boundaryContext.close();results.push({result:'PASS',scenario:'legacy-cycle-boundary-warning-visible-without-changing-hours'});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(data=>{window.CourierNative={readState:()=>JSON.stringify(data),writeState:()=>false,ready:()=>{}};},fixture);
 const page=await context.newPage();await page.goto(url);await page.locator('#navPeriod').click();await page.locator('#configureCycle').click();await page.locator('#premiumCycleStart').fill('2026-10-02');await page.locator('#saveSettings').click();assert.match(await page.locator('#settingsError').innerText(),/Не удалось сохранить/);assert.equal(await page.locator('#premiumCycleStart').inputValue(),'2026-10-02');await context.close();
 results.push({result:'PASS',scenario:'native-write-failure-retains-cycle-form'});
 await writeFile(`${output}/premium-ui-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
