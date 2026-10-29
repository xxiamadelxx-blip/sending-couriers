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

## Historical opening income, owner instruction · 29 October 2026
Owner has historic income from 21 August and does not want to manually create every daily record. Support two inputs within Period > 12 weeks > bonus settings:
- Enter gross cycle-to-date income and the inclusive cutoff date, then save once.
- Upload a strict ChatGPT-generated JSON report with `type:"courier-12week-income-v1"`, `cycleStart:"2026-08-21"`, `through:"2026-10-15"`, `grossIncome:"100000.50"`. User reviews the prefilled values and saves; do not silently modify the database.
Stored in `settings.cycleOpening`, not as fabricated daily slots. Calculate the 12-week premium from the opening gross plus only later dated slots; entries at or before cutoff remain in the database for their period but are excluded from the cycle accumulator. Start/cutoff must be within the same 84-day cycle; no carryover to next cycle. Backup/restore preserves value, conflicting imports reject. The bonus is an estimate, never automatically marked paid. The accepted screen composition and Home are not redesigned. Test independent cents, same-day overlap, cycle rollover, invalid report, idempotency, restore and Android force-stop. Actual signed upgrade needs fresh SHA verification.

## Form-only Android layout repair · 29 October 2026
User-supplied actual Android screenshot showed misaligned money/hour fields, unattractive em-dash placeholders and a platform-native spinner overlay for "Фактически работал". Approved direction stays unchanged: graphite/orange. In code the Add Slot form alone now uses consistent 54px field geometry, evenly aligned labels/units, subdued "Введите" placeholder without changing empty numeric semantics, and an accessible in-app four-mode choice preserving unknown/intervals/total/rest state. No rework of Home, Period, the model, or historic data. Verify real Android screen sizes and 200% font, choice interactions, save/restart and no numerical changes; CI build is not a substitute for screenshots.

## Launcher and startup brand · 29 October 2026

Owner requested in-code branding change (not standalone pictures): apply the reference's black centered floating emblem composition to Android app icon, Android 12 system splash, Java loading overlay, HTML bootstrap fallback. Keep the ORIGINAL four-arm SHIFT CONTROL vector path, colors #f4f1e9, #ff7952, #ffbd57, and graphite/black background #10151a. Do not import/generated pink-violet icon or change navigation/finances. Android launcher icon removed the old header stripe and clipped corner; the symbol itself is unchanged. Native splash remains removed when bridge ready; dynamic light/dark persisted theme must still work. Verify signed transfer update over same package, original app preserved, no lost records; Android QA result and screenshots must be exact SHA, not mockup.

## Real gradient in existing SHIFT CONTROL logo · 29 October 2026

Owner corrected the prior release: it had only four flat-painted arms, no real gradient. The new Android launcher and Android system/native splash use four unchanged original pathData arms, each containing an actual Android VectorDrawable `<aapt:attr name="android:fillColor"><gradient ...>` (supported API 26+) with stops orange `#ff7952` → amber `#ffbd57` → cream `#f4f1e9` → orange. HTML fallback mirrors the same stops and gradient axis in SVG `linearGradient`. Shape, background graphite `#10151a`, package name and persisted data untouched. This is the requested continuous color transition, not a new neon brand or a generated picture. Build must validate Android AAPT resource compilation, XML gradient extraction, 2 themes, update without uninstall and actual icon/startup screenshots. Prior test-only PASS cannot be reused.
