# Выплата расчётных премий · 4 ноября 2026

Scope: make the 12-week premium information icon actionable and include eligible 12-week and two-week pace premiums in the estimated two-week payout after the period ends.

## Rules implemented

- The 12-week premium is included only in the fortnight containing the end date of its 84-day cycle. It is added after that fortnight ends.
- The two-week pace premium is added after the fortnight ends only when the configured premium pace is reached and every entered row has hours and orders.
- Do not add estimated premiums to an unfinished or closed period. Do not alter actual recorded payouts.
- «Осталось выплатить» includes eligible estimated premiums. A visible breakdown says the combined amount and shows the two premium components.
- Tapping the 12-week information icon opens a dialog explaining timing, eligibility, estimate status and closure handling.

## Independent calculation fixture

Cycle starts 21 Aug 2026 and ends 12 Nov. Eligible hourly base is 6,480 ₽: at 5%, the 12-week premium is 324 ₽. The completed fortnight has a pace premium of 144 ₽. With 2,380 ₽ base amount remaining, the estimated payout is 2,848 ₽, including 468 ₽ in premiums. Before 12 Nov is complete, the same fixture remains at 2,380 ₽. Recording the full 3,348 ₽ actual payout leaves zero due.

## Evidence

| Criterion | Evidence | Status |
| --- | --- | --- |
| Premium math, eligibility, end-date boundary, no duplicate on later period, closure skip | `node --test tests/premiums.test.mjs` | PASS |
| Full declared model/UI source suite | `npm test` | PASS, 226 tests on working tree based on `1d411cda981fe28175d626fba43c927b2848b838` |
| Browser click/dialog and visible breakdown | `tests/premium-ui.test.mjs` added; cloud browser preview still needs a current-source refresh | NOT RUN |
| Android build, install, update over signed 1.7.34, persisted data | Pending APK build and emulator run | NOT RUN |
