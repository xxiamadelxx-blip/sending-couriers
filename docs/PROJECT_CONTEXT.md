# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`; draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) targets `main`. Keep one branch; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Latest app source checkpoint with M4 verification: `d880808efda1779760ebe643c59587d0921ed0bf`; draft PR #19 remains open. Its parser tests, APK builds and synthetic Android OCR probe passed in [run #46132967078](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46132967078). The source-built Android 35 UI audit [#46132970333](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46132970333) is still running. `android-qa.yml` uses older APK fixtures and is not source-SHA evidence.

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
- The next source hotspot, `processFile` (CC 21 at `d880808`), is being split into input validation, metadata reading, frame extraction and per-frame OCR. A synthetic Android probe now checks that a failed import removes temporary review images. Crapper reports CC 4 for `processFile`; exact-SHA parser and emulator checks are pending.
- Local verification for the worktree: `npm test` 281/281, Python suite 99/99, `git diff --check`, Crapper, Dryer and Mutator scan passed. `dryer` reports existing lookalike time parsing blocks (`slotStart`/`slotEnd` and `orderMinuteValue`/`orderMinute`); they are outside this change.
