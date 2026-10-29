# Period · Editable day ledger · 29 October 2026

Status: **IMPLEMENTED IN SOURCE / ANDROID VISUAL VERDICT OPEN**. Scope: only **«Период»**, not Home, Forecast, navigation, money formulas or persisted data.

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
| Owner visual acceptance | Before/after real Android screenshots | OPEN / requires explicit owner verdict |

## Safety / limits

The screenshot records must not be added to the public repo. Source checks do **not** establish Android design PASS or an installable APK. Existing historic QA failures for unrelated areas remain separately tracked; do not describe those as repaired. Verify a new SHA/CI run before an artifact can be issued.
