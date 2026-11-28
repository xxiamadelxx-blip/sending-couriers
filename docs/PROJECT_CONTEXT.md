# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`; draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) targets `main`. Keep one branch; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Latest app source checkpoint: `35da0f839ac444fb9fc21477cda36c9ffba20a89`; draft PR #19 remains open. The source-built UI audit [#46067506056](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46067506056) ran `npm test`, the full Python suite, code-quality and Android 35 UI gates successfully. `android-qa.yml` uses older APK fixtures and is not source-SHA evidence.

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
- Next target: `VideoImportProcessor.Result.uniqueCandidates()` (CC 86 at `35da0f8`). The function normalizes slot context, merges repeated OCR candidates, identifies scan direction and reconciles weak OCR variants. Keep raw per-frame evidence, candidate ordering, amounts and count/total reconciliation unchanged.
- A regression now asserts that deduplication does not mutate frame evidence, returns an immutable result and preserves the two distinct same-time order rows in order. M4 unit tests were not part of the `35da0f8` UI audit; this active branch is added to the existing M4 workflow trigger so the test suite can verify the baseline before refactoring.
