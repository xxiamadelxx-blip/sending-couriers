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
- `normalizeDay` delegates order evidence, pause conflicts and work-window exposure to `reconcileDayOrderEvidence`; reconciliation rules stay unchanged.
- `ensureForecast` delegates snapshot construction and model-list updates. Tests cover immutable MORNING, NOWCAST remaining time, no future leakage and no duplicate model update.
- `dayView` separates fact parsing/validation, preview updates, event binding and saving. Its form HTML is unchanged; active hours stay separate from the reported slot.
- `simpleView` delegates recovery status to `videoRecoveryNote` and forecast DOM updates to `refreshSimpleForecastPreview`. The screen template and prediction rules are unchanged.
- `weekView` delegates its existing plan markup to `weekMarkup`; the moved template is unchanged.
- `calculate` delegates payout eligibility and missing-order/hour reporting to `calculatePaymentConditions`. Thresholds and money calculations are unchanged.
- `mergeVideoSlotDay` delegates preservation of manually confirmed day facts and video evidence status to focused helpers. Regression coverage confirms the payment-hour denominator and confirmed facts survive import.

## Verification and limits
- Latest completed refactor before the current UI fix: `a7d5cf6baeff254e355f557b13fcbf5ea9600554` on the canonical branch. Local checks then: `npm test` 258/258 passed; Python suite 91/91 passed; `git diff --check` passed; differential check against the parent preserved exact serialized day objects in two import scenarios.
- Complexity tools ran on the parent and current source: `mergeVideoSlotDay` fell from CC 50 to CC 24; the next production hotspot is `normalizeDay` at CC 46. This is a responsibility split, not a claim that total project complexity has fallen.
- Android 35 build and emulator are available in GitHub Actions. At PR HEAD `26f9a0deffec1bbfb19de11630945fba6b7fe12e`, code-quality, Android emulator QA and `ui_matrix` passed. The UI audit found and fixed a form theme button reduced to 44dp by a later rule; the target is now 48dp with a static regression assertion. At exact head `9751061e2c5cdc0ae8acdb19621e502aeb941b79`, code-quality and Android emulator QA passed; UI audit run `45481198494` failed only `large_font_form`. Artifact `14965755849` showed the test crossed Moscow midnight: the 1h/2-order/300-ruble slot and 9h/18-order/3,200-ruble seed belonged to separate dates, while the gate expected one combined day card. The gate now checks the new slot within one dated history card and verifies all three persisted records from app backup after restart. At prior head `a9479e11211ae1fdbcb4d2ac64544bca17fd4395`, code-quality and Android emulator QA run #166 passed; UI audit #320 passed matrix, action layout, field labels, XLSX import and large-font form, but failed `transfer_upgrade` before attempting the package update. Artifact `15044087585` shows the synthetic hours field had not received focus before the harness typed and sent Back, which closed the form. The current change makes the harness wait up to five seconds for the intended EditText focus before typing, and fail with field diagnostics if focus is not observed. This is a test-harness fix; APK upgrade is unverified until an exact-head rerun. Local checks for this change: `npm test` 259/259, Python 99/99, focused emulator harness tests 12/12, `py_compile` and `git diff --check` pass. Local Android emulator is unavailable in this nested VM. Transfer-upgrade automation uses a test signer; owner-signed production upgrade is not confirmed. No production APK is produced by this cleanup.

## Next cleanup target
- After this commit's exact-SHA Android and CI checks finish, inspect and simplify `normalizeDay` (CC 46) without changing reconciliation behavior.
