import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright-core`);
const root = fileURLToPath(new URL('../web/', import.meta.url));
const output = fileURLToPath(new URL('../verification/1.6.1/', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname.replace(/^\/$/, '/index.html'));
    if (!path.startsWith(root)) throw new Error();
    res.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.mjs': 'application/javascript' }[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const compact = text => text.replace(/\s/g, '');
const results = [];
try {
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      if (localStorage.getItem('courier-finance-v1')) return;
      localStorage.setItem('courier-finance-v1', JSON.stringify({ schemaVersion: 1, closures: {}, entries: [
        { date: '2026-09-18', displayedHours: 153, displayedOrders: 300, reward: 1000, tax: 40, parkCommission: 40 },
        { date: '2026-09-30', displayedHours: 179, displayedOrders: 345, reward: 1200, tax: 48, parkCommission: 48 }
      ] }));
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#history').click(); await page.locator('#periodPicker').selectOption('2026-09-18');
    assert.equal(await page.locator('#chooseLegacy, #reinterpretLegacy').count(), 0);
    await page.locator('#goBack').click();
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '179ч');
    await page.locator('#history').click(); await page.locator('[data-date="2026-09-18"]').click();
    assert.equal(await page.locator('label[for=dailyHours]').innerText(), 'Часы за интервал');
    assert.match(await page.locator('.optional-reading').innerText(), /с начала периода.*Часы отдельных дней неизвестны/);
    assert.equal(await page.locator('#dailyHours').inputValue(), '153');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/legacy-edit-${width}.png`, fullPage: true });
    await page.locator('#note').fill('Уточнение заметки без изменения часов');
    await page.locator('#saveDay').click(); await page.locator('#summaryHours').waitFor();
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '179ч');
    await page.locator('#history').click(); await page.locator('[data-date="2026-09-30"]').click();
    assert.equal(await page.locator('#dailyHours').inputValue(), '26');
    await page.locator('#dailyHours').fill('14'); await page.locator('#saveDay').click();
    await page.locator('#summaryHours').waitFor();
    assert.equal(compact(await page.locator('#summaryHours').innerText()), '167ч');
    await page.reload(); await page.locator('#history').click(); await page.locator('#periodPicker').selectOption('2026-09-18');
    await page.locator('[data-date="2026-09-30"]').click();
    assert.equal(await page.locator('label[for=dailyHours]').innerText(), 'Часы за слот');
    assert.equal(await page.locator('#dailyHours').inputValue(), '14');
    assert.deepEqual(errors, []);
    results.push({ viewport: width, result: 'PASS', scenarios: ['initial-cumulative-contribution-clearly-labeled', 'financial-edit-preserves-hours', 'manual-time-edit-replaces-contribution', 'relaunch-keeps-manual-correction'] });
    await context.close();
  }
  await writeFile(`${output}/legacy-edit-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
