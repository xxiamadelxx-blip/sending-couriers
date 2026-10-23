import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root=fileURLToPath(new URL('../web/',import.meta.url)),output=fileURLToPath(new URL('../verification/1.7.1/',import.meta.url));await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',{'.html':'text/html','.mjs':'text/javascript','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:fileURLToPath(new URL('../../tools/headless/chrome-headless-shell-linux64/chrome-headless-shell',import.meta.url)),args:['--no-sandbox','--disable-dev-shm-usage']});
const compact=s=>s.replace(/\s/g,'');
const fixture=theme=>({schemaVersion:4,settings:{premiumCycleStart:'2026-08-21',theme,soundEnabled:false,hapticsEnabled:true},closures:{},entries:[{id:'old',date:'2026-10-02',dailyHours:10,dailyOrders:30,reward:900,tips:0,separateBonus:0},{id:'current',date:'2026-10-16',dailyHours:10,dailyOrders:33,reward:1000,tax:77,parkCommission:123,tips:10,separateBonus:50},{id:'rest',date:'2026-10-17',dailyHours:0,dailyOrders:0,reward:0,tips:0,separateBonus:0}]});
const results=[];
try{
for(const width of [360,390])for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height:844},locale:'ru-RU',timezoneId:'Europe/Moscow'});
 await context.addInitScript(data=>{if(!localStorage.getItem('native-test'))localStorage.setItem('native-test',JSON.stringify(data));window.__writeOk=true;window.__themes=[];window.__exports=[];window.CourierNative={readState:()=>localStorage.getItem('native-test'),writeState:value=>{if(!window.__writeOk)return false;localStorage.setItem('native-test',value);return true;},applyTheme:value=>window.__themes.push(value),ready:()=>{},feedback:()=>{},exportFile:(...args)=>window.__exports.push(args)};},fixture(theme));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#summaryGross').waitFor();await page.evaluate(()=>document.fonts.ready);
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('native-test')));
 assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
 const entriesBefore=(await saved()).entries;
 assert.equal(compact(await page.locator('#summaryGross').innerText()),'3660₽');
 await page.locator('#navSettings').click();assert.equal(await page.locator('#premiumCycleStart,#topInsetExtraDp').count(),0);
 assert.equal(await page.locator('#paymentPeriod').inputValue(),'2026-10-16');
 for(const [key,value] of Object.entries({hourlyRate:'420',basePace:'2,1',premiumPace:'3,25',paceBonusPercent:'7,5',cycleBonusPercent:'8'}))await page.locator('#'+key).fill(value);
 await page.locator('#savePaymentTerms').click();assert.equal(await page.locator('#paymentError').isVisible(),false);assert.equal((await saved()).schemaVersion,6);
 assert.equal((await saved()).settings.paymentRules[0].hourlyRate,420);assert.equal((await saved()).settings.premiumCycleStart,'2026-08-21');
 // Persist failure and validation keep both the saved record and the user's draft.
 let durable=await page.evaluate(()=>localStorage.getItem('native-test'));
 await page.locator('#hourlyRate').fill('450');await page.evaluate(()=>window.__writeOk=false);await page.locator('#savePaymentTerms').click();assert.equal(await page.locator('#hourlyRate').inputValue(),'450');assert.match(await page.locator('#paymentError').innerText(),/Не удалось сохранить/);assert.equal(await page.evaluate(()=>localStorage.getItem('native-test')),durable);
 const beforeThemes=await page.evaluate(()=>window.__themes.length);await page.locator('#themeSelect').selectOption(theme==='dark'?'light':'dark');assert.equal(await page.locator('#themeSelect').inputValue(),theme);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.equal(await page.evaluate(()=>window.__themes.length),beforeThemes);
 await page.evaluate(()=>window.__writeOk=true);await page.locator('#hourlyRate').fill('0');await page.locator('#savePaymentTerms').click();assert.match(await page.locator('#paymentError').innerText(),/больше 0/);assert.equal(await page.evaluate(()=>localStorage.getItem('native-test')),durable);await page.locator('#hourlyRate').fill('420');
 // A later version does not rewrite an earlier version or any actual payout.
 await page.locator('#paymentPeriod').selectOption('2026-10-30');assert.equal(await page.locator('#hourlyRate').inputValue(),'420');await page.locator('#hourlyRate').fill('500');await page.locator('#savePaymentTerms').click();assert.equal((await saved()).settings.paymentRules.length,2);
 await page.locator('#paymentPeriod').selectOption('2026-10-02');assert.equal(await page.locator('#hourlyRate').inputValue(),'360');await page.locator('#paymentPeriod').selectOption('2026-10-16');assert.equal(await page.locator('#hourlyRate').inputValue(),'420');
 const opposite=theme==='dark'?'light':'dark';await page.locator('#themeSelect').selectOption(opposite);assert.equal(await page.locator('html').getAttribute('data-theme'),opposite);await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),opposite);await page.locator('#navSettings').click();await page.locator('#themeSelect').selectOption(theme);
 await page.screenshot({path:`${output}/payment-settings-${theme}-${width}.png`,fullPage:true});
 if(theme==='dark')for(const selector of ['body','.detail-card','.bottom-nav','#hourlyRate','#themeSelect'])assert.equal(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)',selector);
 await page.locator('#navSummary').click();assert.equal(compact(await page.locator('#summaryGross').innerText()),'4260₽');assert.equal(compact(await page.locator('#summaryOwed').innerText()),'3200₽');assert.equal(compact(await page.locator('#summaryPaid .amount').innerText()),'1000₽');assert.equal(compact(await page.locator('#summaryPacePremium').innerText()),'315₽');assert.equal(compact(await page.locator('#summaryCyclePremium').innerText()),'516₽');assert.match(await page.locator('.gauge-label').innerText(),/2,10/);assert.match(await page.locator('.premium-teasers').innerText(),/7,5%/);assert.doesNotMatch(await page.locator('.premium-teasers').innerText(),/12 недель · 5%/);
 if(theme==='dark')assert.equal(await page.locator('.income-hero').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/overview-${theme}-${width}.png`,fullPage:true});
 await page.locator('#export').click();if(theme==='dark')assert.equal(await page.locator('#exportDialog').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');await page.locator('#saveReport').click();await page.locator('#backupReport').click();await page.locator('#closeExport').click();
 const exports=await page.evaluate(()=>window.__exports);assert.equal(exports.length,2);const report=exports[0][1],backup=JSON.parse(exports[1][1]);assert.match(report,/420/);assert.match(report,/3,25/);assert.match(report,/7,5%/);assert.match(report,/Вклад периодов/);assert.equal(backup.settings.theme,theme);assert.equal(backup.settings.paymentRules.length,2);
 await page.locator('#navPeriod').click();assert.match(await page.locator('main').innerText(),/От 3,25/);assert.equal(compact(await page.locator('#cyclePremium').innerText()),'516₽');await page.getByText('Состав расчёта',{exact:true}).click();const breakdown=compact(await page.locator('.cycle-breakdown').innerText());for(const s of ['360₽','420₽','5%','8%','180₽','336₽'])assert.ok(breakdown.includes(s),s);assert.equal(await page.locator('#configureCycle').count(),1);await page.screenshot({path:`${output}/period-${theme}-${width}.png`,fullPage:true});
 await page.locator('#navCalculator').click();if(theme==='dark')assert.equal(await page.locator('[data-calc="7"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');await page.keyboard.type('200+10%');await page.keyboard.press('Enter');assert.equal(await page.locator('#calculatorDisplay').innerText(),'220');await page.screenshot({path:`${output}/calculator-${theme}-${width}.png`});
 // Import old data without preferences cannot clear settings or produce duplicate slots.
 const current=await saved();await page.evaluate(()=>window.receiveImport(JSON.stringify({schemaVersion:2,entries:[],closures:{}})));await page.locator('#confirmImport').click();assert.deepEqual((await saved()).settings,current.settings);assert.deepEqual((await saved()).entries,current.entries);
 await page.locator('#periodPicker').selectOption('2026-10-02');await page.locator('#goBack').click();assert.equal(compact(await page.locator('#summaryGross').innerText()),'3600₽');
 const after=(await saved()).entries;for(const input of entriesBefore){const entry=after.find(e=>e.id===input.id);for(const key of ['date','dailyHours','dailyOrders','reward','tax','parkCommission','tips','separateBonus'])if(key in input)assert.equal(entry[key],input[key]);}
 assert.deepEqual(errors,[]);results.push({width,theme,result:'PASS',scenarios:['schema4-to5','effective-period-history','all-five-pay-settings','past-payments-unchanged','validation-and-write-failure-retain-draft','theme-failed-write-rollback','theme-relaunch-native-contract','custom-target-and-premium-labels','mixed-cycle-rates-and-percentages','export-and-backup','old-import-preserves-settings','AMOLED-black-surfaces','calculator-kept','no-overflow']});await context.close();
}
await writeFile(`${output}/payment-theme-ui-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
