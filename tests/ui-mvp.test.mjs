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
 for(const v of ['Вознаграждение','Чаевые','Отдельные бонусы','Итог на экране'])assert.ok(section.includes(v));
 assert.ok(section.includes('data-entry="${esc(e.id)}"'));
});
test('UI M2: empty-state navigation must wait for rendered home and history, not nav buttons alone',()=>{
 const start=qa.indexOf("if args.phase == 'after' and args.focus == 'full':");
 const finish=qa.indexOf("if args.focus == 'content':",start);
 const section=qa.slice(start,finish);
 assert.match(section,/device\.tap_node\('Главная'\)\s+device\.wait_node\('Смена ещё не записана', 20\)/);
 assert.match(section,/device\.tap_node\('Записи периода'\)\s+device\.wait_node\('Пока нет записей', 20\)/);
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
  const runner=await readFile(new URL('../qa/run_ui_gates.py',import.meta.url),'utf8');
  assert.match(ci,/python3 qa\/run_ui_gates\.py --apk/);
  assert.match(runner,/'xlsx_import': \[/);
  assert.match(runner,/\['python3', 'qa\/xlsx_import_smoke\.py'\]/);
  assert.match(runner,/for name in names\[1:-1\]:\s*run\(name, skip=focus != 'full', blocked=not baseline_ok\)/);
  assert.match(runner,/run\('transfer_upgrade'\)/);
  assert.match(runner,/'status': 'PASS' if exit_code == 0 else 'FAIL'/);
  assert.match(runner,/return 0 if json\.loads\(output\.read_text\(\)\)\['result'\] == 'PASS' else 1/);
});

test('release: transfer build has increasing 1.7.15/code29 and tests prior 1.7.14/code28',async()=>{
 const manifest=await readFile(new URL('../android/AndroidManifest.xml',import.meta.url),'utf8');
 const core=await readFile(new URL('../web/core.mjs',import.meta.url),'utf8');
 const build=await readFile(new URL('../build.py',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/ui-audit.yml',import.meta.url),'utf8');
 assert.match(manifest,/android:versionCode="29" android:versionName="1\.7\.15"/);
 assert.match(core,/export const APP_VERSION = '1\.7\.15';/);
 assert.match(build,/Courier-Finance-1\.7\.15\.apk/);
 assert.ok(workflow.includes("name='ru.courier.finance.transfer' versionCode='29' versionName='1.7.15'"));
 assert.ok(workflow.includes("name='ru.courier.finance.transfer' versionCode='28' versionName='1.7.14'"));
 assert.ok(workflow.includes('git archive 4f295c0eefd9d6fb4e2b0652297f93cbee915d08'));
});

test('UI-013 full 200% label remains visible after opening IME, not just input and Save',async()=>{
 const f=await readFile(new URL('../qa/form_large_text_smoke.py',import.meta.url),'utf8');
 assert.match(css,/:root\[data-text-scale="large"\] \.form-page \.form-grid \.field input\{\s*scroll-margin-block-start:42px;/);
 assert.match(f,/assert focused_field_completely_visible\(root, label\)/);
 assert.match(f,/IME-label-fully-visible/);
});

test('UI-013: 200% native form focus repositions whole label after IME resize',()=>{
 assert.match(app,/function installLargeTextFormLabelFocusGuard\(\)/);
 assert.match(app,/const offset = keyboardOpen \? Math\.min\(missing, room\) : 0;/);
 assert.match(app,/scroll\.style\.paddingTop = offset > 0 \?/);
 assert.match(app,/scroll\.scrollTop = Math\.max\(0, scroll\.scrollTop - offset\)/);
 assert.match(app,/window\.visualViewport\?\.addEventListener\('resize', schedule\)/);
 assert.match(app,/scroll\.addEventListener\('focusin', schedule\)/);
 assert.match(app,/installLargeTextFormLabelFocusGuard\(\);/);
});

test('UI-014: all input templates provide escaped explicit Android-accessible field names', async()=>{
 const duration=await readFile(new URL('../web/duration-control.mjs',import.meta.url),'utf8');
 const forecast=await readFile(new URL('../web/forecast-ui.mjs',import.meta.url),'utf8');
 assert.ok(app.includes('type="text" aria-label="${esc(label)}" inputmode='), 'slot and tariff text inputs missing label');
 assert.ok(duration.includes('type="text" aria-label="${esc(label)}" inputmode='), 'forecast duration input missing label');
 assert.ok(forecast.includes('type="${type}" aria-label="${esc(label)}" value='), 'forecast history input missing label');
});

test('Period day totals use independent calculateDay facts, not forecast or Home gross earnings',()=>{
 const section=app.slice(app.indexOf('function periodDetails('),app.indexOf('function settings('));
 assert.match(section,/periodDayMarkup\(s\.entries,date=>calculateDay\(state,date\)/);
 assert.doesNotMatch(section,/money\(s\.grossUserIncome\)/);
 assert.doesNotMatch(section,/id="periodReward"/);
 assert.match(section,/querySelectorAll\('\.period-slot-edit'\)/);
 assert.match(section,/form\(button\.dataset\.entry,'period'\)/);
});
test('approved History: day reward plus full per-slot fields and separate edit by stable id',()=>{
 const section=app.slice(app.indexOf('function history('),app.indexOf('function closure('));
 assert.match(section,/class="day-summary"/);
 assert.match(section,/class="day-summary-reward"/);
 assert.match(section,/money\(d\.paidReward\)/);
 for(const label of ['Вознаграждение','Чаевые','Отдельные бонусы','Итог на экране','Отработано','Заказов']) {
   assert.ok(section.includes(label), 'missing existing entry field or label: '+label);
 }
 assert.ok(section.includes('data-entry="${esc(e.id)}"'));
 assert.ok(section.includes("d.entries.map((e, i) => card(e, `Слот ${i + 1}`)"));
});

test('Period secondary 12-week tracker shows gross-income and 5% premium separately from paid amounts',()=>{
 const section=app.slice(app.indexOf('function periodDetails('),app.indexOf('function settings('));
 assert.ok(section.indexOf('class="period-days"') < section.indexOf('class="cycle-bonus-metrics"'));
 for(const name of ['Общий доход цикла','cycleTotalIncome','cyclePremium','Расчётная премия, выплата не подтверждена']) assert.ok(section.includes(name),name);
 assert.match(css,/\.period-page \.period-cycle-compact #cyclePremium\{color:var\(--teal\)\}/);
});

test('Period cycle settings offer saved gross opening amount and ChatGPT JSON import with date cutoff',()=>{
 const p=app.slice(app.indexOf('function periodDetails()'),app.indexOf('function settings()'));
 for(const token of ['cycleOpeningGross','cycleOpeningThrough','importCycleReport','Сохранить накопленный доход','cycleOpeningInput()'])assert.ok(p.includes(token),token);
 assert.ok(p.indexOf('class="period-days"') < p.indexOf('cycle-opening-fields'));
});

test('Add Slot form uses accessible in-app work-mode choice rather than Android system select',()=>{
 const page=app.slice(app.indexOf('function form('),app.indexOf('function dayCaption(')>app.indexOf('function form(')?app.indexOf('function dayCaption('):undefined);
 assert.doesNotMatch(page,/<select id="slotWorkMode"/,'native Android selector must not open a system popup');
 for(const s of ['id="slotWorkModeButton"','id="slotModeOptions"','role="radiogroup"','data-slot-mode="${key}"',"['unknown','Не указывать']","['intervals','Интервалы С—До']","['total','Итого за день']","['rest','Выходной']"])
   assert.ok(page.includes(s),s);
 assert.ok(page.includes("$('#slotWorkMode').value=mode"),'real mode state is retained for save');
 assert.ok(page.includes('workingDirty=true'),'mode changes must be tracked as user edits');
});
test('Add Slot form has aligned responsive money fields and no dash placeholders',()=>{
 const page=app.slice(app.indexOf('function form('),app.indexOf('function dayCaption(')>app.indexOf('function form(')?app.indexOf('function dayCaption('):undefined);
 assert.doesNotMatch(page,/input\.placeholder = '—'/,'empty numeric inputs must remain empty without visual dashes');
 assert.match(page,/input\.placeholder = 'Введите'/);
 assert.match(css,/\.form-page \.field-box\{[^}]*min-height:54px/);
 assert.match(css,/\.form-page \.form-grid\{[^}]*align-items:start/);
 assert.match(css,/\.form-page \.slot-mode-options \[role="radio"\]/);
});
