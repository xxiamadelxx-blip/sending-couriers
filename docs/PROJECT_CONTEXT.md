# Project context

Updated: 2026-11-05. This is the continuation checkpoint for the courier app refactor.

## Repository state

- Checkout: `refactor/deep-cleanup-20261104-recovered`.
- Starting refactor checkpoint: `5dfc43c319d07d4d89c1b931610f2795aa9d01d2`.
- Current local commit: `7d8d3a127d64ac128886132173b03907c2bdd09a` (`Fix Android QA gates for current UI flow`). It is one commit ahead of the GitHub branch; `main` is unchanged.
- Product code used for the 1.7.36 APK is unchanged between those two commits. The local commit changes Android QA scripts and tests only.
- Transfer package: `ru.courier.finance.transfer`, version `1.7.36`, versionCode `50`. The previous installed release is `1.7.35` / code `49`.

## Stage status

| Stage | Status | Evidence or remaining work |
|---|---|---|
| 1. UB-mode and tool check | Partial | The available ub-mode instructions were read and applied. The slash command was unavailable. Crapper, Dryer and Mutator requirements were inspected; none was run against the JavaScript application logic. |
| 2. Repository recovery and baseline | Partial | Work resumed from the existing refactor PR branch and its saved commit. No new full audit or main-branch comparison was performed in this continuation. |
| 3. Context cleanup and documentation | In progress | This file records the current checkpoint. README still contains stale release/history material; active-context size was not measured. Documentation consolidation remains open. |
| 4. Code and architecture review | In progress | The existing refactor branch is retained. This continuation changed QA checks only; it did not repeat the full source audit. |
| 5. Regression protection | Partial | Current local suites pass: JavaScript `npm test` 227/227 and Python unittest 85/85. Existing Android upgrade evidence is synthetic-signer-only; a fresh run after the QA fixes is still needed. |
| 6. Refactoring | In progress | The current checkpoint fixes stale Android QA expectations and adds a scroll/tap check for payment settings. Product behavior was not changed in this checkpoint. |
| 7. Complexity, duplication and mutation metrics | Not complete | Crapper/Dryer/Mutator were not run; no equivalent whole-project metrics or mutation run is recorded. |

## Verified at this checkpoint

- Local WebView preview via `preview.mjs`: `/`, `/app.mjs` and the 360 px preview shell returned HTTP 200.
- `npm test`: 227 passed, 0 failed.
- `python3 -m unittest discover -s tests -v`: 85 passed, 0 failed.
- Python compilation and `git diff --check`: passed for the changed QA files.
- Recorded Android XML replay from run [41991329995](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/41991329995): 36 layouts / 252 touch targets and visible-label checks passed. This replays saved evidence; it is not a new emulator run.
- That Android run's transfer-upgrade gate passed with a temporary test signer and retained synthetic state (4 hours, 8 orders, 1,200 RUB). It did not test the recovered owner signer.
- `build/Courier-1.7.36.apk` was made from the existing CI transfer artifact and signed with the existing owner key. APK SHA-256: `7feabe2910b86b34afc7b2970dd44cb129016f05eab9c72c5bab63071c9b93a7`. Its signer SHA-256 matches the 1.7.35 APK: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`.

## Open verification items

- CI run 41991329995 was overall **FAIL** on its original QA checks: action placement, outdated native field-label expectations, and case-sensitive large-font history navigation. The local commit updates those checks, but there is no fresh Android run on commit `7d8d3a1` yet.
- A previous `git push` of `7d8d3a1` was rejected by automatic review as an unapproved external publication. Do not bypass that decision. The commit remains local; fresh CI must be run on the updated branch when publication is authorized.
- Local Android SDK, `adb`, Gradle and `apksigner` executables are absent. Use the repository's existing GitHub Actions workflow for Android emulator checks; do not treat missing local tools as proof that the CI path is unavailable.
- No Android install/update check was run for the owner-signed APK. Do not claim end-to-end update/data preservation until the updated Android workflow confirms it. The previous synthetic-signer test is useful evidence, not a substitute for the owner-signed check.
- The APK in `build/` is a local, ignored artifact; it is not committed.

## Next step

Run the existing Android QA workflow on the current QA-fix commit. Resolve only failures demonstrated by that run, then repeat affected gates. Keep `main` unchanged. After Android verification, continue the unfinished documentation and engineering-metrics stages without repeating completed checks.
