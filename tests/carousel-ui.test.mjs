import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {emptyState,upsertEntry,calculate} from '../web/core.mjs';
import {addDays,forecastClock} from '../web/forecast.mjs';

const {chromium}=createRequire(import.meta.url)(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root=fileURLToPath(new URL('../web/',import.meta.url));
const out=fileURLToPath(new URL('../verification/1.7.8/',import.meta.url));
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root))throw Error();
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.mjs':'application/javascript','.css':'text/css'}[extname(path)]??'application/octet-stream'});
  res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:fileURLToPath(new URL('../../tools/headless/chrome-headless-shell-linux64/chrome-headless-shell',import.meta.url)),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const date=forecastClock(emptyState().forecast).date;
function fixture(theme) {
  let s=emptyState();s.settings.theme=theme;s.settings.soundEnabled=false;s.settings.hapticsEnabled=false;
  s=upsertEntry(s,{date:addDays(date,-1),dailyHours:2,dailyOrders:4,reward:250,tips:5,displayedNet:230,note:'Старая заметка'});
  return s;
}
const results=[];
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('qa-176')));
const deck=page=>page.locator('#homeDeck');
async function swipe(page,selector) {
  const box=await page.locator(selector).boundingBox(),client=await page.context().newCDPSession(page);
  const y=Math.round(box.y+Math.min(box.height/2,80)),start=Math.round(box.x+box.width*.82),end=Math.round(box.x+box.width*.18);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
  for(let i=1;i<=7;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.round(start+(end-start)*i/7),y}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await client.detach();
}
async function settled(page,id) {
  await page.waitForFunction(id=>{
    const host=document.getElementById(id),track=host.querySelector('.pager-track');
    const index=Number(host.querySelector('[aria-selected="true"]').dataset.page);
    return Math.abs(track.scrollLeft-index*track.clientWidth)<2;
  },id,{timeout:5000});
  const box=await page.locator(`#${id} .pager-panel[aria-hidden="false"]`).boundingBox();
  const track=await page.locator(`#${id} .pager-track`).boundingBox();
  assert.ok(box.x>=track.x-2 && box.x+box.width<=track.x+track.width+2,`${id} card extends outside its viewport`);
}
async function centeredPaymentTab(page,index) {
  await page.waitForFunction(index=>{
    const bar=document.querySelector('#paymentDeck .pager-tabs').getBoundingClientRect();
    const tab=document.querySelector(`#paymentDeck [data-page="${index}"]`).getBoundingClientRect();
    return Math.abs((tab.left+tab.right-bar.left-bar.right)/2)<3;
  },index,{timeout:5000});
}
try{for(const width of [360,390])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'ru-RU',timezoneId:'Europe/Moscow'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const initial=fixture(theme);
  await page.addInitScript(s=>{
    if(!localStorage.getItem('qa-176'))localStorage.setItem('qa-176',JSON.stringify(s));
    window.qaFail=false;
    window.CourierNative={readState:()=>localStorage.getItem('qa-176'),writeState:raw=>{if(window.qaFail){window.qaFail=false;return false;}localStorage.setItem('qa-176',raw);return true;},ready:()=>{},feedback:()=>{},applyTheme:()=>{}};
  },initial);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await deck(page).waitFor();
  assert.deepEqual(await deck(page).locator('[role="tab"] span').allTextContents(),['Темп','Доход','Премии']);
  assert.equal(await deck(page).locator('[aria-selected=true]').count(),1);
  await page.screenshot({path:`${out}/Home-0-${width}-${theme}.png`});
  await deck(page).locator('[role="tab"]').nth(1).click();
  assert.equal(await deck(page).locator('[aria-selected=true]').innerText(),'Доход');
  await page.locator('#summaryGross').waitFor({state:'visible'});
  await page.screenshot({path:`${out}/Home-1-${width}-${theme}.png`});
  await swipe(page,'#homeDeck .pager-track');
  await page.waitForFunction(()=>document.querySelector('#homeDeck [data-page="2"]').getAttribute('aria-selected')==='true');
  await settled(page,'homeDeck');
  await page.locator('#summaryPacePremium').waitFor({state:'visible'});
  await page.screenshot({path:`${out}/Home-2-${width}-${theme}.png`});
  await deck(page).locator('[role="tab"]').nth(1).focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await deck(page).locator('[aria-selected=true]').innerText(),'Темп');
  await page.locator('#navPeriod').click();
  assert.equal(await page.locator('.period-overview').count(),1);
  assert.equal(await page.locator('#pacePremium,#cyclePremium,.period-overview .detail-amount,.cycle-settings .detail-amount').count(),0);
  assert.equal(await page.locator('#premiumCycleStart').count(),1);
  await page.screenshot({path:`${out}/Period-${width}-${theme}.png`});
  await page.locator('#navSettings').click();
  assert.equal(await page.locator('#paymentDeck .pager-panel').count(),8);
  assert.equal(await page.locator('#paymentDeck [role="tab"]').count(),8);
  assert.equal(await page.locator('#paymentDeck .pager-controls').count(),0);
  await centeredPaymentTab(page,0);
  const values=['','500','2,05','3,1','90','1,85','6','7,5'];
  for(let i=0;i<8;i++){
    await page.locator(`#paymentDeck [data-page="${i}"]`).click();
    assert.equal(await page.locator('#paymentDeck [aria-selected="true"]').getAttribute('data-page'),String(i));
    if(i){const key=['','hourlyRate','basePace','premiumPace','minimumHours','criticalPace','paceBonusPercent','cycleBonusPercent'][i];await page.locator('#'+key).fill(values[i]);}
  }
  await centeredPaymentTab(page,7);
  await page.screenshot({path:`${out}/Payment-${width}-${theme}.png`});
  const draft=await page.locator('#hourlyRate').inputValue();
  await page.locator('#themeToggle').click();assert.equal(await page.locator('#hourlyRate').inputValue(),draft);
  assert.equal(await page.locator('#paymentDeck [aria-selected="true"]').getAttribute('data-page'),'7');
  await page.locator('#paymentDeck [data-page="6"]').click();
  await swipe(page,'#paymentDeck .pager-track');
  await page.waitForFunction(()=>document.querySelector('#paymentDeck [data-page="7"]').getAttribute('aria-selected')==='true');
  await settled(page,'paymentDeck');
  const before=await page.evaluate(()=>localStorage.getItem('qa-176'));
  await page.evaluate(()=>window.qaFail=true);
  await page.locator('#savePaymentTerms').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('qa-176')),before);
  assert.match(await page.locator('#paymentError').innerText(),/Не удалось сохранить/);
  await page.locator('#savePaymentTerms').click();
  assert.equal((await saved(page)).settings.paymentRules.at(-1).hourlyRate,500);
  await page.locator('#navAddSlot').click();
  assert.equal(await page.locator('details.additional:not(.slot-working),#displayedNet,#note').count(),0);
  await page.screenshot({path:`${out}/Slot-${width}-${theme}.png`});
  await page.locator('#date').fill(date);
  await page.locator('#dailyHours').fill('7');await page.locator('#dailyOrders').fill('18');
  await page.locator('#reward').fill('1500');await page.locator('#tips').fill('30');
  await page.locator('.slot-working summary').click();
  await page.locator('#slotWorkMode').selectOption('intervals');
  const rows=page.locator('#slotIntervals .interval-row');
  await rows.first().locator('[data-start]').fill('10:00');await rows.first().locator('[data-end]').fill('15:00');
  await page.locator('#slotIntervals [data-add]').click();
  await rows.nth(1).locator('[data-start]').fill('17:00');await rows.nth(1).locator('[data-end]').fill('21:00');
  await page.locator('#saveDay').click();await deck(page).waitFor();
  const afterFirst=await saved(page);assert.equal(afterFirst.forecast.days[date].workingMin,540);
  await page.locator('#navAddSlot').click();
  assert.equal(await page.locator('#reward').inputValue(),'');
  assert.equal(await page.locator('#tips').inputValue(),'');
  await page.locator('#date').fill(date);await page.locator('#dailyHours').fill('7');await page.locator('#dailyOrders').fill('10');
  await page.locator('#reward').fill('900');await page.locator('#saveDay').click();await deck(page).waitFor();
  const after=await saved(page),same=after.entries.filter(e=>e.date===date);
  assert.equal(same.length,2);assert.equal(after.forecast.days[date].workingMin,540);
  assert.equal(after.forecast.days[date].orders,28);assert.equal(after.forecast.days[date].appAccountedMin,840);
  assert.equal(same.reduce((n,e)=>n+e.reward,0),2400);
  assert.equal(same.reduce((n,e)=>n+e.tips,0),30);
  assert.equal(calculate(after,after.entries.at(-1).periodId).paidReward,2650);
  await page.evaluate(async date=>{
    const {saveDay,parseWindows}=await import('./forecast.mjs');
    const s=JSON.parse(localStorage.getItem('qa-176'));
    s.forecast=saveDay(s.forecast,{date,source:'finance-slots',precision:'intervals',intervals:[...parseWindows('10:00–15:00;17:00–21:00'),...parseWindows('15:00–17:00','UNAVAILABLE')],workConfirmed:true});
    localStorage.setItem('qa-176',JSON.stringify(s));
  },date);
  await page.reload();await page.locator('#navAddSlot').click();
  await page.locator('#date').fill(date);
  await page.locator('.slot-working summary').click();
  assert.equal(await page.locator('#slotIntervals .interval-row').count(),2,'pause must not appear as a work row');
  assert.match(await page.locator('#slotWorkingEditor').innerText(),/Сохранённая пауза: 15:00–17:00/);
  await page.locator('#slotIntervals .interval-row').first().locator('[data-end]').fill('14:59');
  await page.locator('#dailyHours').fill('0');await page.locator('#dailyOrders').fill('0');await page.locator('#reward').fill('0');
  await page.locator('#saveDay').click();await deck(page).waitFor();
  const paused=await saved(page);
  assert.equal(paused.forecast.days[date].workingMin,539);
  assert.equal(paused.forecast.days[date].unavailableMin,120);
  assert.equal(paused.forecast.days[date].orders,28);
  assert.equal(calculate(paused,paused.entries.at(-1).periodId).paidReward,2650);
  await page.locator('#navPeriod').click();await page.locator('#periodHistory').click();
  await page.locator(`.edit-day[data-entry="${initial.entries[0].id}"]`).click();
  assert.equal(await page.locator('#displayedNet,#note').count(),0);
  await page.locator('#reward').fill('260');await page.locator('#saveDay').click();
  const edited=(await saved(page)).entries.find(e=>e.id===initial.entries[0].id);
  assert.equal(edited.displayedNet,230);assert.equal(edited.note,'Старая заметка');
  await page.locator('#navForecast').click();
  assert.equal(await page.getByText('Сегодня · факт').count(),0);
  assert.equal(await page.getByText('До конца рабочего плана').count(),0);
  if(await page.locator('#remainingForecast').count())assert.match(await page.locator('#remainingForecast').innerText(),/Прогноз до конца смены|Ещё/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  results.push({width,theme,result:'PASS',androidRuntimeTested:false});
  await context.close();
}
await writeFile(`${out}/ui-results.json`,JSON.stringify({result:'PASS',contexts:results,androidRuntimeTested:false},null,2));
console.log(`PASS ${results.length}/4 payment carousel, period and slot cleanup`);
}finally{await browser.close();server.close();}
