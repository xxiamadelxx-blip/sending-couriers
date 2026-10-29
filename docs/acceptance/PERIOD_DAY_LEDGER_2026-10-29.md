# Period · Editable day ledger · 29 October 2026

Status: **OWNER APPROVED VISUAL PROPOSAL / ANDROID NATIVE QA OPEN**. Scope: only **«Период»**, not Home, Forecast, navigation, money formulas or persisted data.

## User-approved target (from the 29 October Android screenshot and explicit correction)

- Avoid duplicating current-period hour/order totals already visible on Home.
- Prioritize «Записи по дням» directly below the existing period selector.
- Show each day as one expandable card. A day with two or more slots opens to distinct editable slot records.
- All edits use stable entry IDs; only the selected slot is changed or deleted, and saved facts survive restart.
- «Условия требуют проверки» must not overlap another card; show conditions below the day ledger.
- «12 недель» must be secondary, compact and placed below conditions; preserve date-of-cycle editor and rules.
- Keep the graphite/orange SHIFT CONTROL visual language and orange text/accents; preserve the Home screen, bottom navigation and central +.
- Do not invent per-slot clock timestamps: entries store duration but not reliable start/end time.

## Implementation

- `web/period-day-view.mjs`: existing pure date grouping, aggregate presentation and per-ID edit control; day totals from `calculateDay`. Empty history and unknown values handled without fabricated zero.
- `web/app.mjs`: display day ledger before payout conditions and compact 12-week settings; edit action uses `form(button.dataset.entry,'period')`. Both conditions and cycle remain available. No redundant Home period KPI block.
- `web/style.css`: scoped spacing between day cards and the secondary status; otherwise untouched.
- Regression tests: `tests/period-day-view.test.mjs` and `tests/ui-mvp.test.mjs` assert chronological order, separate edit IDs, null handling and source hierarchy. `npm test` is the declared source gate.

## Criteria → evidence → status

| Criterion | Verification/evidence | Status |
| --- | --- | --- |
| Day cards precede conditions and cycle | Source inspection, `period-day-view` + `ui-mvp` regression tests | Source changed; CI result pending |
| Two slots, distinct edit IDs, day totals | `period-day-view.test.mjs` plus native edit/save/relaunch flow | Source covered; Android NOT RUN on final SHA |
| No duplicate Home KPIs | `periodDetails` markup plus native screenshots | Source changed; visual OPEN |
| Conditions do not overlap cards | Scoped static layout + 360/390 Android captures, inspect images | NOT RUN on final SHA |
| Persist changes and preserve numeric values | Core/NativeBridge tests and Android restart | NOT RUN on final SHA |
| Owner approval of synthetic visual proposal | Two inline previews shown in the 29 Oct 2026 chat, collapsed days and an expanded two-slot day; owner's explicit reply: «Одобряю» | **PASS for shown visual proposal only**; native Android screenshots still NOT RUN |

## Safety / limits

The screenshot records must not be added to the public repo. Source checks do **not** establish Android design PASS or an installable APK. Existing historic QA failures for unrelated areas remain separately tracked; do not describe those as repaired. Verify a new SHA/CI run before an artifact can be issued.

## Explicit owner visual decision · 29 October 2026

**APPROVED**: The owner inspected the two *inline synthetic preview images* (collapsed list of daily cards; expanded day with two separately editable slots) and replied **«Одобряю»**. This locks the composition and task hierarchy for the Period screen: day ledger immediately after date selector; expandable day cards; per-slot edit; payout notice and compact 12-week cycle below. Keep exact graphite/orange visual direction and existing navigation. No new design exploration, palette revision, or Home redesign is authorized.

**Approval scope:** proposal visuals with synthetic data only, not confirmation that the exact build renders correctly on the Android emulator. For real-app QA, inspect actual 360/390dp Android screenshots, exercise expansion, separate editing, saving, restart, and check absence of overlap. The present full CI run [#40846918821](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40846918821) for code SHA `587fc370c365a5c06126042d32d6b8c2711a2695` has model/unit/build PASS but Android 35 native checks were still in progress at the moment this decision was recorded. Do not mark final native, release, or owner-signed upgrade PASS on that evidence alone.

## Clarification of 12-week block · 29 October 2026
Owner: «Блок 12 недель задуман как отслеживание преми 5 процентов от общего дохода за 12 недель». The block is a **bonus accumulator**, not a date-progress widget. Keep it below editable daily records and payout conditions, compact within the approved graphite/orange design.

**Model:** For each entered slot with reliable hours, use the same gross-income components as Home (`hourlyBase + tips + separateBonus`), preserving effective payment rules by entry date and rounding money in kopecks. The 84-day premium is the sum of effective-percentage contributions. Do not treat the calculated bonus as paid; an actual payout cannot be confirmed from the existing fact schema. Missing hours or legacy intervals must remain visible as uncertainty, not invented values. Do not change period income, existing fact storage, premium-for-pace, or forecast algorithms.

**Checks:** independent hand calculation 8h × 360 RUB + 120 RUB tips + 200 RUB other bonuses = 3200 RUB gross; 5% = 160 RUB (old hourly-only algorithm incorrectly returned 144 RUB); verify dates 21 Aug–12 Nov inclusive, changing rules and missing hours; inspect both 360/390 themes in the new APK. Local RED reproduced on existing APK; CI final Android state remains open until exact-SHA evidence.
