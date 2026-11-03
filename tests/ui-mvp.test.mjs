import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const qa=await readFile(new URL('../qa/ui_audit_matrix.py',import.meta.url),'utf8');
const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');

test('UI M1: slot edit form groups hours and money without discarding any existing field',()=>{
 const section=app.slice(app.indexOf('function form('),app.indexOf('function dayCaption(')>app.indexOf('function form(')?app.indexOf('function dayCaption('):undefined);
 for(const name of ['Время и заказы','Выплата, чаевые и удержания'])assert.ok(section.includes(name));
 for(const key of ['dailyHours','dailyOrders','reward','tax','parkCommission','tips','separateBonus'])assert.match(section,new RegExp("field\\('"+key+"'"));
 assert.match(css,/\.form-section-heading\{grid-column:1\/-1/);
 assert.match(css,/\.form-page \.save-area \.button\.primary\{min-height:55px/);
});
test('Period is a day-entry ledger, with secondary payment/cycle information instead of duplicate Home totals',()=>{
 const section=app.slice(app.indexOf('function periodDetails('),app.indexOf('function settings('));
 assert.ok(section.includes('periodDayMarkup(s.entries,date=>calculateDay(state,date)'));
 assert.ok(section.indexOf('class="period-days"') < section.indexOf('class="period-notice"'), 'Show editable day records before payout conditions');
 assert.ok(section.indexOf('class="period-days"') < section.indexOf('class="detail-card cycle-settings period-cycle-compact"'), 'Cycle settings belong below daily records');
 assert.ok(section.includes('data-entry') || section.includes("querySelectorAll('.period-slot-edit')"));
 assert.doesNotMatch(section,/class="detail-card period-overview"/);
});
test('UI M1: slot history keeps editable ID and complete monetary rows',()=>{
 const section=app.slice(app.indexOf('function history('),app.indexOf('function closure('));
 assert.ok(section.includes('class="day-money"'));
 assert.ok(!section.includes('class="day-money" role="group"'), 'Android must expose each monetary row after transfer upgrade');
 for(const v of ['Выплачено','Чаевые','Отдельные бонусы','Итог на экране'])assert.ok(section.includes(v));
 assert.ok(section.includes('data-entry="${esc(e.id)}"'));
});
test('UI M2: empty-state navigation must wait for rendered home and history, not nav buttons alone',()=>{
 const start=qa.indexOf("if args.phase == 'after' and args.focus == 'full':");
 const finish=qa.indexOf("if args.focus == 'content':",start);
 const section=qa.slice(start,finish);
 assert.match(section,/device\.tap_node\('Главная'\)\s+device\.wait_node\('Смена ещё не записана', 20\)/);
 assert.match(section,/device\.tap_visible_node\('Записи периода'\)\s+device\.wait_node\('Пока нет записей', 20\)/);
 assert.match(section,/device\.wait_home\(30\)\s+device\.wait_node\('Смена ещё не записана', 20\)/);
});

test('UI M2: Android form cancel exercises the real visible Back and checks history/summary',()=>{
 assert.match(qa,/device\.tap_node\('Назад'\)/);
 assert.match(qa,/Canceling the form must restore history with bottom navigation/);
 assert.match(qa,/device\.tap_node\('Главная'\)/);
 assert.doesNotMatch(qa,/device\.adb\('shell', 'input', 'keyevent', '4'\)\s*device\.adb\('shell', 'input', 'keyevent', '4'\)/);
});

test('UI M2: real money uses Cyrillic/ruble-capable system font, not Android monospace tofu',()=>{
  assert.match(css,/#homeDeck \.income-hero \.major-amount,\s*#homeDeck \.home-premiums \.premium-teasers strong,\s*\.day-money \.day-row span:last-child\{[\s\S]*?font-family:system-ui/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});

test('UI M2: native full audit opens and cancels export, scroll-checks all tariff controls',()=>{
 assert.match(qa,/capture\('export-dialog-360-dark'\)/);
 assert.match(qa,/device\.tap_node\('Закрыть'\)/);
 assert.match(qa,/Export modal remained open/);
 for(const term of ['Цель темпа для выплаты','Темп для премии','Минимум часов за период','Критический темп','Премия за темп','Премия за 12 недель']) assert.ok(qa.includes(term));
 assert.match(qa,/Payment setting not reachable by scroll/);
 assert.match(qa,/capture\(f'settings-field-visible-/);
});

test('UI M2: period choice has at least 48dp hitbox in native 360/390 theme matrix',()=>{
 assert.match(css,/GAUNTLET P2 \/ UI-007/);
 assert.match(css,/\.overview-top \.period-button\{min-height:48px\}/);
 assert.match(css,/#app \.period-button \{ min-height:48px;/, 'The final app theme must preserve the period button hitbox');
 assert.match(qa,/Home period button must be at least 48dp tall/);
 assert.match(qa,/pb\[3\]-pb\[1\] >= 144/);
});

test('UI M2: native history return waits for the rendered heading text',()=>{
 assert.ok(app.includes("heading('История')"));
 assert.match(qa,/device\.wait_node\('История', 20\)/);
 assert.doesNotMatch(qa,/device\.wait_node\('ИСТОРИЯ', 20\)/);
});

test('UI M2: settings accessibility audit uses the payment target label shown by the app',()=>{
 assert.ok(app.includes("field('basePace','Цель темпа для выплаты'"));
 assert.ok(qa.includes("device.find_node(root, 'Цель темпа для выплаты')"));
 assert.ok(qa.includes("fields = ('Цель темпа для выплаты', 'Темп для премии'"));
});

test('UI M2: native Android file picker opens and cancel preserves both forecast durations',async()=>{
 const native=await readFile(new URL('../android/src/ru/courier/finance/MainActivity.java',import.meta.url),'utf8');
 assert.match(native,/Intent\.ACTION_OPEN_DOCUMENT/);
 assert.match(native,/if \(resultCode != RESULT_OK \|\| data == null \|\| data\.getData\(\) == null\) return/);
 assert.match(qa,/Native ACTION_OPEN_DOCUMENT picker did not appear/);
 assert.match(qa,/capture\('forecast-import-native-picker-1\.3'\)/);
 assert.match(qa,/capture\('forecast-import-cancelled-1\.3'\)/);
 assert.match(qa,/Canceling native import changed 14h slot or working hours/);
 assert.match(qa,/Canceling import did not restore forecast navigation/);
});

test('UI M2 native 200% font: both time bases are reachable, independently operable and persisted',()=>{
  assert.match(qa,/FORECAST_STEP_MINUTES = 30/);
  for(const action of ['Слот: плюс','Слот: минус',
                       'Из них буду работать: плюс','Из них буду работать: минус']){
    assert.ok(qa.includes(`f'${action} {FORECAST_STEP_MINUTES} минут'`),
      'missing Android 200% interaction: '+action);
  }
  for(const capture of ['font-2.0-slot-plus','font-2.0-active-plus','font-2.0-both-restored']){
    assert.ok(qa.includes(capture),'missing real-device screenshot: '+capture);
  }
  assert.match(forecast,/durationField\('todaySlotHours','Полный слот',slot,'',30\)/);
  assert.match(forecast,/durationField\('todayWorkHours','Из них буду работать',work,'',30\)/);
  assert.match(qa,/assert durations\(current\) == expected/);
  assert.match(qa,/200% action scroll changed planned hours/);
  assert.match(qa,/Thumb drag must use four 30-minute detents/);
  assert.match(qa,/200% round-trip values changed after process death/);
  assert.match(qa,/def scroll_forecast_to_top\(/);
  assert.match(qa,/def scroll_forecast_action_into_view\(label, attempts=8\):/);
  assert.match(qa,/scroll_forecast_action_into_view\(label\)/);
});

test('UI M2: narrow and large-text forecast import actions use one readable column',()=>{
 assert.match(css,/@media\(max-width:380px\)\s*\{[\s\S]*?#app \.forecast-page \.forecast-import-actions\s*\{\s*grid-template-columns:1fr;/);
 assert.match(css,/:root\[data-text-scale="large"\] #app \.forecast-page \.forecast-import-actions\s*\{\s*grid-template-columns:1fr;/);
});

test('UI M2: large text forecast reserves scroll room above the fixed navigation',()=>{
 assert.match(css,/:root\[data-text-scale="large"\] #app \.forecast-page \{ padding-bottom:72px;/);
 assert.match(qa,/action_bounds\[3\] <= nav_bounds\[1\]/);
});

test('MVP Android M2 positive XLSX: full workflow imports same report twice and verifies saved facts',async()=>{
 const ci=await readFile(new URL('../.github/workflows/ui-audit.yml',import.meta.url),'utf8');
 const xlsx=await readFile(new URL('../qa/xlsx_import_smoke.py',import.meta.url),'utf8');
 const runner=await readFile(new URL('../qa/run_ui_gates.py',import.meta.url),'utf8');
 assert.match(ci,/python3 qa\/run_ui_gates\.py --apk/);
 assert.match(runner,/\['python3', 'qa\/xlsx_import_smoke\.py'\]/);
 assert.match(runner,/\['adb', 'shell', 'settings', 'put', 'system', 'font_scale', '1\.0'\]/);
 assert.match(xlsx,/def scroll_to_import\(\):/);
 assert.match(xlsx,/Native XLSX import action not reachable by vertical scroll/);
 assert.match(xlsx,/assert first == second/);
 assert.match(xlsx,/assert_imported\(exported_forecast\(\)\)/);
});
test('200% slider hitbox parsing uses digit regex that matches Android node coordinates',()=>{
 const block=qa.split("if scale == '2.0' and args.phase == 'after'")[1].split("if scale == '1.3' and args.phase == 'after'")[0];
 const expected=String.raw`re.findall(r'\d+',`;
 const wrong=String.raw`re.findall(r'\\d+',`;
 assert.equal(block.split(expected).length-1,2);
 assert.equal(block.split(wrong).length-1,0);
});

test('CI Android runner preserves XLSX and transfer gates with independent exit status',async()=>{
  const ci=await readFile(new URL('../.github/workflows/ui-audit.yml',import.meta.url),'utf8');
  const runner=await readFile(new URL('../qa/run_ui_gates.py',impo