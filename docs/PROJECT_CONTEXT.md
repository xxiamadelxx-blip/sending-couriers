# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`; draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) targets `main`. Keep one branch and do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Latest verified app-source commit: `0ca42d2c8dfac36c97478d05e02b423f25f53495`.

## Product and architecture
- Courier shift and income tracker with history, bonuses, forecast, XLSX/JSON import and export.
- Android Java host opens a local WebView. UI, persistence adapters and business calculations are JavaScript ES modules; SQLite and SharedPreferences preserve app data.
- Financial calculations work offline without generative AI, paid APIs or a permanent server. Network access is used for public weather.
- See [README](../README.md) for build commands and [ARCHITECTURE](ARCHITECTURE.md) for data flow and module ownership.

## Confirmed cleanup state
- The current branch is a single refactor line; the active app package and version are unchanged.
- Refactors through `readDayFactInput` preserve validation order, saved facts and the distinction between active work time and reported slot duration.
- At `0ca42d2c8dfac36c97478d05e02b423f25f53495`, History card markup and event wiring were extracted into `historyCardMarkup` and `bindHistoryActions`. Rendered markup and moved event code were compared with the parent source; both matched. The change only reorganizes code and adds regression coverage.
- No finance formula, schema, product copy, styling, import algorithm, or Android bridge contract changed in the History refactor.

## Verification at the verified source SHA
- GitHub Actions UI audit [#46047564750](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46047564750): JavaScript 281/281, Python 99/99, code-quality passed, and critical finance mutations 28/28 were killed.
- Current-source APK build and all six Android 35 gates passed: `ui_matrix`, `action_layout`, `field_labels`, `xlsx_import`, `large_font_form`, `transfer_upgrade`. XLSX import checked persisted facts; update test used a temporary signer.
- UI evidence: [artifact 15225685389](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46047564750/artifacts/15225685389). APK artifacts from this run are test-signed/unsigned and are not production install packages.
- `android-qa.yml` run #46047564712 uses old APK fixtures and is not evidence for this source SHA. No owner-signed production APK or owner-key upgrade was tested.

## Constraints and next step
- Preserve public behavior, finance rules, database migrations, imported user facts and Android bridge contracts. Keep active hours distinct from full slot time. Do not make a visual redesign or introduce dependencies.
- Next target: split `WorkbookReader.read` (CC 30) by package loading, workbook metadata and sheet/cell parsing. Preserve parse order, limits, accepted sheet names, formula markers and JSON output. Verify with the current-source XLSX emulator gate and existing regressions.
