# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`, draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) to `main`. Keep one work line; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Accepted historical PR heads #1, #4–#9 and #14–#18 are ancestors. Other ahead-only branches remain historical and outside this cleanup line.

## Current implementation
- A prior checkpoint reported active-context reduction from 239 lines / 5,696 words to 113 / 1,391. That baseline cannot be reproduced from the tracked files available in this checkout, so the percentage is unverified; see [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md) for the historical claim.
- `SheetFactNormalizer.normalize` dispatches seven known sheet formats to helpers with existing mappings.
- `validCountModel` delegates row, fit and validation checks without changing its API or acceptance rules. The generated worker bundle matches `tools/generate_forecast_worker.py`.
- `normalizeForecast` delegates archive lists to `normalizeForecastArchive`; limits, field validation and duplicate rejection stay unchanged.
- `resolveFinancialDay` delegates current-day remaining-window estimation to `forecastRemainingToday`; full planned working and accounted minutes remain separate.
- `countForecast` delegates per-window order allocation to `allocateForecastIntervals`; cumulative rounding still sums to the daily central forecast.
- `CourierDatabase.mirrorWorkbook` delegates row archival, normalized fact mapping and revision checks to focused helpers. The XLSX hash, idempotency, source parity, transaction and promotion rules stay in the existing method flow.
- `accuracyView` delegates the existing metrics, evaluations, archived accuracy and model-version sections to named markup helpers; their order, labels and HTML stay unchanged.
- `normalizeDay` preserves its validation order while delegating interval conflicts, day facts, source metadata and derived time exposure to focused helpers; order reconciliation rules stay unchanged.
- `ensureForecast` delegates snapshot construction and model-list updates. Tests cover immutable MORNING, NOWCAST remaining time, no future leakage and no duplicate model update.
- `dayView` separates fact parsing/validation, preview updates, event binding and saving. Its form HTML is unchanged; active hours stay separate from the reported slot.
- `simpleView` delegates recovery status to `videoRecoveryNote` and forecast DOM updates to `refreshSimpleForecastPreview`. The screen template and prediction rules are unchanged.
- `weekView` delegates its existing plan markup to `weekMarkup`; the moved template is unchanged.
- `calculate` delegates payout eligibility and missing-order/hour reporting to `calculatePaymentConditions`. Thresholds and money calculations are unchanged.
- `mergeVideoSlotDay` delegates preservation of manually confirmed day facts and video evidence status to focused helpers. Regression coverage confirms the payment-hour denominator and confirmed facts survive import.

## Verification and limits
- Latest completed refactor before the current UI fix: `a7d5cf6baeff254e355f557b13fcbf5ea9600554` on the canonical branch. Local checks then: `npm test` 258/258 passed; Python suite 91/91 passed; `git diff --check` passed; differential check against the parent preserved exact serialized day objects in two import scenarios.
- Complexity tools ran on the parent and source at b78: `mergeVideoSlotDay` fell from CC 50 to CC 24; the next target was `normalizeDay` at CC 46. This responsibility split is under verification and does not by itself claim lower total project complexity.
- At exact SHA `b78daba2924cfd2bb1d87f0ae0f223aa524b6084`, code-quality/mutation checks, Android emulator QA #167 and all six UI audit gates #321 passed. The transfer-upgrade gate installed the updated test-signed package and its passing script verifies one persisted slot with 4 hours, 8 orders and 1,200 ₽ after backup export. Local checks at that SHA: `npm test` 259/259, Python 99/99, focused harness tests 12/12, `py_compile` and `git diff --check` pass. Before the current `normalizeDay` split, replay at b78 reproduced the three canonical day snapshots byte-for-byte and preserved all seven recorded validation error messages. This commit splits normalization responsibilities and adds focused error-order and exposure tests; its exact-SHA checks are pending. The nested local shell is currently unavailable; GitHub Actions runners remain available. CI uses a test signer; owner-signed production upgrade is not confirmed. No production APK is produced by this cleanup.

## Next cleanup target
- After exact-SHA tests and Android QA for the `normalizeDay` change pass, choose the next production hotspot from the updated Crapper report.
