# Project context

Checkpoint for `refactor/deep-cleanup-20261104-recovered`; continue from the current checkout without repeating the completed audit. `main` is unchanged. Draft PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) tracks this work.

## Product and build
- Android app: Java + WebView/JavaScript; package `ru.courier.finance.transfer`, version 1.7.36 / code 50. Installed baseline: 1.7.35 / code 49.
- Existing owner keystore is local at `signing/courier-transfer.jks` (ignored by Git); alias `courier-transfer`. Its established SHA-256 is `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`.
- Current signed candidate is `build/ci/Courier-Finance-Transfer-1.7.36-refactor-3d3ab25.apk`, SHA-256 `3f7bb979935891a43c408ed58e4183f27394fd73c0591f5e175be23abaf25a64`; v2/v3 signature verification passed and signer matches the established certificate.

## Refactor checkpoint
- `calculatePremiumCycle` delegates cycle-boundary selection and premium breakdown to focused helpers; forecast import separates video-slot and daily-history reconciliation, with a regression test protecting confirmed orders and accounted minutes from partial imports. Premium tests stayed 15/15.
- Pinned Crapper, Dryer and Mutator submodules live in `tools/quality/`; bootstrap with `sh tools/quality/bootstrap.sh`.

## Verification
- `npm test`: 238/238; Python unittest: 87/87; web preview returned HTTP 200 for `/`, `/app.mjs` and `/forecast.mjs`; `git diff --check`: PASS.
- Focused Mutator killed 4/4 `mergeHistoryDay` mutations, including prior survivor `true -> false`; the earlier `requiredOrderCount` probe also killed 4/4. Crapper ran without coverage: `mountForecast` CC 319 and `parseWorkbook` CC 94 (complexity counts, not CRAP scores). Dryer candidates were reviewed; no duplicate was merged by text similarity alone.
- [Android QA #94](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42128706692) and [UI audit #248](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42128706904) passed. UI audit ran Android 35 checks for navigation/forms, accessibility, XLSX import, large text and 1.7.35-to-1.7.36 upgrade/data retention using an isolated test signer.

## Remaining limits
- Direct installation over the user's production-signed 1.7.35 was not run: that exact old APK is unavailable in the checkout. The new APK's signer matches the established owner certificate; emulator upgrade/data-retention checks used a test signer.
- High-complexity `mountForecast` and `parseWorkbook` remain candidates for later focused extraction. Whole-project CRAP scores are unavailable because coverage was not supplied; Mutator was run on targeted critical logic, not every mutation site.

## Context size
- Active set (README, AGENTS, ARCHITECTURE, this file): 239→118 lines and 5,696→1,514 whitespace-delimited words; 50.6% fewer lines and 73.4% fewer words. A tokenizer is unavailable, so word count is the reproducible proxy.
