# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`, draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) to `main`. Keep one work line; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Accepted historical PR heads #1, #4–#9 and #14–#18 are ancestors. Other ahead-only branches remain historical and outside this cleanup line.

## Current implementation
- Active context: 110 lines / 1345 words versus baseline 239 lines / 5,696 words (54.0% fewer lines; 76.4% fewer words). Historical evidence is in [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md).
- `SheetFactNormalizer.normalize` dispatches seven known sheet formats to helpers with existing mappings.
- `validCountModel` delegates row, fit and validation checks without changing its API or acceptance rules. The generated worker bundle matches `tools/generate_forecast_worker.py`.
- `normalizeDay` delegates order evidence, pause conflicts and work-window exposure to `reconcileDayOrderEvidence`; reconciliation rules stay unchanged.
- `ensureForecast` delegates snapshot construction and model-list updates. Tests cover immutable MORNING, NOWCAST remaining time, no future leakage and no duplicate model update.
- `dayView` separates fact parsing/validation, preview updates, event binding and saving. Its form HTML is unchanged; active hours stay separate from the reported slot.
- `simpleView` delegates recovery status to `videoRecoveryNote` and forecast DOM updates to `refreshSimpleForecastPreview`. The screen template and prediction rules are unchanged.
- `weekView` delegates its existing plan markup to `weekMarkup`; the moved template is unchanged.
- `calculate` delegates payout eligibility and missing-order/hour reporting to `calculatePaymentConditions`. Thresholds and money calculations are unchanged.

## Verification and limits
- Check CI for the exact PR head before relying on a result; prior SHA checks do not verify later changes. Tests include aggregate-hour controls: 76 orders / 42 hours and 62 orders / 43 hours.
- Android QA smoke is pinned to 1.7.11. Transfer-upgrade automation uses a test signer; owner-signed production upgrade is not confirmed.
- No local Git checkout is available, so local `git status` and `git diff --check` cannot run. No production APK is produced by this cleanup.

## Next cleanup target
- Review `normalizeForecast` (last measured CC 51) for a separable normalization responsibility, preserving saved facts and import/migration rules.
