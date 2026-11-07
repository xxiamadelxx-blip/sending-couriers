# Project context

Canonical development line: `refactor/deep-cleanup-20261104-recovered` (PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19)). Keep one active line; do not create branches or merge to `main`. Older PRs #1, #4–#10, #13, #14, #17 and #18 were closed on 2026-11-06; their branches remain historical.

## Release and signing
- Current: version **1.7.36 / code 50**, package `ru.courier.finance.transfer`; the owner reports 1.7.36 installed.
- Release key paths: `signing/courier-transfer.jks` and `signing/password.txt`, alias `courier-transfer`. Private files are ignored. They were present in the prior shared checkout; check those exact workspace paths before declaring them missing. Never generate a replacement key or publish key material.
- Owner certificate SHA-256: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`. Previously verified owner-signed 1.7.36 APK SHA-256: `3f7bb979935891a43c408ed58e4183f27394fd73c0591f5e175be23abaf25a64` (v2/v3 PASS). CI artifacts use a test signer and are not substitutes.

## Refactor checkpoint
- Completed earlier: `calculatePremiumCycle` helper extraction; video-slot and daily-history reconciliation separation; active docs consolidation. Crapper, Dryer and Mutator are pinned under `tools/quality/`; bootstrap with `sh tools/quality/bootstrap.sh`.
- This change extracts `parseWorkbook` into summary, shift-reconciliation, order-evidence and archive helpers; `mountForecast` now delegates to separate screen renderers through one context. Public import and screen APIs remain unchanged.
- Active docs (README, AGENTS, ARCHITECTURE and this file) total 119 lines / 1,474 whitespace-separated words, down from 239 / 5,696 (50.2% fewer lines; 74.1% fewer words).

## Verification

- Earlier refactor checkpoint at code commit `b699c9e3375d0e68fb76b0078e4325c883c12ff8`: `npm test` 239/239 and Python unittest 87/87 PASS; `parseWorkbook` differential check across 120 deterministic cases PASS; five-screen HTML and targeted save/import/navigation comparisons PASS.
- Latest context/test-gate commit: `37c94919ccefcd761a24bdf97c38fcf5a60c431e`. It changes only CI mutation targeting and dedicated regression tests; no application runtime code or product behavior changed in this continuation.
- [UI audit #42413446003](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42413446003): **FAIL**. The code-quality job passed. Mutator killed **28/28** mutations in `calculateScenario` (100%, required 85%; 0 survived, 0 uncovered). Android test-APK build failed with Java `OutOfMemoryError: Java heap space` during Gradle `:app:assembleRelease`; no audit evidence artifact was produced. This is an infrastructure/build-memory failure, not a signing-key failure.
- [Android emulator QA #42413446019](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42413446019): **PASS** on Android 35; `native-smoke` completed successfully and uploaded its QA artifact. This does not replace the failed UI-audit APK build or prove a production-signed update.
- [PR #19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) remains open on the canonical branch. `main` was not changed. No new production APK was built or released.
- The prior shared workspace did not expose a local git checkout or local emulator. Do not claim a local full-repository CRAP report; the pinned quality tools are run through CI.

## Current refactor state

- The dedicated mutation gate now measures the critical `calculateScenario` function with dynamically resolved source lines. Its current observed result is 28/28 killed.
- The new formula regression cases cover zero versus missing hours, fractional hours, premium threshold equality, reserve-minute calculation and unknown inputs. These tests are not a substitute for full app behavior QA.
- The Android 35 native smoke path is green; the separate UI-audit path is blocked by Gradle daemon heap exhaustion before APK generation.
- This is a documentation/context checkpoint only. No source-code or workflow edits are authorized by the latest instruction beyond keeping the context accurate.


## Next step
Resolve the CI Gradle heap exhaustion in the existing UI-audit build path, then rerun UI audit and Android QA on the resulting commit. Keep the current single branch and `main` unchanged; do not start another code-cleanup target until the failed APK-build gate is green.
