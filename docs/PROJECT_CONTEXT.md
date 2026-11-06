# Project context

Canonical development line: `refactor/deep-cleanup-20261104-recovered` (PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19)). Do not restart the completed audit or create another feature/refactor branch. `main` is still the older baseline; the active refactor has not been merged. Older PRs #1, #4–#10, #13, #14, #17 and #18 were closed on 2026-11-06, leaving only PR #19 open. Closure did not delete their branches.

## Product and signing
- **Current version: 1.7.36 / versionCode 50**, Android package `ru.courier.finance.transfer`. The owner reports 1.7.36 is already installed. Do not treat upgrading from 1.7.35 as the current task.
- Existing release keystore: `signing/courier-transfer.jks`; password file: `signing/password.txt`; alias `courier-transfer`. Private files are ignored by Git. They were confirmed in the previous shared checkout; a fresh Git clone does **not** contain them. Before declaring them missing, inspect those exact paths in the active execution workspace. Never generate a replacement key or publish the originals.
- Owner certificate SHA-256: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`.
- Previously verified owner-signed 1.7.36 APK SHA-256: `3f7bb979935891a43c408ed58e4183f27394fd73c0591f5e175be23abaf25a64` (v2/v3 PASS). GitHub Actions publishes test-signed/unsigned artifacts, not this owner-signed release. Do not substitute them.

## Refactor checkpoint
- `calculatePremiumCycle`: cycle-boundary selection and premium breakdown extracted into focused helpers.
- Forecast import: video-slot and daily-history reconciliation separated. Regression checks protect confirmed orders and accounted minutes on partial imports.
- Crapper/Dryer/Mutator pinned as submodules under `tools/quality/`, bootstrapped with `sh tools/quality/bootstrap.sh`.
- Active context (README, AGENTS, ARCHITECTURE, PROJECT_CONTEXT) reduced from 239 to 118 lines and from 5,696 to 1,514 whitespace-delimited words at the previous checkpoint (50.6% fewer lines, 73.4% fewer words). Recount after further edits.

## Verified tests
- PR head `6e31b9eb03c49dd66e87d2e24af4c5847dbfe6f7`: [Android emulator QA #95](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42180078741) PASS and [UI audit #249](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42180078751) PASS, Android API 35. UI audit logs: JS 238/238, Android UI matrix, forms, accessibility, XLSX import, large font and test-signer upgrade gates PASS.
- Previous local checkpoint: Python unittest 87/87, `git diff --check` PASS. These were not repeated in full on the exact PR head.
- Targeted mutation probes: `mergeHistoryDay` 4/4 and `requiredOrderCount` 4/4 mutants killed. Whole-project CRAP scores unavailable without coverage.

## Scope and next step
- One active PR is not the same as one physical Git branch: historical branches still exist. Ten closed PR heads are ancestors of the active refactor branch; the M7 Sheets-sync experiment (#10) and M6 QA signer variant (#13) were deliberately not included. Preserve their historical records without reviving them as parallel work.
- Resume **the original code-cleanup task**, not release-version churn. Remaining high-complexity areas: `mountForecast` (CC 319), `parseWorkbook` (CC 94). Make only evidence-backed, behavior-preserving changes with regression tests.
- Before completing/merging, rerun tests on the final code SHA, verify user data and signing as applicable to the next actual release, inspect the diff and report any blocked acceptance gates. Do not merge to `main` based on old CI results.
