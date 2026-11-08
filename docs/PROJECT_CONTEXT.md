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
- Formula-gate commit: `37c94919ccefcd761a24bdf97c38fcf5a60c431e`; it changed CI mutation targeting and dedicated regression tests, not application runtime behavior.
- Context-only commit: `058f40103a96a0c55496eaef114f3d78a23c72ef`. It recorded the then-current OOM failure; a subsequent CI run on this same PR head succeeded without a source/workflow change.
- [UI audit #42418477418](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42418477418): **PASS** on PR head `058f40103a96a0c55496eaef114f3d78a23c72ef` (workflow checked out merge SHA `782e9d9c05344b76ce9010374becb54e516b950a`). Node tests **241/241 PASS**; all seven focused Python test groups passed; native bridge verifier passed schemas 1–6 and invalid/future/oversized-input rejection; test APK built successfully; transfer package metadata verified as `ru.courier.finance.transfer` version **1.7.36 / code 50**; prior baseline verified as **1.7.35 / code 49**; Android 35 gates `ui_matrix`, `action_layout`, `field_labels`, `xlsx_import`, `large_font_form` and `transfer_upgrade` all PASS. The CI test APK uses a temporary test signer and is not a production update.
- Same UI audit code-quality job: Crapper report generated; Dryer duplicate-Java scan completed; Mutator scan completed; critical `calculateScenario` mutation score **28/28 killed, 0 survived, 0 uncovered (100%, threshold 85%)**. Quality job PASS.
- [Android emulator QA #42418477501](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42418477501): **PASS** on Android 35. XLSX import was idempotent (backup retained two events on repeated import); backup/restore smoke confirmed finance and forecast facts survived uninstall/reinstall. QA artifact uploaded.
- UI audit evidence artifact: [ui-audit-782e9d9c05344b76ce9010374becb54e516b950a](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42418477418/artifacts/13593751859). Android QA artifact: [android-qa-782e9d9c05344b76ce9010374becb54e516b950a](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42418477501/artifacts/13592478191). Test-only APK and unsigned transfer artifact are also available in the UI audit run; neither is a production-signed APK.
- The earlier Gradle `OutOfMemoryError` at run #42413446003 is superseded by the successful #42418477418 rerun. No Gradle memory change was needed or made.
- Emulator logs contained graphics `ColorBuffer` warnings and transient adb connection retries, but the required gate commands exited 0 and the jobs completed successfully. Record the warnings; do not reinterpret them as app defects without reproducible evidence.
- [PR #19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) remains open on the canonical branch. `main` was not changed. No production-signed APK was generated or released in this run; installed-app update using the owner's signing identity is not proven by a temporary CI signer.
- The prior shared workspace did not expose a local git checkout or local emulator. Do not claim a local full-repository CRAP report; the pinned quality tools are run through CI.

## Current refactor state

- The focused critical-finance mutation gate is green at 100%; formula regressions include zero versus missing hours, fractional hours, premium threshold equality, reserve-minute calculation and unknown inputs.
- CI has now cleared the previously blocked APK-build and Android 35 UI audit path. Native bridge schema checks, transfer-upgrade comparison, XLSX import, backup/restore smoke, and the listed accessibility/layout gates passed.
- No application runtime code was changed during the latest context-only continuation. The latest successful evidence applies to PR head `058f40103a96a0c55496eaef114f3d78a23c72ef` and merge checkout `782e9d9c05344b76ce9010374becb54e516b950a`.
- Visual approval by the owner and a production-signed update APK are separate from these CI gates and remain unverified.


## Next step
Resume the next bounded source-refactor task on the canonical branch: inspect the remaining high-complexity and duplicated areas identified by the current Crapper/Dryer reports, select one concrete hotspot with clear responsibility overlap, add characterization tests first, and refactor only that hotspot. Keep the current public contracts, product behavior, UI and data stores unchanged. Re-run the affected tests plus the existing UI audit and Android QA after the source change; do not treat the successful current-SHA CI as proof for a later SHA.
