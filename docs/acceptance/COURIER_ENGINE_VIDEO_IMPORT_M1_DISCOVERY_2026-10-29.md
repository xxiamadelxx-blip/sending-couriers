# Courier Forecast Engine + Video Importer — M1 Discovery / 2026-10-29

**Status: DISCOVERY REVIEW, AWAITING OWNER APPROVAL.** This branch contains **documentation only**. No application logic, UI, database, API keys, signing certificate, or APK was changed.

## Verified code baseline
- Canonical repository: `xxiamadelxx-blip/sending-couriers`, branch `ui/audit-issue-3`, SHA `c06490f298ff63bc1678d0bd8d78eb6b500a9252`.
- Open PR #4 (base `qa/native-forecast-cold-start`). Default branch `main` is different. Must not treat an earlier Android PASS as proof for current SHA.
- Source Android manifest: `ru.courier.finance`, minSdk26, targetSdk35, versionCode29 / 1.7.15. Existing transfer release uses a separate `ru.courier.finance.transfer` package generated via `tools/prepare_parallel.py`; do **not** replace either package without verifying exact package/keystore/installed data. Current frontend is JavaScript/WebView with native Java bridge.
- Local persistence: `MainActivity.java` `SharedPreferences("courier_finance")["state"]`; JS serialized state schema 6, up to 8 MB; localStorage browser fallback. **No Room/SQLite entities or WorkManager in inspected source.**
- Current Java `WorkbookReader.java` parses bounded XLSX, native Android `ACTION_OPEN_DOCUMENT` picks XLSX/JSON; `web/forecast-import.mjs` imports daily totals, shift windows, RAW evidence but no MP4/MOV OCR pipeline.
- Forecast candidates are **already partly implemented** in `web/forecast-count.mjs`: weighted baseline, Poisson offset, conditional negative-binomial fitting, rolling walk-forward and comparable cohort evaluation. `web/forecast-runtime.mjs` schedules a Web Worker; current worker lifetime depends on WebView. Preserve and test algorithm, do not claim native headless runtime exists.
- Clock source currently anchored to Europe/Moscow for `core.today()`, date boundaries/versioned temporal semantics need migration validation.

## Source Google Sheet (read only)
URL: https://docs.google.com/spreadsheets/d/1SJZ1MfVtkga9ihq2C0FrXIOQoQu3jtYRQn5wHd6CRCM/edit
- Title `Courier Forecast`, time zone `Europe/Moscow`, 15 verified tabs.
- Verified *nonempty data-row counts* on 29 October, **not unique confirmed event counts**:
  `Заказы RAW` 1248 rows (41 distinct date values);
  `Смены` 80 (42 dates);
  `Дневные итоги` 55 (55 date strings);
  `Прогнозы` 114 (38 forecast-date values);
  `Финансовые факты` 72 (29 dates);
  `Снимки периода` 3.
- Several historic shift boundaries explicitly marked reconstructed. Do not turn a source row into confirmed work exposure.
- Existing `web/forecast-import.mjs` uses only selected XLSX sheets; full normalized history migration must include models, rules, published forecasts, financial facts and period snapshots.
- Pre-migration canonical historic record = original Sheet; preserve verified snapshot/copy and signed manifest of counts & hashes before any destructive action. Google OAuth sync deferred to M7.
- **Blocking business-rule discrepancy:** `web/core.mjs` `calculatePremiumCycle` currently includes `tips` and `separateBonus` in 5% base, while updated owner task and `Финансовые правила` restrict 5% to main Yandex income (hourly base + eligible final guarantee adjustment exactly once) excluding tips and park bonuses. Correct this with dated rules and independent golden tests only after plan approval; preserve old financial source records/revisions.

## Planned data contract
SQLite/Room as source of truth **after** verified, reversible migration; old JSON retained read-only until acceptance. Key logical tables:
`orders` (real events), `aggregate_order_counts` (confirmed/count inferred totals), `work_intervals`, `period_snapshots`, `financial_ledger`, `weather_observations`, `forecast_snapshots`, `forecast_evaluations`, `model_registry`, `import_sources`, `extraction_evidence`, `sync_queue`, `audit_events`.
Each fact: stable ID, source URI/hash, date/time precision & timezone, original/normalized value, evidence, confidence and recorded/revised timestamps. Model forecast publication immutable. Amounts integer kopecks. `null` unknown, not 0.

Target distinctions:
- order accepted/completed timestamps vs slot bounds; worked/ready exposure vs accounted/Yandex clock vs empty accounted hours;
- no synthesized individual events from day-count/100 RUB calculations;
- financial rewards, final guarantee settlement, tips, park bonus, 5% cycle bonus, deductions and net payouts as different posting types;
- date effective financial terms; separate conditionally assured 360 RUB×accounted hours vs verified closing payout.

