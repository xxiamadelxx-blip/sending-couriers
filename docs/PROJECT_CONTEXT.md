# Project context — updated 2026-11-05; continue from this checkpoint without repeating the full audit.

## Checkpoint
- Branch `refactor/deep-cleanup-20261104-recovered`; `main` unchanged. Draft [PR #19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19) still points to `925128c3fe136cf68124951d176d3eba8369478c`. That upstream head is now an ancestor of local merge commit `8eaec46a9a88f93be8ff70d87d65f05743a0d5d4`; product tree is unchanged by the merge. Local verification passed; fast-forward the PR branch to publish the recovered acceptance/signing-policy commits, then keep it draft until remaining checks close.
- Product: `ru.courier.finance.transfer`, 1.7.36/code 50; installed baseline 1.7.35/code 49. Product files match CI source tree `ac414438a036bdd88a7e957181e0bd022db03bd5` / SHA `925128c3fe136cf68124951d176d3eba8369478c`.
- Production key is present in this shared checkout: `signing/courier-transfer.jks`, `signing/password.txt`; alias `courier-transfer`, certificate SHA-256 `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`. Files are ignored by Git; never delete, replace or publish them.
- Signed candidate: `build/refactor-release/Courier-Finance-Transfer-1.7.36-refactor-75a5902.apk`; SHA-256 `c9a22fa8fcf0237828555427a50c30efa554636c852aa390fd089741901799d9`.

## Milestones
1. Audit/context: PARTIAL; 2. code audit: PARTIAL; 3. baseline: PASS; 4. refactor: IN PROGRESS; 5. verification: PASS for current changes; 6. repository cleanup: PASS; 7. final acceptance: PARTIAL.

## Verification
- After the merge commit, `npm test`: 234/234 PASS; `python3 -m unittest discover -s tests -v`: 87/87 PASS. Signing-policy tests confirm fail-closed release behavior; Python compilation and workflow YAML parsing PASS. `apksigner` is not installed here; APK signature and production-certificate verification were completed on the unchanged candidate before the documentation-only merge.
- [UI audit #241](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42061930895) and [Android QA #87](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42061931069): PASS on the product source tree.
- Android 35 synthetic-signer update 1.7.35→1.7.36 retained 4 hours, 8 orders and 1,200 RUB. It does not exercise the production key.
- Candidate package/version, all 31 WebView assets, APK ZIP, v2/v3 signatures and production certificate: PASS. Build/test scripts and signing files are excluded from the distributable APK/source package.
- Cleanup removed two confirmed partial downloads and `.idsig` sidecars; no keystore/password is tracked. No other files were removed without proof they were disposable.

## Remaining
- `bindIntervals` DOM event paths lack direct local unit tests; the Android UI matrix passed.
- Crapper/Dryer/Mutator were not run. `jscpd` was unavailable from the offline cache (`ENOTCACHED`); duplication and whole-project complexity metrics remain unmeasured.
- Production-signer installation/update on a device is NOT RUN. Local Android SDK/adb are unavailable. Do not claim user-data retention was verified with the production signer.
- The refactor is not ready to merge until remaining code review/quality checks are resolved and final acceptance is updated.

## Context size
Before cleanup: README + AGENTS + PROJECT_CONTEXT, 239 lines / 5,696 whitespace-delimited words. Current active docs: README + AGENTS + ARCHITECTURE + PROJECT_CONTEXT, 119 lines / 1,585 words: 50.2% fewer lines and 72.2% fewer words. Tokenizer is unavailable, so words are the reproducible proxy.
