# Project context

## Canonical line
- Active branch: `refactor/deep-cleanup-20261104-recovered`; draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) targets `main`. Keep one branch; do not merge before acceptance.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- Latest fully verified app source: `fb4cacf746e8b8eea5447bcc871407123b9e94a2`; tested PR merge SHA: `535d9be6e01cf5a8eb067b3bf38246a8123e335d`.

## Product and architecture
- Courier shift and income tracker with history, bonuses, forecast, XLSX/JSON import and export.
- Android Java host opens a local WebView. UI, persistence adapters and calculations are JavaScript ES modules; SQLite and SharedPreferences preserve app data.
- Financial calculations work offline without generative AI, paid APIs or a permanent server. Network access is used for public weather.
- See [README](../README.md) and [ARCHITECTURE](ARCHITECTURE.md).

## Confirmed cleanup state
- Refactors through `readDayFactInput` preserve validation order, saved facts, and active work time versus full-slot duration.
- `history` moved its existing card markup and event binding into focused helpers; the HTML and handlers matched the parent source.
- At `fb4cacf`, `WorkbookReader.read` was split into package loading, shared strings, relationship parsing, sheet rows and cell values. Limits, parse order, allowed sheets, formula markers and JSON output were retained.
- The workbook change leaves financial formulas, schema, import mapping, UI copy/styles and Android bridge contracts untouched.

## Verification
- Source-built UI audit [#46054348428](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46054348428) passed on the exact source SHA: JavaScript 281/281, Python 99/99, code-quality, and critical finance mutations 28/28.
- All Android 35 gates passed: `ui_matrix`, `action_layout`, `field_labels`, `xlsx_import`, `large_font_form`, `transfer_upgrade`. XLSX import twice retained the same two order facts; same-signer update retained one record (4 h / 8 orders / 1,200 ₽).
- Evidence: [UI and emulator captures](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46054348428/artifacts/15227629650), [test-only APK](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46054348428/artifacts/15226410652), [unsigned transfer package](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/46054348428/artifacts/15228820155).
- Those APKs use temporary test signing or are unsigned. No owner-signed APK/upgrade was tested. `android-qa.yml` uses old APK fixtures and is not current-source evidence.

## Current change
- `renderSlotWorkingEditor` (CC 25) is being separated into its existing markup and interaction responsibilities in `web/app.mjs`. The template and event block were compared with the verified parent and copied byte-for-byte. Tests assert the same accessible choices, mode field, delegation order and dirty-state tracking.
- This candidate is not yet verified. Run current-source Node/Python regressions, code-quality, APK build and Android 35 gates before calling it complete. No visual change is intended.
