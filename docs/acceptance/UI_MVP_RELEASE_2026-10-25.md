# UI MVP redesign · release acceptance matrix

**Status: IN PROGRESS, NOT RELEASED.** Started 25 October 2026 by explicit user instruction. Branch `ui/audit-issue-3`, PR [#4](https://github.com/xxiamadelxx-blip/sending-couriers/pull/4), issue [#3](https://github.com/xxiamadelxx-blip/sending-couriers/issues/3), Linear YAR-7.

## Non-negotiable scope

A real end-to-end redesign of all Android UI surfaces and interactions, not recoloring home or producing unrelated concept images. Design direction: custom `SHIFT CONTROL` industrial/utility visual language ([visual spec](../VISUAL_DIRECTION_SHIFT_CONTROL.md)); no generic mint conversation cards. Product remains an offline-first courier earnings and forecast app, **not** AI-backed; forecasts can optionally use cached public weather. Do not touch core math/schema/model/worker unless a reproducible bug explicitly requires it. Preserve `ru.courier.finance.transfer` update lineage, historical facts, two time sliders (14h slot/6.5h active example), five bottom destinations, corrections, monetary rounding, empty vs zero and source provenance. No user's personal records are to be copied into QA artifacts.

## Milestones, in order

- **UI-M0 / baseline and design contracts:** scope inventory, reproducible before/after synthetic screens, release blockers logged, references checked, criteria and owner stored in `AGENTS.md`, `README.md`, issue/PR. **PASS** when this file is committed at a known SHA and a baseline red issue linked. Do not claim the later milestones complete.
- **UI-M1 / visual coherence across ALL screens:** main (populated/empty + below-fold finance), forecast (two time sliders + insufficient history), period/bonus cycle/closure, history (one/two slots, edit), form add/edit/delete and keyboard, settings all 8 payment terms + appearance/sound, forecast import/JSON and error/confirmation dialogs, splash/navigation. Layout hierarchy must actually differ from previous build across every screen, with not only different hues but meaningful grouping/density, numerical hierarchy, states. **PASS** only after image pairs and review at both themes and widths; no new visible 'район' or debug mechanism.
- **UI-M2 / interaction, accessibility and persistence:** accessible 48dp interactive targets unless physically impossible/documented with explicit bounds; contrast WCAG normal text >=4.5:1 on actual surface, headings and values not clipped; 1x,1.3x,2x system text; no nav/IME obscuring CTA; both sliders persist and maintain work<=slot; empty-state add opens form, cancel without duplicate; edit/delete/period/forecast/import and invalid/failed save preserve facts. Android 35 360/390 dp both themes, force-stop, activity recreation, process death and true update checked as distinct paths. **PASS** only with fresh evidence and an explicit result per gate, not “screenshot exists.”
- **UI-M3 / release and distribution:** full unit/NativeBridge/build/asset/signature validation at final SHA, signed `ru.courier.finance.transfer` APK with the owner's **same** private signer as installed package, installation/update verifies old synthetic database retained, device QA, APK artifact with hash and versionCode. Only then RELEASE PASS. If owner signer unavailable => **BLOCKED**, never substitute a test key.

## Scenario matrix (per screen state)

| Surface | Functional/visual acceptance | Native evidence required | Status at start |
| --- | --- | --- | --- |
| Main with records | Tempo/rule 18/9=2.000, goal%, 9h,18 orders; income and payout/remainder distinct | 360/390 dark/light top + scrolled, 2x text and XML | FAIL: full newest CI aborted |
| Empty main | Prompt, first-slot CTA, no invented orders/money; cancel leaves empty | 360/390 dark/light | PARTIAL (only 360 dark evidenced) |
| Forecast | Two **visible and working** time controls; 6.5<=14, saves across process death; insufficient history is honest; import visible after scroll | 360/390 dark/light, font 1.3/2, pointer drag vs vertical scroll | FAIL: full latest CI aborted |
| Period | Clear period selection, hours/orders, bonus cycle and alert, history drill-down | 360/390 dark/light | CAPTURED, independent visual review pending |
| History | Date groups, 2 same-date slots, each editable via >=48dp; payments never recomputed from style | 360/390 dark/light | CAPTURED, action review pending |
| Add/edit form | Date, hours, orders, reward, tax, park, tips, bonuses, work-time details grouped; anchored save not occluded by IME; errors accessible; cancel/delete safe | 360/390 dark/light keyboard + edit and readback | FAIL: return-to-home path after form |
| Settings & tariff | date and rate visible; 8 swipe/click payment pages and save; appearance, feedback, sound controls | 360/390 dark/light + page states | PARTIAL (8 conditions not yet independently reviewed) |
| Import/export/closure | import JSON/XLSX entry and review, invalid format/rollback, stable IDs, export and delete/close confirmation | native UI actions + independent data totals | NOT RUN in current matrix |
| Splash/nav/dialogs | coherent theme, no placeholder UI, five actions, safe insets, focus, keyboard, theme switching | Android startup/permissions, screenshot and XML | PARTIAL |
| Accessibility | visible >=48dp, contrast, tap, 200% font; TalkBack semantics | XML bounds plus manual / service QA | PARTIAL; TalkBack NOT RUN |
| Signed update | upgrade installed transfer with preserved key, keep DB | signature hash and installed before/after native log | BLOCKED: key held outside CI |

`CAPTURED` and `PARTIAL` are *not* PASS. All required new-state screenshots have to be reviewed for overlap, baseline alignment, legibility, contrast, text truncation, touch hitbox, stable labels and a real action response. Bounded manual/automated sweep: name at most 3 independent issues per cycle by severity and retest only changed/dependent scenes, then full mandatory gate before release.

## Gauntlet evidence and open defect log

**RED #UI-001 · navigation after form (P1):** [CI #40173464789](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40173464789), SHA `e3b2a6d0f302251da20682a972fda721c69474a0`, JS/model/build PASS but Android QA FAIL at `qa/ui_audit_matrix.py:204` because after keyboard + two system Back events the app is still on *Add slot*, where the bottom nav is intentionally hidden. `ui-after/failure.xml` has `Назад`, `ДОБАВИТЬ СЛОТ`, `Сохранить слот`, but **not** `Главная`. Therefore subsequent navigation by unseen bottom nav is invalid. Fix must explicitly tap visible in-app `Назад` after dismissing IME, and assert restored history + bottom nav, then tap `Главная` and assert loaded summary. Hardware Back handling on Android must remain separately NOT RUN until tested; do not relabel it as PASS.

**Historical RED #UI-002:** at font_scale 2, progress 111% overlapped bottom nav. Fixed at SHA `83917ab...`, test run [#40170606206](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40170606206) PASS on THAT SHA only; final SHA must repeat.

**Historical RED #UI-003:** history edit action 45dp instead of required 48dp. Fixed at SHA `51b82d...`, test run [#40171589251](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40171589251) PASS on THAT SHA only; final SHA must repeat.

**Styling contrast:** first SHIFT CONTROL CI [#40172974543](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40172974543) failed uppercase text assertion; updated QA tests. Light accent token changed and static test added. This did NOT yet produce green full run.

## Source verification

Android Developers, [Make apps more accessible (Views)](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), checked 25.10.2026; document last updated 21.04.2026: touch targets recommended >=48dp; descriptions for actionable controls. Applies to Android guidance, including this native WebView experience where actual targets must be measured. No claim of WCAG certification. Better Design's catalog reference [Sonic Punchy](https://better-design.com/design-systems/sonic-punchy) / [Instrument](https://better-design.com/design-systems/instrument). Mobbin tool was attempted and reported **paid plan required**, so no design evidence from Mobbin is claimed. Prior issue's Yandex Pro official page may be unavailable and stays UNVERIFIED.

## Evidence entry format

`criterion | status | git SHA | platform/API+density+theme+font | test command/exit | screenshot/XML/log/CI artifact URL | independent finding | fix and rerun`.

A successful run on a different SHA is not evidence that this HEAD is releasable. After every code change, mandatory tests and visual comparison; pending owner-key remains BLOCKED regardless of UI quality.

## Gauntlet M1/M2 pass 1, current working SHA pending CI

Scope implementation: period summary now precedes payment warning while retaining all numbers and cycle controls; history gets a receipt-like monetary group and paired large hours/orders; create/edit form groups time/earnings without removing tax, park, tips or bonuses; forecast time controls, settings, splash, dialogs, CTA, errors, empty states, nav remain in the same shared industrial design. `tests/ui-mvp.test.mjs` guards new hierarchy and fields.

Fix for #UI-001: after closing the IME, QA taps visible in-app `Назад`, asserts `История` + available bottom `Главная`, then navigates to summary. The two hardware system Back events previously left the form visible; that behavior is **not** silently renamed success. Separate hardware-back verification remains NOT RUN. New full Android 35 + visual review is required before changing status.
