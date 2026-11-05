# Project context

Updated 2026-11-05. Continue from this checkpoint; do not repeat completed checks or reset work.

## Checkpoint

- Branch `refactor/deep-cleanup-20261104-recovered`; product/refactor base `5dfc43c319d07d4d89c1b931610f2795aa9d01d2`; earlier code/test checkpoint `0ce3a6637a1c9b38e0f84922dc7c0b73d820412d`; latest focused UI/test fix `a2fad5f91ddb9ca8086535f2f5945c4b05264da0`. The recovered branch was based on remote tree `842fe1add457d7a082e6555b91ac05eb16c4263a` (remote head before this follow-up: `2528a0b5cd42a24834b29d84dbfac65ff08714e6`). Local follow-up changes were committed in small checkpoints and mirrored as a consolidated tree commit above that remote baseline; no force update was used. `main` is unchanged.
- Product APK source is transfer package `ru.courier.finance.transfer`, version 1.7.36 / code 50. User's installed release is 1.7.35 / code 49. Product source is unchanged by the QA fix.

## Stages

| Stage | Status | Record |
|---|---|---|
| 1. UB-mode/tool check | Partial | Existing ub-mode instructions read/applied; slash command unavailable. Crapper/Dryer/Mutator inspected, not run on JavaScript logic. |
| 2. Recovery/baseline | Partial | Recovered and published the existing PR branch; `main` remains unchanged. No new full audit was repeated. |
| 3. Context/docs | Partial | README and AGENTS shortened; architecture and this checkpoint added. Historical acceptance documents retained. Full archive review remains. |
| 4. Architecture/code review | In progress | Existing refactor retained. This continuation fixed the missing next-day label for overnight interval inputs; no full source audit repeated. |
| 5. Regression tests | PASS with signer limitation | Current JS 234/234 and Python 85/85 pass locally. Tests cover finance, imports, preferences, interval boundaries and UI contracts. Fresh PR Android UI gates and Android smoke workflows pass; transfer upgrade used the workflow's temporary test signer. |
| 6. Refactor | In progress | QA expectations and payment-settings scroll/tap checks were corrected; the latest source fix labels overnight and midnight-ending work intervals clearly. Financial calculations and stored data are unchanged. |
| 7. Metrics | Partial | A temporary floor-rounding mutation was caught. Node coverage is recorded below. Crapper/Dryer/Mutator were not run; `jscpd` offline preflight returned `ENOTCACHED`, so no duplication scan or whole-project complexity metric is claimed. |

## Evidence

- Node's built-in coverage run used the exact test list from `npm test`: 234/234 passed; 92.94% line, 86.69% branch and 87.79% function coverage overall. `core.mjs` is 98.78% line / 91.75% branch; `forecast.mjs` 99.04% / 85.99%. DOM rendering/event wiring remains lower (`forecast-ui.mjs` 51.05% lines; `interval-control.mjs` 48.28% lines / 77.27% branches). The seven interval-control tests caught and cover the overnight/midnight label defect. This is not presented as full UI coverage.
- A separate broad `node --test tests/*.test.mjs` attempt failed because it included browser/legacy tests outside the supported `npm test` list; the local headless Chromium binary is absent at `tools/headless/chrome-headless-shell-linux64/chrome-headless-shell`. This failure is not counted as a regression or a passing check. No Chromium install or repeat of that wildcard run was attempted.

- Web preview: `/`, `/app.mjs`, and 360 px preview returned HTTP 200. `py_compile` and `git diff --check` passed for the QA change.
- `npm test`: 234 passed, 0 failed. `python3 -m unittest discover -s tests -v`: 85 passed, 0 failed. `node --test tests/interval-control.test.mjs`: 7 passed, 0 failed.
- Mutation check: replacing `ceil` with `floor` in an ignored copy of `web/core.mjs` failed the fractional-target assertions as expected; the checked-in formula was not changed.
- Fresh CI for PR merge SHA `88679fdc676b8f590d2ef174eefa2034b8e1468f`: [UI audit run #239](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42011058931) passed `ui_matrix`, `action_layout`, `field_labels`, `xlsx_import`, `large_font_form`, and `transfer_upgrade`. The transfer upgrade retained one slot (4 h, 8 orders, 1,200 RUB); the gate uses a temporary same-signer test key, not the production key.
- [Android emulator QA run #85](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/42011058926) passed: 1.7.8→1.7.11 smoke, idempotent XLSX re-import, and Auto Backup persistence across uninstall/reinstall. This is supporting Android coverage, not a 1.7.35 production-signer update test.
- Documentation inventory covered 62 Markdown files: no byte-identical duplicates. The matching `FORECAST_1.7.4` filenames are a short source spec and a separate release-acceptance record, so both remain. Review of likely stale candidates found they are referenced historical requirements/release evidence; prominent version-scoped notices now point to this context. No unique requirements were deleted.
- Saved XML replay from [Android run 41991329995](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/41991329995): 36 layouts / 252 touch targets and visible labels passed. Replay is not a new emulator run.
- That earlier run's synthetic-signer upgrade gate retained 4 h, 8 orders and 1,200 RUB, but it did not use the owner signer. It failed then-current action-layout, field-label and large-font-history checks; the fixes were included in the later run #239, where all six gates passed.
- `build/Courier-1.7.36.apk` was signed from the existing transfer CI artifact with the old key. APK SHA-256 `7feabe2910b86b34afc7b2970dd44cb129016f05eab9c72c5bab63071c9b93a7`; signer SHA-256 `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`, matching 1.7.35. APK is local and ignored.

## Remaining

- The `bindIntervals` DOM event paths are not directly exercised in local Node tests; selected Android UI gates cover product flows, but this recent label-only patch has not been rebuilt into an APK or re-run on Android. Do not raise coverage by adding a mock DOM solely for a metric.

- The existing `build/Courier-1.7.36.apk` has the matching 1.7.35 certificate and package/version `ru.courier.finance.transfer` / 1.7.36 (code 50), but it predates the latest interval-label source/test change. A direct emulator install of the production-signed 1.7.35→1.7.36 pair was not run. The production JKS is absent from this checkout and tracked history; `build.py` generates a key when none is present, which must not be used for a release. The existing CI path emits an unsigned transfer APK for owner signing; no owner-signer input is available here. Do not claim a current-source signed APK or direct production-signer upgrade test.
- Crapper/Dryer/Mutator were inspected but not run against this JavaScript project. `jscpd` could not be installed from the offline package cache (`ENOTCACHED`). The manual mutation check passed; structural duplication and whole-project complexity metrics remain unmeasured.
- Run a compatible structural-duplication/complexity check if an offline tool becomes available; do not repeat the completed Android CI or full audit. Local SDK/adb/Gradle/apksigner executables remain absent; use the repository's existing CI build path when a new Android build is needed.

## Context size

Before cleanup: README + AGENTS + this context were 239 lines / 5,696 whitespace-delimited words. Current active docs (README + AGENTS + ARCHITECTURE + this context) are 132 lines / 2,066 words (44.8% fewer lines and 63.7% fewer words). A tokenizer is unavailable, so word count is the reproducible proxy. Detailed acceptance records remain intact.
