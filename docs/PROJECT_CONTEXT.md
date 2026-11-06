# Project context

Canonical development line: `refactor/deep-cleanup-20261104-recovered` (PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19)). Keep one active line; do not create branches or merge to `main`. Older PRs #1, #4–#10, #13, #14, #17 and #18 were closed on 2026-11-06; their branches remain historical.

## Release and signing
- Current: version **1.7.36 / code 50**, package `ru.courier.finance.transfer`; the owner reports 1.7.36 installed.
- Release key paths: `signing/courier-transfer.jks` and `signing/password.txt`, alias `courier-transfer`. Private files are ignored. They were present in the prior shared checkout; check those exact workspace paths before declaring them missing. Never generate a replacement key or publish key material.
- Owner certificate SHA-256: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`. Previously verified owner-signed 1.7.36 APK SHA-256: `3f7bb979935891a43c408ed58e4183f27394fd73c0591f5e175be23abaf25a64` (v2/v3 PASS). CI artifacts use a test signer and are not substitutes.

## Refactor checkpoint
- Completed earlier: `calculatePremiumCycle` helper extraction; video-slot and daily-history reconciliation separation; active docs consolidation. Crapper, Dryer and Mutator are pinned under `tools/quality/`; bootstrap with `sh tools/quality/bootstrap.sh`.
- This change extracts `parseWorkbook` into summary, shift-reconciliation, order-evidence and archive helpers; `mountForecast` now delegates to separate screen renderers through one context. Public import and screen APIs remain unchanged.
- Active docs (README, AGENTS, ARCHITECTURE and this file) total 118 lines / 1474 whitespace-separated words, down from 239 / 5,696 (50.6% fewer lines; 74.1% fewer words).

## Verification
- Code commit `b699c9e3375d0e68fb76b0078e4325c883c12ff8`: `npm test` 239/239 and Python unittest 87/87 PASS; `parseWorkbook` differential check across 120 deterministic cases PASS; five-screen HTML and targeted save/import/navigation comparisons PASS.
- [Android emulator QA #97](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42272810470) and [UI audit #251](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42272810475) PASS on Android 35 for that code commit; audit evidence is attached to the runs.
- This workspace had no git checkout, local emulator or materialized quality-tool submodules. Changed-file whitespace review passed; no local whole-repository CRAP report was produced.

## Next step
Initialize the pinned Crapper submodule and produce a fresh complexity report before choosing the next code-cleanup target. Keep `main` unchanged.
