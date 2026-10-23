# Design QA — «Рабочий ритм», Android 1.3.0

Source visual truth: `design/selected-rhythm-reference.png` (selected option3 with the requested additions).
Implementation: `verification/1.3.0/rhythm-reference-390.png`, `rhythm-reference-360.png`.
Comparison: `verification/1.3.0/rhythm-comparison.png`; focused pace/finance comparison: `rhythm-comparison-focus.png`.
Viewport:390×844 and360×844 CSSpx; screenshots at deviceScaleFactor1. Source853×1844 normalized to390×844 for comparison (less than0.2% aspect adjustment). App-owned content only; no synthesized OS chrome.
State: synthetic69hours/84orders, hourly base24840, recorded reward8400, owed16440, tips0/bonus0. These values are test data and never initialize the production database.

## Findings and iteration history

1. P2: the original implementation placed export under the fixed navigation at390×844. Measured action bottom775.6 versus navigation top771. Fixed vertical gaps, caption lengths, counter wrapping and card spacing, preserving44px action targets. Fresh premium-ui: action bottom762.0 at360 and769.0 at390; navigation top771; horizontal overflowfalse. Both actions are visible. Longer incomplete states and shorter viewports scroll.
2. P2: default `strong` inherited bolder=900, visibly heavier than the target. Fixed explicit weights700 for pace/counter labels and750 for the finance amount. Re-captured and viewed the full and focused comparison with the source in the same image.
3. Independent P2: migrated cumulative intervals crossing12-week boundaries could be mistaken for exact daily hours. Added an explicit note in the premium card and export, including affected IDs; no fabricated time allocation and no change to stored hours. New model and browser regressions pass, including an interval recorded after the cycle end.
4. P3 retained: the stylesheet preserves existing selectors and uses scoped theme overrides. Consolidating these is a later maintenance task; it does not block operation.

## Five fidelity surfaces

- Typography: local Golos Text (OFL), no network font dependency. Main pace and balance remain the largest elements; line heights and explicit weights checked in the focused comparison. Minor glyph differences from ImageGen text are acceptable P3, not a claim of pixel identity.
- Spacing/layout: selected hierarchy and four-tab navigation preserved. Main dates/counters/finance/premiums/actions fit both tested widths at844px height. Existing form scroll remains separate from its save area. Overall income remains available below the overview actions. Functional additions have their own period/settings views.
- Colors/tokens: ink#111f2b, mint#b7e6cc, offwhite#f2f5f1, amber#f6d561 and blue card surfaces match the chosen direction. Solid offline surfaces replace incidental image glow.
- Assets: official Tabler outline icons are bundled with MIT license; Golos has its OFL license. No rasterized UI or invented decorative illustrations. The gauge is an actual canvas data chart with an accessible percentage label.
- Copy/content: correct Russian order pluralization; recorded reward is distinct from base/owed. Both5% premiums are explicit calculated estimates, independent from tips/actual bonus entries. Cycle start config affects only84-day windows. Inactive decorative info/chevrons were omitted; visible premium/navigation controls work.

## Browser verification

Opened the running preview at terminal.local:4173 in the cloud browser, including a390×844 iframe of the actual production assets. Inspected live screenshots and DOM; tested add/save,12-week date save, period view, premium values, navigation and export dialog. Application-origin error logs were empty. Browser-extension metadata warnings were unrelated to application code.

Automated browser evidence: fresh existing UI scenarios at360/390, legacy edit/relaunch, premium date persistence, exact84-day ranges, unchanged fortnight records/closures, report/backup downloads, legacy import retention, atomic conflict rejection and native-write failure retention. Local browser captures above use the same production assets and same displayed69/84 state. Screenshots are internal verification evidence, not user data or deliverables.

## Limits

No Android emulator/physical-device UI run was available. Compiled production NativeBridge execution, APK certificate/alignment and embedded-asset checks are recorded separately. This review makes no WCAG certification, Android hardware, analytics or A/B-testing claim.

## Implementation checklist

- Selected direction implemented across working views:done.
- Both requested premiums and12-week start:done.
- Existing14-day calendar and financial entries preserved:tested.
- ChatGPT diagnostic export and JSON backup:tested.
- Action overlap/weight fixes re-captured and compared:done.
- Independent critic recheck of the cumulative-boundary note:PASS.

final result: passed
