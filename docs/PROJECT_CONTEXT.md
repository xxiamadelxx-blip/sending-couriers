# Project context

Updated 2026-11-05. Continue from this checkpoint; do not repeat completed checks or reset work.

## Checkpoint

- Branch `refactor/deep-cleanup-20261104-recovered`; refactor source checkpoint `5dfc43c319d07d4d89c1b931610f2795aa9d01d2`; QA fix commit `7d8d3a127d64ac128886132173b03907c2bdd09a`. Local commits are ahead of the remote branch and not pushed; `main` is unchanged.
- Product APK source is transfer package `ru.courier.finance.transfer`, version 1.7.36 / code 50. User's installed release is 1.7.35 / code 49. Product source is unchanged by the QA fix.

## Stages

| Stage | Status | Record |
|---|---|---|
| 1. UB-mode/tool check | Partial | Existing ub-mode instructions read/applied; slash command unavailable. Crapper/Dryer/Mutator inspected, not run on JavaScript logic. |
| 2. Recovery/baseline | Partial | Recovered existing PR branch. No new full audit or main comparison in this continuation. |
| 3. Context/docs | Partial | README and AGENTS shortened; architecture and this checkpoint added. Historical acceptance documents retained. Full archive review remains. |
| 4. Architecture/code review | In progress | Existing refactor retained. This continuation changed QA scripts/tests only; no full source audit repeated. |
| 5. Regression tests | Partial | JS 227/227 and Python 85/85 pass locally. Added the `ceil(rate × hours)` fractional boundary case. Fresh Android run after QA changes is still needed. |
| 6. Refactor | In progress | Current code change corrects stale Android QA expectations and adds payment-settings scroll/tap coverage; product behavior unchanged. |
| 7. Metrics | Partial | A temporary floor-rounding mutation was caught. Crapper/Dryer/Mutator were not run; `jscpd` offline preflight returned `ENOTCACHED`, so no duplication scan or whole-project complexity metric is claimed. |

## Evidence

- Web preview: `/`, `/app.mjs`, and 360 px preview returned HTTP 200. `py_compile` and `git diff --check` passed for the QA change.
- `npm test`: 227 passed, 0 failed. `python3 -m unittest discover -s tests -v`: 85 passed, 0 failed.
- Mutation check: replacing `ceil` with `floor` in an ignored copy of `web/core.mjs` failed the fractional-target assertions as expected; the checked-in formula was not changed.
- Documentation inventory covered 62 Markdown files: no byte-identical duplicates. The matching `FORECAST_1.7.4` filenames are a short source spec and a separate release-acceptance record, so both remain. Heuristic unreferenced candidates still need review; none were deleted.
- Saved XML replay from [Android run 41991329995](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/41991329995): 36 layouts / 252 touch targets and visible labels passed. Replay is not a new emulator run.
- That run's synthetic-signer upgrade gate retained 4 h, 8 orders and 1,200 RUB. It did not use the owner signer. The run overall failed its then-current action-layout, field-label and large-font-history checks; local changes correct those expectations, but have not been run on Android CI.
- `build/Courier-1.7.36.apk` was signed from the existing transfer CI artifact with the old key. APK SHA-256 `7feabe2910b86b34afc7b2970dd44cb129016f05eab9c72c5bab63071c9b93a7`; signer SHA-256 `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`, matching 1.7.35. APK is local and ignored.

## Remaining

- Fresh Android CI on the QA-fix commit; then resolve only demonstrated failures and repeat affected gates. Local SDK/adb/Gradle/apksigner executables are absent; use the existing `.github/workflows/ui-audit.yml` path.
- Owner-signed APK installation/data retention has not been exercised in an emulator. The earlier synthetic-signer test is limited evidence, not owner-signed update PASS.
- The prior push of the QA commit was rejected by automatic review as an unapproved external publication. Do not bypass it. Local commits remain unpushed; `main` stays untouched.
- Continue the remaining documentation consolidation and engineering metrics after the Android gate. Local suite counts and saved CI evidence above are current; old SHA results do not certify a new run.

## Context size

Before cleanup: README + AGENTS + this context were 239 lines / 5,696 words. After cleanup: README + AGENTS + ARCHITECTURE + this context are 126 lines / 1,676 words (47.3% fewer lines and 70.6% fewer words). Exact tokenizer counts are unavailable; word count is the reproducible proxy. Detailed acceptance records remain intact.
