# Project context

## Canonical line
- One active line: `refactor/deep-cleanup-20261104-recovered`, PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19), base `main`. Keep `main` unchanged until acceptance; do not create parallel work branches.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- At the recorded branch audit, PR heads #1, #4–#9 and #14–#18 were ancestors of this line; only PR #19 was open. Ahead-only feature, design, weather and QA branches were not accepted into the cleanup line. Keep their refs as history; do not merge them without a scoped requirement.

## Current implementation
- Active docs: 108 lines / 1,407 words versus baseline 239 lines / 5,696 words (54.8% fewer lines; 75.3% fewer words). Historical checkpoints are in [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md).
- `SheetFactNormalizer.normalize` dispatches to helpers for seven known sheets; mappings preserve prior field rules.
- `validCountModel` delegates nested row, fit and validation checks to focused helpers without changing its API or acceptance rules. The generated worker bundle matches `tools/generate_forecast_worker.py`.
- `normalizeDay` delegates order evidence, pause conflicts and work-window exposure to `reconcileDayOrderEvidence` (CC 10); its own CC fell 55→46. Forecast tests characterize pause/work conflicts.
- `ensureForecast` delegates snapshot record construction and model-list updates to named helpers. Tests cover immutable MORNING snapshots, NOWCAST remaining time, no future leakage and no duplicate model update.

## Verification and limits
- UI audit #282 on parent `eecf536` and Android QA #128 passed; they are baseline evidence, not checks of later commits. QA #128 used the pinned 1.7.11 smoke APK, so it does not prove an installed 1.7.36 upgrade.
- Forecast tests passed 32/32 on the baseline and candidate for both recent refactors. Current full checks must be read from the exact live PR head.
- The #282 Crapper report had coverage disabled, so CRAP scores were N/A. Highest product CCs before `ensureForecast` extraction were `dayView` 69, `simpleView` 67, `ensureForecast` 57, `weekView` 55 and `calculate` 54; `normalizeDay` was 46 after extraction. Dryer found no duplicate candidates; `calculateScenario` mutation testing killed 28/28.
- This workspace has no local Git checkout. Local repository `git status` and `git diff --check` are unavailable; inspect GitHub commit diffs and run tests in isolated copies.
- CI APKs use a temporary signer and cannot update an installed production app. Owner visual approval remains separate.

## Next cleanup target
- Inspect `dayView` in `web/forecast-ui.mjs` (CC 69): map rendering, event handlers and state changes; add or use regression coverage, preserve output and behavior, then simplify only a clear responsibility boundary.