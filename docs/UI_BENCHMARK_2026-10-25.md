# UI benchmark and design acceptance, 25.10.2026

Scope: UI/UX of the offline Android courier-finance app. This is NOT approval to change the finance formulas, forecast training or stored facts. Baseline for this iteration: `f4e54a8b626464df96811d91ad0865ea872ed2c2`; implementation under review: `edc529a4a81b8fea2762fb18375ab54da125d0b7` and subsequent documentation-only commit. PR #4, issue #3, Linear YAR-7. Never merge while the Android matrix or upgrade retention gate is pending.

## Primary-source review

Checked 25.10.2026; these are product features documented by their vendors, not performance claims about this project.

| Official source | Confirmed workflow | Suitable takeaway | Limit |
| --- | --- | --- | --- |
| [Gridwise Features](https://gridwise.io/features) | Single earnings overview and daily/weekly/monthly goal progress, trends of hours/earnings | Emphasize income, time and progress; preserve period drill-down | No crowdsourced market feed, account linking or GPS background tracking; not in this milestone |
| [Gridwise insights explanation](https://help.gridwise.io/hc/en-us/articles/24112893729815-How-Insights-are-Measured) (updated 28.01.2026) | Four-week community median insights | Distinguish observed records from an estimate in labels | Collective median does NOT measure an individual courier's accuracy; cannot justify importing their rates |
| [Stride: add/edit/delete income](https://support.stridehealth.com/hc/en-us/articles/360051715114-How-do-I-add-edit-or-delete-my-income-in-the-Stride-App) (updated 10.09.2025) | Add from dashboard or +; choose date; edit and delete existing record; save | Keep the bottom +, history access, edit action and visible save state | Do not introduce linked bank account or tax estimates |
| [Solo](https://www.worksolo.com/) | Shows total earnings, average per hour, shift time and hours of work | Keep forecast/planned time visually separate from accrued money and actual hours | Platform-linked real-time data, subscriptions and AI are prohibited dependencies here |
| [Яндекс Про: выплаты и отчёты](https://pro.yandex.ru/ru-ru/kirishi/knowledge-base/courier/dohod/vyplaty-otchety) (published update 05.10.2026, but direct page retrieval unavailable during this review) | Search-result extract describes period/day/slot hierarchy and correction breakdowns | Tentative only: match existing period→day→slot navigation and keep adjustments legible | **UNVERIFIED direct page**, do not port contractual rates, conditions or correction algorithms |

## Concrete findings and chosen scope

1. **P1, initial dashboard**: empty periods formerly showed several undefined sums; the new entry flow uses one meaningful card with `Добавить первый слот`. No synthetic amounts are shown. Text-only comprehension review initially found two serious problems; shorter sentence retested with zero findings.
2. **P1, accounting hierarchy**: the home focus groups *pace + qualification*; *income / paid / owed* stays separate; conditional bonuses stay independent from actual payouts. The business formulas remain in `web/core.mjs` and are untouched.
3. **P2, navigation**: a large central + remains the canonical slot entry point, while 'Период' owns the history. Avoid a redundant permanent add button on populated home. Keep five bottom destinations.
4. **P2, forecast**: keep exactly the two visible duration regulators (active hours; full slot) and import. Forecast without matched evidence stays unknown. Weather is only a compact header indicator.
5. **P2, visual cohesion**: consistent 22px-radius semantic cards, clear numeric scale, tabular figures, clear focus-visible and large-font fallback, in light and black-based dark palettes. Must still verify via *real screenshots*; CSS inspection does not count.

## Before/after acceptance contract

- [ ] Android 35 screenshots/XML: empty, populated, forecast, period, history, form, settings; widths 360 and 390 dp, dark/light, 200% font, keyboard, scrolling and system insets. Inspect both images and accessibility tree.
- [ ] Verify the first-use CTA actually opens `Сохранить слот`, navigating back produces no record (implemented in `qa/ui_audit_matrix.py`).
- [ ] Zero horizontal overflow, no clipped income, no controls hidden by navigation; accessible labels and visible touch targets.
- [ ] 14h slot / 6.5h active remains after navigation, force-stop and relaunch; do not confuse this plan with Yandex-accounted time.
- [ ] Cross-check visible money against the same synthetic database, all old financial/model unit regressions pass; no future forecast information leaks into facts.
- [ ] Verify replacement install of `ru.courier.finance.transfer` over the previous version preserving data. A temporary CI signing key proves test-upgrade only. Owner-key signature continuity and release APK are a separate gate.
- [ ] Independent post-implementation screenshot inspection and decision log tied to final SHA.

Status as of this document: **implementation PARTIAL**. Unit, native build and compatibility steps passed in run 40150813662 before the emulator phase; the full Android matrix has no successful terminal result yet. Latest test change is covered by run 40151574592 when it finishes. Do **not** mark release PASS from source-only review, successful build, or a past CI run.

## Future candidates, not authorized for this milestone

- A small historical trend by actual period from stored local facts only, with honest missing-data states (Gridwise-inspired); requires explicit product acceptance and new tests.
- Faster edit of the latest slot via existing history and IDs, without ever inferring missing facts (Stride-inspired).
- Optional period filters only if the user needs them and import sources genuinely provide categories (Яндекс-inspired).

Rejected: social leaderboards, subscriptions, linked accounts, AI predictions, bank sync, GPS background service, push/server dependences, regional demand maps, automatic tax deduction assumptions, and unverified courier pay rates.
