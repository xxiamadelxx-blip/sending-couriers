import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { periodFor } from '../web/core.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root = fileURLToPath(new URL('../web/', import.meta.url));
const output = fileURLToPath(new URL('../verification/1.7.1/', import.meta.url));
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname.replace(/^\/$/, '/index.html'));
    if (!path.startsWith(root)) throw new Error();
    const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'application/javascript' };
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || fileURLToPath(new URL('../../tools/headless/chrome-headless-shell-linux64/chrome-headless-shell', import.meta.url)),
  args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true
});
const results = [];
const compact = text => text.replace(/[\s\u00a0\u202f]/g, '');
const saved = page => page.evaluate(() => localStorage.getItem('courier-finance-v1'));
const period = '2026-10-02';
const reportFixture = JSON.parse(await readFile(new URL('./fixtures/pace-report-2026-10-13.json', import.meta.url), 'utf8'));
const legacyData = {
  schemaVersion: 1,
  closures: { [period]: { finalAdjustment: 500, note: 'Прежнее закрытие', closedAt: '2026-10-16T00:00:00Z' } },
  entries: [
    { date: period, displayedHours: 14, displayedOrders: 0, reward: 0, tax: 0, parkCommission: 0, tips: 0, separateBonus: 0, note: 'Тестовые данные', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' },
    { date: '2026-10-03', displayedHours: 14, displayedOrders: 36, reward: 330, tax: 177, parkCommission: 177, tips: 90, separateBonus: 3750, note: 'Прежние удержания', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
  ]
};

const pendingLegacyData = { ...legacyData, schemaVersion: 2, entries: legacyData.entries.map(({ displayedHours, displayedOrders, ...e }) => ({ ...e, dailyHours: null, dailyOrders: null, legacyReading: { date: e.date, hours: displayedHours, orders: displayedOrders, interpretation: 'pending' } })) };

async function noChooser(page) {
  assert.equal(await page.locator('#chooseLegacy, #reinterpretLegacy, .migration-card, .migration-choices').count(), 0);
  assert.doesNotMatch(await page.locator('main').innerText(), /Перенос прежних часов|Выбрать способ переноса|Вводил спидометр|Вводил за день/i);
}
async function contextFor(width) {
  return browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Moscow', locale: 'ru-RU', acceptDownloads: true });
}
function observe(page, errors) { page.on('pageerror', error => errors.push(error.message)); }
async function layout(page, name) {
  const violations = await page.evaluate(() => {
    const width = innerWidth;
    return [...document.querySelectorAll('main button, main input, main textarea, main h1, main .meter-value, main .small-finance, main .pace-line, main table')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > width + 1); })
      .map(el => el.outerHTML.slice(0, 100));
  });
  assert.deepEqual(violations, [], `${name}: no horizontal clipping`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal scrolling`);
  assert.ok(await page.locator('.meter-value').evaluateAll(elements => elements.every(e => e.scrollWidth <= e.clientWidth)), `${name}: complete meter text`);
}
async function choosePeriod(page, id) {
  if (await page.locator('#history').count()) await page.locator('#history').click();
  await page.locator('#periodPicker').selectOption(id);
  await page.locator('#goBack').click();
}
async function fill(page, fields) {
  for (const [id, value] of Object.entries(fields)) await page.locator('#' + id).fill(String(value));
}
async function saveDay(page, fields) {
  await page.locator('#addDay').click();
  await fill(page, fields);
  await page.locator('#saveDay').click();
  await page.locator('#summaryGross').waitFor();
}
async function edit(page, date) {
  await page.locator('#history').click();
  await page.locator('#periodPicker').selectOption(periodFor(date).id);
  await page.locator(`[data-date="${date}"]`).click();
}
async function download(page, button) {
  const event = page.waitForEvent('download');
  await page.locator(button).click();
  const file = await event;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
}
async function importJSON(page, data) {
  await page.locator('#importInput').setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
  await page.locator('#importDialog').waitFor({ state: 'visible' });
}

try {
  for (const width of [360, 390]) {
    const errors = [];
    const context = await contextFor(width);
    const page = await context.newPage(); observe(page, errors);
    await page.goto(url);
    await page.locator('#addDay').waitFor();
    assert.match(await page.locator('#summaryHours').innerText(), /—/);
    assert.equal(await saved(page), null);
    await layout(page, `empty ${width}`);
    await page.screenshot({ path: `${output}/main-empty-${width}.png`, fullPage: true });
    await page.locator('#addDay').click();
    assert.equal(await page.locator('#dailyHours').getAttribute('inputmode'), 'decimal');
    assert.equal(await page.locator('#dailyHours').getAttribute('required'), null);
    assert.equal(await page.locator('#dailyOrders').getAttribute('required'), null);
    assert.equal(await page.locator('.optional-reading').count(), 0);
    assert.equal(await page.evaluate(() => Math.round(document.querySelector('#dailyHours').getBoundingClientRect().top) === Math.round(document.querySelector('#dailyOrders').getBoundingClientRect().top)), true);
    assert.ok(await page.evaluate(() => document.querySelector('.form-scroll').getBoundingClientRect().bottom <= document.querySelector('.save-area').getBoundingClientRect().top));
    await layout(page, `daily form ${width}`);
    await page.screenshot({ path: `${output}/add-day-${width}.png`, fullPage: true });
    await page.locator('.form-scroll').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await page.screenshot({ path: `${output}/add-day-extra-${width}.png`, fullPage: true });
    await fill(page, { date: period, dailyHours: 14, dailyOrders: 0, reward: 0, note: 'Тестовая запись, не реальные данные' });
    await page.locator('#saveDay').click(); await page.locator('#summaryHours').waitFor();
    await saveDay(page, { date: '2026-10-03', dailyHours: 14, dailyOrders: 36, reward: 3600, tax: 144, parkCommission: 144, tips: 90 });
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '28ч');
    assert.equal(await page.locator('#summaryOrders').innerText(), '36');
    assert.equal(compact(await page.locator('#summaryGross').innerText()), '10170₽');
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '6480₽');
    assert.equal(await page.locator('#summaryPace').innerText(), '1,286 заказа/ч');
    await layout(page, `14 plus 14 ${width}`);
    await page.locator('#toast').evaluate(e => { e.hidden = true; });
    await page.screenshot({ path: `${output}/sum-14-plus-14-${width}.png`, fullPage: true });
    await page.reload(); await page.locator('#summaryHours').waitFor();
    await choosePeriod(page, period);
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '28ч');
    await saveDay(page, { date: '2026-10-04', dailyHours: '0,5', dailyOrders: 2, reward: 177, tax: '7,08', parkCommission: '7.08' });
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '28,5ч');
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '6483₽');
    await saveDay(page, { date: '2026-10-05', reward: 0, note: 'Выходной без показаний' });
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '28,5ч');
    assert.match(await page.locator('#financeHint').textContent(), /3 из 4 записей/);
    await saveDay(page, { date: '2026-10-01', reward: '500,75', tax: '20,03', parkCommission: '20,03' });
    assert.match(await page.locator('#summaryHours').innerText(), /—/);
    assert.equal(compact(await page.locator('#summaryPaid .amount').innerText()), '500,75₽');
    await choosePeriod(page, period);
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '28,5ч');
    const originalCreated = JSON.parse(await saved(page)).entries.find(e => e.date === period).createdAt;
    await edit(page, period);
    await page.locator('#dailyHours').fill('8,5');
    await page.locator('#saveDay').click(); await page.locator('#summaryHours').waitFor();
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '23ч');
    assert.equal(JSON.parse(await saved(page)).entries.find(e => e.date === period).createdAt, originalCreated);
    assert.equal(compact(await page.locator('#summaryGross').innerText()), '8370₽');
    await edit(page, '2026-10-03');
    await fill(page, { reward: 330, tax: '-1', parkCommission: 177 });
    const beforeFormatError = await saved(page);
    assert.equal(await page.locator('#tax').getAttribute('aria-invalid'), 'true');
    await page.locator('#saveDay').click();
    assert.match(await page.locator('#formError').innerText(), /Налог:/);
    assert.equal(await saved(page), beforeFormatError);
    await page.locator('#tax').fill('177');
    assert.equal(await page.locator('#tax').getAttribute('aria-invalid'), 'false');
    assert.equal(await page.locator('#parkCommission').getAttribute('aria-invalid'), 'false');
    assert.match(await page.locator('#tax-note').innerText(), /13,20.*19,80/);
    assert.match(await page.locator('#parkCommission-note').innerText(), /5%.*16,50/);
    assert.match(await page.locator('#parkCommission-error').innerText(), /Сумму можно сохранить/);
    assert.ok(await page.locator('#tax-error').evaluate(e => e.classList.contains('field-warning')));
    assert.equal(await page.locator('#saveDay').isDisabled(), false);
    assert.equal(await page.locator('#formError').isVisible(), false);
    await page.locator('#tax').scrollIntoViewIfNeeded();
    await layout(page, `percentage warnings ${width}`);
    await page.screenshot({ path: `${output}/deduction-warnings-${width}.png`, fullPage: true });
    await page.locator('#saveDay').click(); await page.locator('#summaryGross').waitFor();
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '7773₽');
    let warningRow = JSON.parse(await saved(page)).entries.find(e => e.date === '2026-10-03');
    assert.equal(warningRow.tax, 177); assert.equal(warningRow.parkCommission, 177);
    await edit(page, '2026-10-03');
    await page.locator('#reward').fill('3300');
    assert.match(compact(await page.locator('#tax-note').innerText()), /132₽–198₽/);
    assert.match(compact(await page.locator('#parkCommission-note').innerText()), /165₽/);
    assert.equal(await page.locator('#tax-error').isVisible(), false);
    assert.equal(await page.locator('#parkCommission-error').isVisible(), true);
    await page.locator('#saveDay').click(); await page.locator('#summaryGross').waitFor();
    warningRow = JSON.parse(await saved(page)).entries.find(e => e.date === '2026-10-03');
    assert.equal(warningRow.reward, 3300); assert.equal(warningRow.tax, 177); assert.equal(warningRow.parkCommission, 177);
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '4803₽');
    await edit(page, '2026-10-04');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#deleteDay').click(); await page.locator('#periodPicker').waitFor();
    await page.locator('#goBack').click();
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '22,5ч');
    assert.equal(await page.locator('#summaryOrders').innerText(), '36');
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '4800₽');
    await saveDay(page, { date: '2026-10-06', dailyHours: '2,25', reward: 700, tax: 28 });
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '24,75ч');
    assert.equal(await page.locator('#summaryPace').innerText(), '1,455 заказа/ч');
    assert.match(await page.locator('#paceNote').innerText(), /по введённым итогам/);
    assert.equal(await page.locator('#summaryReserve').innerText(), 'Можно без заказов: 0 ч');
    await saveDay(page, { date: '2026-10-07', dailyOrders: 5, reward: 0 });
    assert.equal(await page.locator('#summaryOrders').innerText(), '41');
    assert.equal(await page.locator('#summaryPace').innerText(), '1,657 заказа/ч');
    await edit(page, '2026-10-06'); await page.locator('#dailyOrders').fill('4');
    await page.locator('#saveDay').click(); await page.locator('#summaryGross').waitFor();
    await edit(page, '2026-10-07'); await page.locator('#dailyHours').fill('1,25');
    await page.locator('#saveDay').click(); await page.locator('#summaryGross').waitFor();
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '26ч');
    assert.equal(await page.locator('#summaryOrders').innerText(), '45');
    assert.equal(await page.locator('#paceNote').count(), 0);
    assert.equal(compact(await page.locator('#summaryGross').innerText()), '9450₽');
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '5360₽');
    assert.doesNotMatch(await page.locator('main').innerText(), /налог|комисси|Снимок на/i);
    await layout(page, `daily final summary ${width}`);
    await page.locator('#history').click();
    assert.equal(await page.locator('.day-card').count(), 5);
    const restCard = page.locator('.day-card').filter({ has: page.locator('[data-date="2026-10-05"]') });
    assert.match(await restCard.innerText(), /часы не записаны/);
    assert.match(await restCard.innerText(), /— ч\s+— заказов/);
    assert.doesNotMatch(await page.locator('main').innerText(), /Изменение отображаемых|Первый снимок|налог|комисси/i);
    await layout(page, `daily history ${width}`);
    await page.screenshot({ path: `${output}/history-${width}.png`, fullPage: true });
    await page.locator('#closePeriod').click();
    await fill(page, { finalAdjustment: 5360, closureNote: 'Тестовое закрытие' });
    await page.locator('#closureForm button[type=submit]').click();
    await page.locator('#periodPicker').waitFor();
    await page.locator('#goBack').click();
    assert.equal(compact(await page.locator('#summaryGross').innerText()), '9450₽');
    assert.equal(compact(await page.locator('#summaryOwed').innerText()), '5360₽');
    await page.locator('#export').click();
    const report = await download(page, '#saveReport');
    assert.match(report.name, /^courier-report-\d{4}-\d{2}-\d{2}\.md$/);
    assert.match(report.text, /Часы за период: 26/);
    assert.match(report.text, /\| 2026-10-05 \| — \| — \| 0\s?₽/);
    assert.match(report.text, /Фактическая финальная доплата/);
    assert.doesNotMatch(report.text, /налог|комисси|Изменение отображаемых/i);
    await writeFile(`${output}/test-report-${width}.md`, report.text);
    await page.locator('#closeExport').click();
    await saveDay(page, { date: '2026-10-16', dailyHours: 4, dailyOrders: 12, reward: 500, tax: 20 });
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '4ч');
    await page.reload(); await page.locator('#summaryHours').waitFor();
    await choosePeriod(page, period);
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '26ч');
    await page.locator('#export').click();
    const backup = await download(page, '#backupReport');
    const backupState = JSON.parse(backup.text);
    assert.equal(backupState.schemaVersion, 6);
    assert.equal(backupState.entries.find(e => e.date === '2026-10-03').parkCommission, 177);
    assert.equal(backupState.entries.find(e => e.date === '2026-10-03').tax, 177);
    await page.locator('#closeExport').click();
    await page.locator('#toast').evaluate(e => { e.hidden = true; });
    await page.screenshot({ path: `${output}/main-daily-${width}.png`, fullPage: true });

    const importContext = await contextFor(width);
    const importPage = await importContext.newPage(); observe(importPage, errors);
    await importPage.goto(url); await importPage.locator('#history').click();
    await importJSON(importPage, backup.text);
    assert.match(await importPage.locator('#importDescription').innerText(), /Записей в файле: 7; дней: 7/);
    await importPage.locator('#cancelImport').click();
    assert.equal(await saved(importPage), null);
    await importJSON(importPage, backup.text);
    await importPage.locator('#confirmImport').click(); await importPage.locator('#periodPicker').waitFor();
    await choosePeriod(importPage, period);
    assert.equal(compact(await importPage.locator('#summaryHours').innerText()), '26ч');
    assert.equal(await importPage.locator('#chooseLegacy').count(), 0);
    await importPage.locator('#history').click();
    const replacement = structuredClone(backupState);
    Object.assign(replacement.entries.find(e => e.date === period), { dailyHours: 7, dailyOrders: 2, reward: 100, tax: 4, parkCommission: 4 });
    await importJSON(importPage, replacement);
    await importPage.locator('#confirmImport').click(); await importPage.locator('#periodPicker').waitFor();
    assert.equal(JSON.parse(await saved(importPage)).entries.length, 7);
    await choosePeriod(importPage, period);
    assert.equal(compact(await importPage.locator('#summaryHours').innerText()), '24,5ч');
    await choosePeriod(importPage, '2026-10-16');
    assert.equal(compact(await importPage.locator('#summaryHours').innerText()), '4ч');
    const importBefore = await saved(importPage);
    await importPage.evaluate(() => window.receiveImport('{bad json'));
    assert.match(await importPage.locator('#toast').innerText(), /Не удалось импортировать/);
    assert.equal(await saved(importPage), importBefore);
    await importContext.close();

    const warningContext = await contextFor(width);
    const warningPage = await warningContext.newPage(); observe(warningPage, errors);
    await warningPage.goto(url); await warningPage.locator('#addDay').click();
    await fill(warningPage, { date: period, dailyHours: '14.20', dailyOrders: 40, reward: 4000, tax: 84, parkCommission: 200 });
    assert.match(compact(await warningPage.locator('#tax-note').innerText()), /4–6%:160₽–240₽/);
    assert.match(compact(await warningPage.locator('#parkCommission-note').innerText()), /5%:200₽/);
    assert.match(await warningPage.locator('#tax-error').innerText(), /Сумму можно сохранить/);
    assert.equal(await warningPage.locator('#tax').getAttribute('aria-invalid'), 'false');
    assert.equal(await warningPage.locator('#parkCommission-error').isVisible(), false);
    await warningPage.locator('#tax').scrollIntoViewIfNeeded();
    await layout(warningPage, `4000 / 84 / 200 ${width}`);
    await warningPage.screenshot({ path: `${output}/example-4000-84-200-${width}.png`, fullPage: true });
    await warningPage.locator('#saveDay').click(); await warningPage.locator('#summaryHours').waitFor();
    assert.equal(compact(await warningPage.locator('#summaryHours').innerText()), '14,2ч');
    assert.equal(compact(await warningPage.locator('#summaryGross').innerText()), '5112₽');
    assert.equal(compact(await warningPage.locator('#summaryOwed').innerText()), '1112₽');
    let actualAmounts = JSON.parse(await saved(warningPage)).entries[0];
    assert.equal(actualAmounts.reward, 4000); assert.equal(actualAmounts.tax, 84); assert.equal(actualAmounts.parkCommission, 200);
    await warningPage.reload(); await warningPage.locator('#summaryHours').waitFor();
    await edit(warningPage, period);
    assert.equal(await warningPage.locator('#tax').inputValue(), '84'); assert.equal(await warningPage.locator('#parkCommission').inputValue(), '200');
    for (const tax of [160, 200, 240]) {
      await warningPage.locator('#tax').fill(String(tax));
      assert.equal(await warningPage.locator('#tax-error').isVisible(), false);
      assert.equal(await warningPage.locator('#tax').getAttribute('aria-invalid'), 'false');
    }
    await fill(warningPage, { tax: 84, parkCommission: 230 });
    assert.equal(await warningPage.locator('#parkCommission-error').isVisible(), true);
    assert.equal(await warningPage.locator('#parkCommission').getAttribute('aria-invalid'), 'false');
    await warningPage.locator('#saveDay').click(); await warningPage.locator('#summaryGross').waitFor();
    actualAmounts = JSON.parse(await saved(warningPage)).entries[0];
    assert.equal(actualAmounts.tax, 84); assert.equal(actualAmounts.parkCommission, 230);
    await warningContext.close();

    const reportContext = await contextFor(width);
    await reportContext.addInitScript(data => {
      if (!localStorage.getItem('courier-finance-v1')) localStorage.setItem('courier-finance-v1', JSON.stringify(data));
    }, reportFixture);
    const reportPage = await reportContext.newPage(); observe(reportPage, errors);
    await reportPage.goto(url); await reportPage.locator('#summaryHours').waitFor();
    await choosePeriod(reportPage, period);
    const reportBefore = await saved(reportPage);
    assert.equal(compact(await reportPage.locator('#summaryHours').innerText()), '120ч');
    assert.equal(await reportPage.locator('#summaryOrders').innerText(), '217');
    assert.equal(await reportPage.locator('#summaryPace').innerText(), '1,808 заказа/ч');
    assert.equal(await reportPage.locator('#summaryReserve').innerText(), 'Можно без заказов: 0 ч 33 мин');
    assert.match(await reportPage.locator('#paceNote').innerText(), /по введённым итогам/);
    assert.equal(compact(await reportPage.locator('#summaryGross').innerText()), '47345₽');
    assert.equal(compact(await reportPage.locator('#summaryOwed').innerText()), '23200₽');
    assert.doesNotMatch(await reportPage.locator('#financeHint').textContent(), /внесите часы и заказы за одни и те же дни/);
    await layout(reportPage, `report pace regression ${width}`);
    await reportPage.screenshot({ path: `${output}/report-pace-${width}.png`, fullPage: true });
    await reportPage.reload(); await reportPage.locator('#summaryHours').waitFor();
    await choosePeriod(reportPage, period);
    assert.equal(await reportPage.locator('#summaryPace').innerText(), '1,808 заказа/ч');
    assert.equal(await saved(reportPage), reportBefore, 'opening does not mutate stored counters');
    await reportPage.locator('#export').click();
    const partialReport = await download(reportPage, '#saveReport');
    assert.match(partialReport.text, /Текущий темп: 1,808 заказа\/ч/);
    assert.match(partialReport.text, /Можно без заказов до 1,80: 0 ч 33 мин/);
    const partialBackup = JSON.parse((await download(reportPage, '#backupReport')).text);
    assert.equal(partialBackup.entries.find(e => e.date === '2026-10-10').dailyOrders, null);
    await reportPage.locator('#closeExport').click();
    await edit(reportPage, '2026-10-10');
    assert.equal(await reportPage.locator('#dailyOrders').inputValue(), '');
    await reportPage.locator('#note').fill('Проверка сохранения пустого поля');
    await reportPage.locator('#saveDay').click(); await reportPage.locator('#summaryPace').waitFor();
    assert.equal(JSON.parse(await saved(reportPage)).entries.find(e => e.date === '2026-10-10').dailyOrders, null);
    assert.equal(await reportPage.locator('#summaryPace').innerText(), '1,808 заказа/ч');
    await edit(reportPage, '2026-10-10'); await reportPage.locator('#dailyOrders').fill('0');
    await reportPage.locator('#saveDay').click(); await reportPage.locator('#summaryPace').waitFor();
    assert.equal(await reportPage.locator('#paceNote').count(), 0);
    assert.equal(await reportPage.locator('#summaryReserve').innerText(), 'Можно без заказов: 0 ч 33 мин');
    await reportPage.reload(); await reportPage.locator('#summaryHours').waitFor();
    await choosePeriod(reportPage, period);
    assert.equal(await reportPage.locator('#summaryPace').innerText(), '1,808 заказа/ч');
    assert.equal(compact(await reportPage.locator('#summaryGross').innerText()), '47345₽');
    results.push({ reportRegression: 'PASS', viewport: width, scenarios: ['120-hours-217-orders-with-blank-rest-day', '33-minute-reserve', 'unchanged-finances', 'reload-without-write', 'markdown-and-json-preserve-null', 'save-blank-counter', 'explicit-zero-completes-day'] });
    await reportContext.close();

    const slotsContext = await contextFor(width);
    await slotsContext.addInitScript(() => {
      if (!localStorage.getItem('courier-finance-v1')) localStorage.setItem('courier-finance-v1', JSON.stringify({ schemaVersion: 2, closures: {}, entries: [
        { date: '2026-10-13', dailyHours: 4, dailyOrders: 17, reward: 1700, tax: 84, parkCommission: 200, tips: 90, separateBonus: 0, note: 'Утро' }
      ] }));
    });
    const slotsPage = await slotsContext.newPage(); observe(slotsPage, errors);
    await slotsPage.goto(url); await slotsPage.locator('#summaryHours').waitFor();
    await choosePeriod(slotsPage, period);
    assert.equal(JSON.parse(await saved(slotsPage)).schemaVersion, 2, 'opening an older store does not force a write');
    await slotsPage.locator('#addDay').click();
    await fill(slotsPage, { date: '2026-10-13', dailyHours: 4, dailyOrders: 10, reward: 900, tax: 10, parkCommission: 130, tips: 5, separateBonus: 25, note: 'Вечер' });
    assert.match(await slotsPage.locator('#slotHint').innerText(), /Других слотов за эту дату: 1/);
    assert.equal(await slotsPage.locator('#saveDay').isDisabled(), false);
    await slotsPage.locator('#saveDay').click(); await slotsPage.locator('#summaryHours').waitFor();
    let slotsState = JSON.parse(await saved(slotsPage));
    assert.equal(slotsState.schemaVersion, 6); assert.equal(slotsState.entries.length, 2);
    const firstId = slotsState.entries.find(e => e.note === 'Утро').id;
    const secondId = slotsState.entries.find(e => e.note === 'Вечер').id;
    assert.notEqual(firstId, secondId);
    const firstSlot = structuredClone(slotsState.entries.find(e => e.id === firstId));
    assert.equal(compact(await slotsPage.locator('#summaryHours').innerText()), '8ч');
    assert.equal(await slotsPage.locator('#summaryOrders').innerText(), '27');
    assert.equal(compact(await slotsPage.locator('#summaryGross').innerText()), '3000₽');
    await slotsPage.reload(); await slotsPage.locator('#summaryHours').waitFor();
    await choosePeriod(slotsPage, period);
    await slotsPage.locator('#history').click();
    assert.equal(await slotsPage.locator('.day-card').count(), 2);
    assert.equal(await slotsPage.locator('.day-group').count(), 1);
    assert.match(await slotsPage.locator('.day-total').innerText(), /Всего за день: 8 ч · 27 заказов/);
    await layout(slotsPage, `multiple slots history ${width}`);
    await slotsPage.screenshot({ path: `${output}/same-date-slots-${width}.png`, fullPage: true });
    await slotsPage.locator(`[data-entry="${secondId}"]`).click();
    await fill(slotsPage, { dailyHours: '3,5', dailyOrders: 12, reward: 1200 });
    await slotsPage.locator('#saveDay').click(); await slotsPage.locator('#summaryHours').waitFor();
    slotsState = JSON.parse(await saved(slotsPage));
    assert.deepEqual(slotsState.entries.find(e => e.id === firstId), firstSlot);
    assert.equal(compact(await slotsPage.locator('#summaryHours').innerText()), '7,5ч');
    assert.equal(await slotsPage.locator('#summaryOrders').innerText(), '29');
    assert.equal(compact(await slotsPage.locator('#summaryOwed').innerText()), '-200₽');
    await slotsPage.locator('#export').click();
    const slotsBackup = await download(slotsPage, '#backupReport');
    const slotsReport = await download(slotsPage, '#saveReport');
    assert.match(slotsReport.text, /Слоты и записи/); assert.match(slotsReport.text, /Итоги по дням/);
    assert.match(slotsReport.text, /\| 2026-10-13 \| 7,5 \| 29 \|/);
    await slotsPage.locator('#closeExport').click();
    await slotsPage.locator('#history').click(); await importJSON(slotsPage, slotsBackup.text);
    assert.match(await slotsPage.locator('#importDescription').innerText(), /Записей в файле: 2; дней: 1/);
    await slotsPage.locator('#confirmImport').click(); await slotsPage.locator('#periodPicker').waitFor();
    assert.equal(JSON.parse(await saved(slotsPage)).entries.length, 2);
    await slotsPage.locator(`[data-entry="${firstId}"]`).click();
    slotsPage.once('dialog', dialog => dialog.accept());
    await slotsPage.locator('#deleteDay').click(); await slotsPage.locator('#periodPicker').waitFor();
    assert.equal(await slotsPage.locator('.day-card').count(), 1);
    slotsState = JSON.parse(await saved(slotsPage));
    assert.equal(slotsState.entries[0].id, secondId);
    assert.equal(slotsState.entries[0].dailyHours, 3.5);
    await slotsPage.locator('#goBack').click();
    assert.equal(compact(await slotsPage.locator('#summaryHours').innerText()), '3,5ч');
    assert.equal(await slotsPage.locator('#summaryOrders').innerText(), '12');
    await slotsPage.reload(); await slotsPage.locator('#summaryHours').waitFor();
    await choosePeriod(slotsPage, period);
    assert.equal(compact(await slotsPage.locator('#summaryHours').innerText()), '3,5ч');
    results.push({ slotsRegression: 'PASS', viewport: width, scenarios: ['schema2-open-without-write', 'second-slot-same-date-with-warnings', 'separate-stable-IDs', 'period-and-day-sums', 'relaunch-preserves-slots', 'edit-only-second', 'JSON-and-Markdown', 'reimport-without-duplicates', 'delete-only-first', 'relaunch-after-delete'] });
    await slotsContext.close();

    for (const [kind, fixture] of [['schema1', legacyData], ['pending-schema2', pendingLegacyData]]) {
      const legacyContext = await contextFor(width);
      await legacyContext.addInitScript(data => { if (!localStorage.getItem('courier-finance-v1')) localStorage.setItem('courier-finance-v1', JSON.stringify(data)); }, fixture);
      const legacyPage = await legacyContext.newPage(); observe(legacyPage, errors);
      await legacyPage.goto(url); await legacyPage.locator('#summaryHours').waitFor();
      await choosePeriod(legacyPage, period);
      const rawBefore = await saved(legacyPage);
      assert.equal(rawBefore, JSON.stringify(fixture));
      assert.equal(compact(await legacyPage.locator('#summaryHours').innerText()), '28ч');
      assert.equal(await legacyPage.locator('#summaryOrders').innerText(), '36');
      await noChooser(legacyPage);
      await legacyPage.reload(); await legacyPage.locator('#summaryHours').waitFor();
      assert.equal(await saved(legacyPage), rawBefore);
      await choosePeriod(legacyPage, period);
      assert.equal(compact(await legacyPage.locator('#summaryHours').innerText()), '28ч');
      await layout(legacyPage, `automatic old data ${kind} ${width}`);
      if (kind === 'schema1') await legacyPage.screenshot({ path: `${output}/old-data-open-${width}.png`, fullPage: true });
      await edit(legacyPage, period);
      assert.equal(await legacyPage.locator('#tax').inputValue(), '');
      assert.equal(await legacyPage.locator('label[for=dailyHours]').innerText(), 'Часы за слот');
      await legacyPage.locator('#note').fill('Сохранение прежней записи');
      await legacyPage.locator('#saveDay').click(); await legacyPage.locator('#summaryHours').waitFor();
      let converted = JSON.parse(await saved(legacyPage));
      assert.equal(converted.schemaVersion, 6); assert.equal(converted.entries[1].tax, 177);
      assert.equal(converted.entries[1].parkCommission, 177); assert.deepEqual(converted.closures, fixture.closures);
      assert.equal(converted.entries[1].legacyReading.hours, 14);
      await edit(legacyPage, '2026-10-03');
      assert.equal(await legacyPage.locator('#tax').inputValue(), '177');
      assert.equal(await legacyPage.locator('#tax').getAttribute('aria-invalid'), 'false');
      assert.match(await legacyPage.locator('#tax-error').innerText(), /Сумму можно сохранить/);
      await legacyPage.locator('#note').fill('Прежние удержания сохраняются без исправления');
      await legacyPage.locator('#saveDay').click(); await legacyPage.locator('#summaryHours').waitFor();
      const preserved = JSON.parse(await saved(legacyPage)).entries.find(e => e.date === '2026-10-03');
      assert.equal(preserved.tax, 177); assert.equal(preserved.parkCommission, 177);
      await saveDay(legacyPage, { date: '2026-10-04', dailyHours: '7,5', dailyOrders: 18, reward: 500, tax: 20, parkCommission: 20 });
      assert.equal(compact(await legacyPage.locator('#summaryHours').innerText()), '35,5ч');
      assert.equal(await legacyPage.locator('#summaryOrders').innerText(), '54');
      await legacyPage.locator('#history').click(); await noChooser(legacyPage);
      await legacyPage.locator('[data-date="2026-10-02"]').click();
      await legacyPage.locator('#dailyHours').fill('10');
      await legacyPage.locator('#saveDay').click(); await legacyPage.locator('#summaryHours').waitFor();
      assert.equal(compact(await legacyPage.locator('#summaryHours').innerText()), '31,5ч');
      const afterEdit = await saved(legacyPage);
      await legacyPage.reload(); await legacyPage.locator('#summaryHours').waitFor();
      await choosePeriod(legacyPage, period); await noChooser(legacyPage);
      assert.equal(compact(await legacyPage.locator('#summaryHours').innerText()), '31,5ч');
      assert.equal(await saved(legacyPage), afterEdit);
      converted = JSON.parse(afterEdit);
      assert.equal(converted.entries[0].legacyReading.hours, 14); assert.equal(converted.entries[0].legacyReading.edited, true);
      await legacyContext.close();
    }
    assert.deepEqual(errors, [], `${width}: no browser errors`);
    results.push({ viewport: width, result: 'PASS', scenarios: ['daily-14-plus-14', 'fractions', 'rest-zero', 'backdated-finances', 'edit-replaces-contribution', 'delete-removes-contribution', 'independent-optional-counters', 'period-isolation', 'relaunch', 'tax-4-to-6-and-commission-5-guides', 'warnings-do-not-block', '4000-84-200-save-and-reload', 'format-error-does-not-write', 'reward-edit-refreshes-guides', 'full-paid-reward', 'tips-and-bonuses-separate', 'closure-separate', 'markdown-and-backup', 'import-preview-cancel-and-merge', 'schema1-and-pending-schema2-open-without-choice', 'legacy-finances-preserved', 'legacy-relaunch-no-repeat', 'legacy-new-daily-addition', 'relaunch-preserves-manual-edits', 'layout-and-save-area'] });
    await context.close();
  }

  const oldImportContext = await contextFor(390);
  const oldImportPage = await oldImportContext.newPage();
  await oldImportPage.goto(url); await oldImportPage.locator('#history').click();
  const oldImport = { schemaVersion: 1, closures: {}, entries: [
    { date: '2026-09-20', reward: 0 },
    { date: '2026-09-28', displayedHours: 153, displayedOrders: 300, reward: 1000 },
    { date: '2026-09-30', displayedHours: 179, displayedOrders: 345, reward: 1200 }
  ] };
  await importJSON(oldImportPage, oldImport);
  assert.match(await oldImportPage.locator('#importDescription').innerText(), /Записей в файле: 3; дней: 3/);
  assert.doesNotMatch(await oldImportPage.locator('#importDescription').innerText(), /выбрать|перенос/i);
  await oldImportPage.locator('#confirmImport').click(); await oldImportPage.locator('#periodPicker').waitFor();
  await choosePeriod(oldImportPage, '2026-09-18');
  await noChooser(oldImportPage);
  assert.equal(compact(await oldImportPage.locator('#summaryHours').innerText()), '179ч');
  assert.equal(await oldImportPage.locator('#summaryReserve').innerText(), 'Можно без заказов: 11 ч 41 мин');
  await saveDay(oldImportPage, { date: '2026-10-01', dailyHours: '1,5', dailyOrders: 4, reward: 600, tax: 24 });
  assert.equal(compact(await oldImportPage.locator('#summaryHours').innerText()), '180,5ч');
  assert.equal(await oldImportPage.locator('#summaryOrders').innerText(), '349');
  await oldImportPage.locator('#history').click();
  await importJSON(oldImportPage, { schemaVersion: 1, entries: [{ date: '2026-09-28', displayedHours: 160, displayedOrders: 310, reward: 1000 }], closures: {} });
  await oldImportPage.locator('#confirmImport').click(); await oldImportPage.locator('#periodPicker').waitFor();
  await choosePeriod(oldImportPage, '2026-09-18');
  assert.equal(compact(await oldImportPage.locator('#summaryHours').innerText()), '180,5ч');
  assert.equal(await oldImportPage.locator('#summaryOrders').innerText(), '349');
  assert.equal(JSON.parse(await saved(oldImportPage)).entries.find(e => e.date === '2026-09-30').dailyHours, 19);
  await noChooser(oldImportPage);
  await oldImportContext.close();
  results.push({ legacyImport: 'PASS', scenarios: ['schema-1-preview', 'automatic-cumulative-intervals', 'partial-import-updates-adjacent-interval', 'old-rounded-minute-reserve', 'new-daily-addition'] });

  const nativeContext = await contextFor(360);
  await nativeContext.addInitScript(data => {
    window.nativeCalls = []; window.nativeWriteCount = 0; window.nativeWriteAllowed = false;
    window.CourierNative = {
      ready: () => { window.nativeReady = true; },
      readState: () => localStorage.getItem('native-test-state') || JSON.stringify(data),
      writeState: text => { window.nativeWriteCount++; if (!window.nativeWriteAllowed) return false; localStorage.setItem('native-test-state', text); return true; },
      exportFile: (...args) => window.nativeCalls.push(args),
      importData: () => { window.nativeImportCalled = true; }
    };
  }, legacyData);
  const nativePage = await nativeContext.newPage();
  await nativePage.goto(url); await nativePage.locator('#summaryHours').waitFor();
  assert.equal(await nativePage.evaluate(() => window.nativeReady), true);
  await choosePeriod(nativePage, period);
  assert.equal(compact(await nativePage.locator('#summaryHours').innerText()), '28ч');
  await noChooser(nativePage);
  assert.equal(await nativePage.evaluate(() => window.nativeWriteCount), 0);
  assert.equal(await nativePage.evaluate(() => localStorage.getItem('native-test-state')), null);
  await nativePage.locator('#addDay').click();
  await fill(nativePage, { date: '2026-10-04', dailyHours: 5, dailyOrders: 11, reward: 1000, tax: 40 });
  await nativePage.locator('#saveDay').click();
  assert.match(await nativePage.locator('#formError').innerText(), /Не удалось сохранить/);
  assert.equal(await nativePage.evaluate(() => localStorage.getItem('native-test-state')), null);
  assert.equal(await nativePage.locator('#dailyHours').inputValue(), '5');
  await nativePage.evaluate(() => { window.nativeWriteAllowed = true; });
  await nativePage.locator('#saveDay').click(); await nativePage.locator('#summaryHours').waitFor();
  assert.equal(compact(await nativePage.locator('#summaryHours').innerText()), '33ч');
  assert.equal(await nativePage.evaluate(() => JSON.parse(localStorage.getItem('native-test-state')).schemaVersion), 6);
  await nativePage.reload(); await nativePage.locator('#summaryHours').waitFor();
  await choosePeriod(nativePage, period);
  assert.equal(compact(await nativePage.locator('#summaryHours').innerText()), '33ч');
  await noChooser(nativePage);
  await nativePage.locator('#export').click();
  await nativePage.locator('#shareReport').click(); await nativePage.locator('#saveReport').click(); await nativePage.locator('#backupReport').click();
  const calls = await nativePage.evaluate(() => window.nativeCalls);
  assert.equal(calls.length, 3); assert.equal(calls[0][3], 'share'); assert.equal(calls[1][3], 'save');
  assert.match(calls[0][1], /Часы за период: 33/); assert.equal(JSON.parse(calls[2][1]).schemaVersion, 6);
  await nativePage.locator('#closeExport').click();
  await nativePage.evaluate(() => { window.nativeWriteAllowed = true; });
  await nativePage.locator('#addDay').click();
  await fill(nativePage, { date: '2026-10-05', dailyHours: '2,5', dailyOrders: 5, reward: 330, tax: 177 });
  const bridgeWrites = await nativePage.evaluate(() => window.nativeWriteCount);
  await nativePage.locator('#saveDay').click();
  await nativePage.locator('#summaryHours').waitFor();
  assert.equal(await nativePage.evaluate(() => window.nativeWriteCount), bridgeWrites + 1);
  assert.equal(await nativePage.evaluate(() => JSON.parse(localStorage.getItem('native-test-state')).entries.find(e => e.date === '2026-10-05').tax), 177);
  await nativePage.locator('#addDay').click();
  await fill(nativePage, { date: '2026-10-06', dailyHours: '2,5', dailyOrders: 5, reward: 4000, tax: 'abc', parkCommission: 200 });
  const writesBeforeFormatError = await nativePage.evaluate(() => window.nativeWriteCount);
  await nativePage.locator('#saveDay').click();
  assert.equal(await nativePage.evaluate(() => window.nativeWriteCount), writesBeforeFormatError);
  assert.match(await nativePage.locator('#formError').innerText(), /Налог:/);
  await fill(nativePage, { tax: 84 });
  const nativeBefore = await nativePage.evaluate(() => localStorage.getItem('native-test-state'));
  await nativePage.evaluate(() => { window.nativeWriteAllowed = false; });
  await nativePage.locator('#saveDay').click();
  assert.match(await nativePage.locator('#formError').innerText(), /Не удалось сохранить/);
  assert.equal(await nativePage.locator('#dailyHours').inputValue(), '2,5');
  assert.equal(await nativePage.evaluate(() => localStorage.getItem('native-test-state')), nativeBefore);
  await nativePage.locator('#goBack').click(); await nativePage.locator('#importData').click();
  assert.equal(await nativePage.evaluate(() => window.nativeImportCalled), true);
  await nativeContext.close();
  results.push({ nativeContract: 'PASS', scenarios: ['ready', 'schema-1-read', 'startup-reads-without-write', 'save-retry-retains-form', 'schema-3-commit', 'durable-schema-3-reload', 'daily-addition', 'share-save-backup', 'warning-amounts-reach-native-save', 'bad-money-format-no-native-call', 'failed-write-preserves-form', 'native-import-call'] });
  await writeFile(`${output}/ui-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
