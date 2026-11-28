# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`; draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) targets `main`. Keep one branch; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Previous source checkpoint before this follow-on cleanup: `c3479e3fe379ea486ae96d742eced5c34e85a2e8`; draft PR #19 remains open. Exact-SHA M4 parser tests, APK builds and synthetic Android OCR probe passed in [run #46136223655](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46136223655). Source-built Android 35 UI audit [#46136226643](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46136226643) remained active without a result when this update was prepared; the new source SHA receives a fresh run. Android QA [#46136226628](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46136226628) passed, but its workflow uses older APK fixtures and is not source-SHA evidence.

## Product and architecture
- Courier shift and income tracker with history, bonuses, forecast, XLSX/JSON import and export.
- Android Java host opens a local WebView. UI, persistence adapters and calculations are JavaScript ES modules; SQLite and SharedPreferences preserve app data.
- Financial calculations work offline without generative AI, paid APIs or a permanent server. Network access is used for public weather.
- See [README](../README.md) and [ARCHITECTURE](ARCHITECTURE.md).

## Confirmed cleanup state
- Refactors through `countForecast` preserve validation order, saved facts, and active work time versus full-slot duration. `countForecast` now separates history aggregation, model evaluation, confidence/reason shaping and fallback result construction. Its peak CC fell from 39 to 18; aggregate complexity increased by 5.
- `history` moved its existing card markup and event binding into focused helpers; the HTML and handlers matched the parent source.
- At `fb4cacf`, `WorkbookReader.read` was split into package loading, shared strings, relationship parsing, sheet rows and cell values. Limits, parse order, allowed sheets, formula markers and JSON output were retained.
- The workbook change leaves financial formulas, schema, import mapping, UI copy/styles and Android bridge contracts untouched.

## Verification
- At `35da0f8`, npm, Python, code-quality, financial mutation checks (28/28), APK builds, and all six source-built Android 35 gates passed. UI audit evidence: [run #46067506056](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46067506056); Android smoke run: [#46067505944](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46067505944).
- The transfer-upgrade gate uses temporary test signing. CI outputs a test-only APK and unsigned transfer package; no owner-signed production APK or production-key upgrade was tested. `android-qa.yml` uses older APK fixtures and is not current-source evidence.

## Current change
- `VideoImportProcessor.Result.uniqueCandidates()` (CC 86 at `35da0f8`) is split into named collection and reconciliation stages. The M4 parser tests, APK builds and synthetic Android OCR probe passed on exact source SHA `51bf626`; source-built Android 35 UI audit is pending.
- `reconcileWeakOrderOutliers` (CC 47 at `51bf626`) is now split into slot-summary collection, single weak-row reconciliation and repeated time-variant reconciliation. Existing thresholds and deletion conditions remain unchanged. Tests cover both count/total mismatch cases; Crapper reports CC 5. The M4 parser suite, APK builds and emulator OCR probe passed on exact source SHA `d880808`.
- `processFile` (CC 21 at `d880808`) is split into input validation, metadata reading, frame extraction and per-frame OCR. A synthetic Android probe checks that a failed import removes temporary review images. Crapper reports CC 4. M4 parser tests and APK builds passed at `0652e9e`, but the Android OCR probe was skipped because this push workflow conditioned it on PR events or `[android-probe]` commit messages.
- The M4 workflow's exact-SHA emulator probe passed at `c3479e3` in run #46136223655, including failed-import cleanup, facts write/restart, continuous two-slot handling, cross-source reconciliation, offline recovery and reboot checks. The preceding `isOneFrameTimeReversal` refactor reduced Crapper CC 16 to CC 3; its local suites at `c3479e3` passed (`npm test` 281/281, Python 99/99). This follow-on change extracts per-frame scan reversal handling and extreme-time updates from `discardScanReversals` and adds a regression for a weak backward-time row at the end of an ascending scan. The strict 5-minute comparison, support threshold, slot direction and observation order are preserved. Exact M4 and UI CI for this follow-on source are pending.