## Plan awaiting owner decision

| Milestone | Implementation after approval | Acceptance proof |
| --- | --- | --- |
| M1 | Discovery and owner-approved architecture | Source SHA/table headers/counts mapped; owner approves package strategy & plan |
| M2 | Add Gradle-enabled native persistence layer, Room SQLite schema and reversible JSON + Sheets import; retain UI & old data until parity | Schema migration tests; exact counts/hash and money totals; reimport idempotence; upgrade/restart/no-loss |
| M3 | Native autonomous count engine, beginning with existing baseline; Poisson/NB challengers and immutable prediction/evaluation | Offline Android forecast without WebView running; walk-forward MAE/bias/WAPE vs identical baseline folds; no future leak |
| M4 | MP4/MOV picker/share; native frame sampling; bundled local Russian/English OCR; versioned screen parsing | Actual pixel extraction, OCR of Cyrillic and numbers while offline; evidence timestamps; unknown-screen queue |
| M5 | Cross-frame/cross-file dedup, confidence review and finance/speedometer reconciliation | Tests: 28 Oct 11/1100; 14 Oct 1200→12 inferred; 15 Oct 22376 final supplement; 18 Oct two orders at 18:57; partial 17 Oct remains partial; period 90/57 separate; repeat same MP4 no count growth |
| M6 | Native WorkManager events for forecast freshness/retrain/evaluation and import | Process death/restart/reboot/offline; cannot promise exact 06:00; catch-up on app opening |
| M7 | Optional user-authorized Google OAuth sync with queue/conflicts; JSON/CSV fallback | Offline-first and 429 handling; conflict review, no loss of manual edits, no forecast overwrite |
| M8 | Independent real-media/finance end-to-end Gauntlet Loop | Per-scenario fact vs predicted vs raw evidence, PASS/FAIL and falsification attempts |
| M9 | Signed transfer APK tested on emulator and upgrade from same package & cert | SHA, artifact/signature, launch, data restoration and visual screenshots; no older PASS reused |

Run RED→GREEN→REFACTOR per functionality, then independent repeat, max 3 focused cycles per defect before BLOCKED + independent continuation. Do not hide failures or relax tests.

## Technical decisions requiring approval
1. **Keep existing user-visible WebView UI and finance screens**. Modernize only the Android persistence/background/media layer. New Room/WorkManager dependencies make a focused Android Gradle build path appropriate; current `build.py` uses bare `aapt`/`javac`. Keep `build.py` and the existing signing process as rollback paths until new build outputs are proven.
2. Preserve `ru.courier.finance` legacy installation separately. Target the installed `ru.courier.finance.transfer` package with the same original signing key, never alter package ID or delete app data automatically.
3. OCR first candidate Tesseract (Apache-2.0 engine + version-pinned language assets) through an `OCRAdapter`; benchmark on actual Russian screenshots before irreversible engine commitment. MediaMetadataRetriever first frame sampler; entire capture local.
4. The source Google Sheet remains canonical until parity, then opt-in user OAuth synchronization. Never embed a ChatGPT token.

## Primary reference validation as of 2026-10-29
- Room/Java annotation processor and release notes: https://developer.android.com/jetpack/androidx/releases/room (Room 2.8.5 listed as stable Sep 2026; check compatibility before pin).
- Room migration safety: https://developer.android.com/training/data-storage/room/migrating-db-versions (no destructive fallback for owner facts).
- WorkManager: https://developer.android.com/develop/background-work/background-tasks/persistent and https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work (persistent, **not exact 06:00**).
- Frame timestamps: https://developer.android.com/reference/android/media/MediaMetadataRetriever (closest frame may differ from requested timestamp).
- File picker: https://developer.android.com/training/data-storage/shared/documents-files
- Screen capture consent: https://developer.android.com/about/versions/14/behavior-changes-14 (new consent per MediaProjection session).
- Tesseract OCR/license and language data: https://tesseract-ocr.github.io/tessdoc/Installation and https://github.com/tesseract-ocr/tessdata/blob/main/rus.traineddata (distribution/compatibility to recheck during M4).

## Open evidence
- Full real owner MP4/MOV samples are not currently in accessible project/conversation/library file search. M4/M8 optical recognition criteria remain **NOT RUN**, not PASS or contrived fixtures.
- Native Android QA from earlier revisions includes failures in 360dp controls, accessibility labels and large-font focus. Scope them according to user-approved M1–M9 and avoid unrelated redesign.
- No tests or APK built as part of this M1-only Discovery documentation pass.
