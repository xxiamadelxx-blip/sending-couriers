# Courier Finance: SHIFT CONTROL visual system

25 October 2026. Genuine redesign of the *installed native Android WebView UI* on branch `ui/audit-issue-3`, not a picture/mockup. Deliberate user override of the older warm-white/teal DESIGN_HANDOFF palette.

## Visual audit of directions

Better Design catalog was used to compare **Sonic Punchy** (sharp, red-orange, black) and **Instrument** (dense industrial gold controls); also considered a warm paper-ledger alternative. Chosen **SHIFT CONTROL**: a restrained courier dispatch instrument, with black-charcoal instruments and signal orange/gold, typography at two extreme scales (hard uppercase micro-labels; giant tabular financial figures), 3px machined corners and thin printed measurement rules.

This is not a ChatGPT-style rounded card stack. Navigation is a segmented hardware bar, financial total is a single gold slab with hard chamfer, completed pace is a charcoal instrument, premiums read as a ledger, and forecast is a black/amber dashboard with two existing time regulators.

| Role | Dark | Light |
|---|---|---|
| Canvas | #10151a | #eae7de |
| Content ink | #f4f1e9 | #1c252c |
| Main action | #ff7952 | #c74a24 |
| Income highlight | #ffbd57 | #ffbf57 |
| Instrument background | #202b32 | #242d34 |
| Navigation | #0a1014 | #222a30 |

Do not fetch Google Fonts or inject network dependencies: system sans + native monospace. Existing finance model, hours logic, data records, local cache, markup semantics, 5 navigation actions, 2 forecast sliders, and Android NativeBridge remain the same.

## Verification contract

- Same synthetic facts in before/after captures: 9h/18 orders, reported income from local calculations, no invented source values.
- Both Android 35 widths 360/390 dp and themes, empty history, populated summary, forecast, form, settings, 200% font. Inspect screenshots, not only success exit code.
- Confirm 48dp action hitboxes and percentage visible above bottom nav.
- Confirm format and model unit tests; no edits to web/core.mjs, forecast model, persistence or databases.
- UI adjustments after screenshots only for demonstrated defects. Stop cosmetic loops and continue to genuine release blockers.
- A built test APK is not signed with the user's private stable key. Owner-key release must be verified separately.

Source inspiration: https://better-design.com/design-systems/sonic-punchy and https://better-design.com/design-systems/instrument. References are stylistic only, not imported code or font assets.

## Android QA and first visual review

- [CI #40172974543](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40172974543) at `b95532c08312e3172d4da27d59672cee598be89e` built Android and passed model/finance tests, but UI matrix was **FAIL** at `qa/ui_audit_matrix.py:156`: CSS uppercase made the native accessibility tree expose `ТЕМП ПЕРИОДА` instead of the exact previous mixed-case `Темп периода`. Screenshot `home-360-dark.png` confirms the metric itself is present and correctly visible, so this is a case-sensitive test conflict, not a missing value. Fixed QA accepts exactly the mixed/uppercase spellings, still insists on one real node, and independently checks the income heading too.
- First screenshot confirms visibly different real UI: hard 3px charcoal instrument, warm orange line and goal ring, gold income slab, rectangular control pad. Separate screenshot review of additional pages and font 200% is pending a fresh full CI.
- Independent token contrast audit: former light accent `#bd401e` on `#eae7de` has WCAG ratio approximately **4.34:1**, below the 4.5:1 normal-text threshold. Changed only the light accent to `#a93718` and added a source-backed contrast regression. Do not claim device evidence until the new run finishes.
