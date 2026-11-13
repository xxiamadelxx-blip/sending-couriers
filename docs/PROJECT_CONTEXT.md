
# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`, draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) to `main`. Keep one work line; do not merge before acceptance.
- App identity is **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Accepted historical PR heads #1, #4–#9 and #14–#18 are ancestors of this line. Ahead-only product, design, weather and QA branches remain historical and are excluded unless separately scoped.

## Current implementation
- Active context: 108 lines / 1,368 words versus baseline 239 lines / 5,696 words (54.8% fewer lines; 76.0% fewer words). Historical evidence is in [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md).
- `SheetFactNormalizer.normalize` dispatches seven known sheet formats to helpers with prior mappings.
- `validCountModel` delegates row, fit and validation checks without changing its API or acceptance rules. The generated worker bundle matches `tools/generate_forecast_worker.py`.
- `normalizeDay` delegates order evidence, pause conflicts and work-window exposure to `reconcileDayOrderEvidence` (CC 10); its CC fell 55→46.
- `ensureForecast` delegates snapshot construction and model-list updates. Forecast tests cover immutable MORNING, NOWCAST remaining time, no future leakage and no duplicate model update.
- `dayView` in `web/forecast-ui.mjs` separates form parsing/validation, preview updates, event binding and saving. The form HTML template is byte-identical to its parent revision; total hours remain distinct from the reported slot.

## Verification and limits
- On PR head `6c3b88c750c55c31bb6c0444258c23418a2d0325`, UI audit #285 passed: `npm test`, quality checks and Android 35 UI gates all succeeded. Current Crapper: `dayView` CC 32, `readDayFactInput` 34, `bindDayFactForm` 1, `simpleView` 67, `weekView` 55, `calculate` 54. Coverage was disabled, so CRAP scores are N/A; Dryer found no duplicate candidates; Mutator killed 28/28 `calculateScenario` mutations.
- Android emulator QA #131 passed on the same PR head: repeat XLSX import was idempotent, and financial/forecast data survived uninstall/reinstall. Its pinned smoke app is 1.7.11. UI audit #285 also passed the synthetic 1.7.35-to-current transfer upgrade with a temporary test signer; this does not prove an update signed with the owner's production key.
- The workspace has no local Git checkout. Local `git status` and repository `git diff --check` are unavailable. UI owner approval remains separate.

## Next cleanup target
- Inspect `simpleView` (Crapper CC 67), identify one cohesive responsibility boundary, preserve its markup and autosave/import behavior, and verify it on the same branch.