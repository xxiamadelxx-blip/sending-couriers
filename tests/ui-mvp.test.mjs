import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
const qa=await readFile(new URL('../qa/ui_audit_matrix.py',import.meta.url),'utf8');

test('UI M1: slot edit form groups hours and money without discarding any existing field',()=>{
 const section=app.slice(app.indexOf('function form('),app.indexOf('function dayCaption(')>app.indexOf('function form(')?app.indexOf('function dayCaption('):undefined);
 for(const name of ['Время и заказы','Начисления и удержания'])assert.ok(section.includes(name));
 for(const key of ['dailyHours','dailyOrders','reward','tax','parkCommission','tips','separateBonus'])assert.match(section,new RegExp("field\\('"+key+"'"));
 assert.match(css,/\.form-section-heading\{grid-column:1\/-1/);
 assert.match(css,/\.form-page \.save-area \.button\.primary\{min-height:55px/);
});
test('UI M1: period states facts before payment warnings and 12-week controls',()=>{
 const section=app.slice(app.indexOf('function periodDetails('),app.indexOf('function previewCycle('));
 assert.ok(section.indexOf('class="detail-card period-overview"')<section.indexOf('paymentStatus(s)'));
 assert.ok(section.indexOf('paymentStatus(s)')<section.indexOf('class="detail-card cycle-settings"'));
});
test('UI M1: slot history keeps editable ID and complete monetary rows',()=>{
 const section=app.slice(app.indexOf('function history('),app.indexOf('function closure('));
 assert.ok(section.includes('class="day-money"'));
 assert.ok(!section.includes('class="day-money" role="group"'), 'Android must expose each monetary row after transfer upgrade');
 for(const v of ['Вознаграждение','Чаевые','Отдельные бонусы','Итог на экране'])assert.ok(section.includes(v));
 assert.ok(section.includes('data-entry="${esc(e.id)}"'));
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
 for(const term of ['Темп для оплаты','Темп для премии','Минимум часов за период','Критический темп','Премия за темп','Премия за 12 недель']) assert.ok(qa.includes(term));
 assert.match(qa,/Payment setting not reachable by scroll/);
 assert.match(qa,/capture\(f'settings-field-visible-/);
});

test('UI M2: period choice has at least 48dp hitbox in native 360/390 theme matrix',()=>{
 assert.match(css,/GAUNTLET P2 \/ UI-007/);
 assert.match(css,/\.overview-top \.period-button\{min-height:48px\}/);
 assert.match(qa,/Home period button must be at least 48dp tall/);
 assert.match(qa,/pb\[3\]-pb\[1\] >= 144/);
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
  for(const action of ['Слот: плюс 15 минут','Слот: минус 15 минут',
                       'Из них буду работать: плюс 15 минут','Из них буду работать: минус 15 минут']){
    assert.ok(qa.includes(action),'missing Android 200% interaction: '+action);
  }
  for(const capture of ['font-2.0-slot-plus','font-2.0-active-plus','font-2.0-both-restored']){
    assert.ok(qa.includes(capture),'missing real-device screenshot: '+capture);
  }
  assert.match(qa,/durations\(after_slot_plus\) == \[14\.25, 8\]/);
  assert.match(qa,/durations\(after_active_plus\) == \[14, 8\.25\]/);
  assert.match(qa,/200% round-trip values changed after process death/);
  assert.match(qa,/bb\[3\] <= nav_box\[1\]/);
});

test('MVP Android M2 positive XLSX: full workflow imports same report twice and verifies saved facts',async()=>{
 const ci=await readFile(new URL('../.github/workflows/ui-audit.yml',import.meta.url),'utf8');
 const xlsx=await readFile(new URL('../qa/xlsx_import_smoke.py',import.meta.url),'utf8');
 assert.match(ci,/python3 qa\/xlsx_import_smoke\.py/);
 assert.match(ci,/adb shell settings put system font_scale 1\.0/);
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

test('CI Android runner executes XLSX gate in a single shell invocation',async()=>{
  const ci=await readFile(new URL('../.github/workflows/ui-audit.yml',import.meta.url),'utf8');
  assert.match(ci,/\[ "\$\{\{ inputs\.focus \|\| 'full' \}\}" != "full" \] \|\| \( adb shell wm size/);
  assert.doesNotMatch(ci,/^\s+if \[ "\$\{\{ inputs\.focus \|\| 'full' \}\}" = "full" \]; then/m);
  assert.match(ci,/&& python3 qa\/xlsx_import_smoke\.py \)/);
});
