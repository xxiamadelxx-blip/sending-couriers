# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`, draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) to `main`. Keep one work line; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Accepted historical PR heads #1, #4–#9 and #14–#18 are ancestors. Ahead-only product, design, weather and QA branches remain historical, outside this cleanup scope.

## Current implementation
- Active context: 109 lines / 1,356 words versus baseline 239 lines / 5,696 words (54.4% fewer lines; 76.5% fewer words). Historical evidence is in [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md).
- `SheetFactNormalizer.normalize` dispatches seven known sheet formats to helpers with existing mappings.
- `validCountModel` delegates row, fit and validation checks without changing its API or acceptance rules. The generated worker bundle matches `tools/generate_forecast_worker.py`.
- `normalizeDay` delegates order evidence, pause conflicts and work-window exposure to `reconcileDayOrderEvidence` (CC 10); its CC fell 55→46.
- `ensureForecast` delegates snapshot construction and model-list updates. Tests cover immutable MORNING, NOWCAST remaining time, no future leakage and no duplicate model update.
- `dayView` separates fact parsing/validation, preview updates, event binding and saving. Its form HTML is unchanged; active hours remain separate from the reported slot.
- `simpleView` delegates saved-video recovery status text to `videoRecoveryNote`; the receipt markup is unchanged.

## Verification and limits
- Runtime SHA `6c3b88c750c55c31bb6c0444258c23418a2d0325` passed UI audit #285, including Android 35 UI gates and code quality. Crapper: `dayView` CC 32, `readDayFactInput` 34, `bindDayFactForm` 1; prior `simpleView` CC 67. Coverage disabled, so CRAP N/A; Dryer found no duplicate candidates; Mutator killed 28/28 `calculateScenario` mutations.
- Android emulator QA #132 passed on prior runtime SHA (before `videoRecoveryNote` extraction): XLSX re-import was idempotent and finance/forecast data survived reinstall. The exact current source check is pending.
- QA smoke app is pinned to 1.7.11. UI audit synthetic transfer upgrade uses a temporary test signer and does not confirm owner-signed production upgrade.
- No local Git checkout is available; local `git status` and repository `git diff --check` cannot run. Owner visual approval remains separate.

## Next cleanup target
- Finish exact-SHA checks for `videoRecoveryNote`; then use the current Crapper report to choose the next highest-risk responsibility, keeping changes on this branch.
