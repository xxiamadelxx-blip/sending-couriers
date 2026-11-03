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
test('UI M2: long Settings form scrolls to and activates its Save control',()=>{
 assert.match(qa,/for field_index, label in enumerate\(fields\):[\s\S]*?device\.tap_visible_node\('Сохранить условия'\)/);
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
  for(const action of ['Полный слот: плюс','Полный слот: минус',
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
 assert.match(css,/#app\.settings-page \.payment-settings form\s*\{\s*display:grid;\s*gap:16px;/);
 assert.match(css,/#app\.settings-page \.payment-more>summary::after\s*\{\s*content:"";/,'decorative chevron must not become part of the summary accessible name');
 assert.match(css,/#app\.forecast-page \.forecast-import-actions\s*\{\s*display:grid;\s*grid-template-columns:1fr;/);
 assert.match(css,/@media\(max-width:380px\)\s*\{[\s\S]*?#app\.forecast-page \.forecast-import-actions\s*\{\s*grid-template-columns:1fr;/);
 assert.match(css,/@media\(max-width:420px\)\s*\{\s*#app\.forecast-page \.forecast-import-actions\s*\{\s*grid-template-columns:1fr;/);
 assert.match(css,/:root\[data-text-scale="large"\] #app\.forecast-page \.forecast-import-actions\s*\{\s*grid-template-columns:1fr;/);
});

test('UI M2: forecast step buttons retain 48dp targets after page styles apply',()=>{
 assert.match(css,/#app\.forecast-page \.duration-track\s*\{[^}]*grid-template-columns:48px minmax\(0,1fr\) 48px;/);
 assert.match(css,/#app\.forecast-page \.duration-track button\s*\{[^}]*width:48px; height:48px; min-height:48px;/);
});
test('UI M2: sliders and header controls retain 48dp targets after page styles apply',()=>{
 assert.match(css,/#app \.back,#app \.export-icon,#app \.theme-toggle,#app \.period-arrow \{ width:48px; height:48px; min-width:48px; min-height:48px;/);
 assert.match(css,/#app\.forecast-page \.duration-slider \{ width:100%; height:48px; min-height:48px;/);
});
test('UI M2: large-text form keeps the focused label visible without relying on IME resize detection',()=>{
 const start=app.indexOf('function installLargeTextFormLabelFocusGuard()');
 const end=app.indexOf('function form(',start);
 const guard=app.slice(start,end);
 assert.match(guard,/const offset = Math\.min\(missing, room\)/);
 assert.match(guard,/if \(!label\) \{\s*scroll\.style\.paddingTop = ''/);
 assert.match(guard,/if \(offset > 0\) \{\s*scroll\.style\.paddingTop = `\$\{offset\}px`/);
 assert.match(guard,/scroll\.addEventListener\('focusout', reset\)/);
 assert.match(guard,/settleTimer = setTimeout\(align, 420\)/);
 assert.match(guard,/if \(offset > 0\) \{[\s\S]*?scroll\.scrollTop = Math\.max\(0, scroll\.scrollTop - offset\)/);
});

test('Android smoke returns from XLSX picker and verifies saved facts and current payout label',async()=>{
 const xlsx=await readFile(new URL('../qa/xlsx_import_smoke.py',import.meta.url),'utf8');
 const form=await readFile(new URL('../qa/form_large_text_smoke.py',import.meta.url),'utf8');
 assert.match(xlsx,/wait_node\("Прогноз", 20\)/);
 assert.match(xlsx,/assert_imported\(exported_forecast\(\)\)/);
 assert.doesNotMatch(xlsx,/История загружена: 1 день/);
 assert.ok(form.includes("LABELS = ('Часы за слот', 'Заказы за слот', 'Выплачено'"), 'Large-text smoke must use the current payout field label');
 assert.doesNotMatch(form,/Вознаграждение/);
});


test('UI M2: large text forecast reserves scroll room above the fixed navigation',()=>{
 assert.match(css,/:root\[data-text-scale="large"\] #app\.forecast-page \{ padding-bottom:72px;/);
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
 assert.equal(block.split(expected).length-1,4);
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

test('release: transfer build and manifest agree on 1.7.27/code41 and keep the 1.7.14/code28 upgrade path',async()=>{
 const manifest=await readFile(new URL('../android/AndroidManifest.xml',import.meta.url),'utf8');
 const core=await readFile(new URL('../web/core.mjs',import.meta.url),'utf8');
 const build=await readFile(new URL('../build.py',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/ui-audit.yml',import.meta.url),'utf8');
 assert.match(manifest,/android:versionCode="41" android:versionName="1\.7\.27"/);
 assert.match(core,/export const APP_VERSION = '1\.7\.27';/);
 assert.match(build,/Courier-Finance-1\.7\.27\.apk/);
 assert.ok(workflow.includes("name='ru.courier.finance.transfer' versionCode='41' versionName='1.7.27'"));
 assert.ok(workflow.includes("name='ru.courier.finance.transfer' versionCode='28' versionName='1.7.14'"));
 assert.ok(workflow.includes('git archive 4f295c0eefd9d6fb4e2b0652297f93cbee915d08'));
});

test('UI-013 full 200% label remains visible after opening IME, not just input and Save',async()=>{
 const f=await readFile(new URL('../qa/form_large_text_smoke.py',import.meta.url),'utf8');
 assert.match(css,/:root\[data-text-scale="large"\] \.form-page \.form-grid \.field input\{\s*scroll-margin-block-start:42px;/);
 assert.match(f,/root = wait_for_keyboard_layout\(label, mode\)/);
 assert.match(f,/now - keyboard_open_at >= \.65[\s\S]*?now - stable_since >= \.5/);
 assert.match(f,/assert focused_field_completely_visible\(root, label\)/);
 assert.match(f,/IME-label-fully-visible/);
});

test('UI-013: 200% native form focus repositions whole label after viewport changes',()=>{
 assert.match(app,/function installLargeTextFormLabelFocusGuard\(\)/);
 assert.match(app,/const offset = Math\.min\(missing, room\);/);
 assert.match(app,/scroll\.addEventListener\('focusout', reset\)/);
 assert.match(app,/settleTimer = setTimeout\(align, 420\)/);
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
 // Period edit listeners are delegated in the module's final render setup,
 // outside periodDetails() and the section slice above.
 assert.match(app,/querySelectorAll\('\.period-slot-edit'\)/);
 assert.match(app,/form\(button\.dataset\.entry,'period'\)/);
});
test('approved History: day reward plus full per-slot fields and separate edit by stable id',()=>{
 const section=app.slice(app.indexOf('function history('),app.indexOf('function closure('));
 assert.match(section,/class="day-summary"/);
 assert.match(section,/class="day-summary-reward"/);
 assert.match(section,/money\(d\.paidReward\)/);
 for(const label of ['Выплачено','Чаевые','Отдельные бонусы','Итог на экране','Отработано','Заказов']) {
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
 assert.ok(page.includes('id="slotWorkMode" type="hidden" value="${mode}"'),'the mode is tracked as a real form control for save');
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

