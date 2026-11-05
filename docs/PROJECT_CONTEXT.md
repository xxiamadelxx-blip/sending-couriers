# Project context — updated 2026-11-05; continue from this checkpoint without repeating the full audit.

## Checkpoint
- Branch `refactor/deep-cleanup-20261104-recovered`; `main` unchanged. Draft [PR #19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) is open at remote commit `8a3b8fd570cc9b745e5f77ce1fa29d28bc9a42da`. Its tree `fcab9f95ec33a343f218bc649c379b2ce4f7bf3c` matches local `HEAD` `cae106767ddbd6a1fc89c9f1285cda27abb6f8f7`. The PR head was advanced from `925128c3fe136cf68124951d176d3eba8369478c` without force. The local shell lacked push credentials, so GitHub received one consolidated snapshot commit; the full small-step history remains in this checkout. Android QA #88 and UI audit #242 are running. `main` is unchanged.
- Product: `ru.courier.finance.transfer`, 1.7.36/code 50; installed baseline 1.7.35/code 49. Product files match CI source tree `ac414438a036bdd88a7e957181e0bd022db03bd5` / SHA `925128c3fe136cf68124951d176d3eba8369478c`.
- Production key is present in this shared checkout: `signing/courier-transfer.jks`, `signing/password.txt`; alias `courier-transfer`, certificate SHA-256 `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`. Files are ignored by Git; never delete, replace or publish them.
- Signed candidate: `build/refactor-release/Courier-Finance-Transfer-1.7.36-refactor-75a5902.apk`; SHA-256 `c9a22fa8fcf0237828555427a50c30efa554636c852aa390fd089741901799d9`.

## Milestones
1. Audit/context: PARTIAL; 2. code audit: PARTIAL; 3. baseline: PASS; 4. refactor: IN PROGRESS; 5. verification: PASS for current changes; 6. repository cleanup: PASS; 7. final acceptance: PARTIAL.

## Verification
- After the merge commit, `npm test`: 234/234 PASS; `python3 -m unittest discover -s tests -v`: 87/87 PASS. Signing-policy tests confirm fail-closed release behavior; Python compilation and workflow YAML parsing PASS. `apksigner` is not installed here; APK signature and production-certificate verification were completed on the unchanged candidate before the documentation-only merge.
- Previous head: [UI audit #241](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42061930895) and [Android QA #87](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42061931069) PASS on the product source tree. Current head: [Android QA #88](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42108720447) and [UI audit #242](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42108720517) IN PROGRESS; required before updating final acceptance.
- Android 35 synthetic-signer update 1.7.35→1.7.36 retained 4 hours, 8 orders and 1,200 RUB. It does not exercise the production key.
- Candidate package/version, all 31 WebView assets, APK ZIP, v2/v3 signatures and production certificate: PASS. Build/test scripts and signing files are excluded from the distributable APK/source package.
- Cleanup removed two confirmed partial downloads and `.idsig` sidecars; no keystore/password is tracked. No other files were removed without proof they were disposable.

## Remaining
- `bindIntervals` DOM event paths lack direct local unit tests; the Android UI matrix passed.
- Crapper/Dryer/Mutator were not run. `jscpd` was unavailable from the offline cache (`ENOTCACHED`); duplication and whole-project complexity metrics remain unmeasured.
- Production-signer installation/update on a device is NOT RUN. Local Android SDK/adb are unavailable. Do not claim user-data retention was verified with the production signer.
- The refactor is not ready to merge until remaining code review/quality checks are resolved and final acceptance is updated.

## Context size
Before cleanup: README + AGENTS + PROJECT_CONTEXT, 239 lines / 5,696 whitespace-delimited words. Current active docs: README + AGENTS + ARCHITECTURE + PROJECT_CONTEXT, 119 lines / 1,614 words: 50.2% fewer lines and 71.7% fewer words. Tokenizer is unavailable, so words are the reproducible proxy.
