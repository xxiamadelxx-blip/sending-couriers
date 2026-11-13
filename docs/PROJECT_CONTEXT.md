# Project context

## Canonical line
- One active line: `refactor/deep-cleanup-20261104-recovered`, PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19), base `main`. Keep `main` unchanged until acceptance; do not create parallel work branches.
- App identity: **1.7.36 / versionCode 50**, package `ru.courier.finance.transfer`.
- At the recorded branch audit, PR heads #1, #4–#9 and #14–#18 were ancestors of this line; only PR #19 was open. Ahead-only feature, design, weather and QA branches were not accepted into the cleanup line. Keep their refs as history; do not merge them without a scoped requirement.

## Current implementation
- Active docs: 106 lines / 1,369 words, versus the recorded baseline of 239 lines / 5,696 words (55.6% fewer lines; 76.0% fewer words). Historical checkpoints are in [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md).
- `SheetFactNormalizer.normalize` dispatches to helpers for seven known sheets; mappings preserve prior field rules.
- `validCountModel` delegates nested row, fit and validation checks to focused helpers without changing its API or acceptance rules. Tests cover valid, baseline and malformed records. The generated worker bundle matches `tools/generate_forecast_worker.py`.
- `normalizeDay` delegates order evidence, pause conflicts and work-window exposure to pure `reconcileDayOrderEvidence`. It preserves conflict ordering, record shape and messages; characterization and the existing forecast suite pass on both the pre-change and refactored source.

## Verification and limits
- Use live checks on the exact PR head as the source of build and Android QA status. Older results apply only to their cited SHA.
- The last Crapper report was run on `eecfc405` in UI audit #281. With coverage disabled, CRAP scores were N/A. Highest product code CCs were `dayView` 69, `simpleView` 67, `ensureForecast` 57, `normalizeDay` 55, `weekView` 55 and `calculate` 54. `mountForecast` was CC 4; JS `parseWorkbook` was CC 5; Java `WorkbookReader.read` was CC 30.
- This workspace has no local Git checkout. Local `git status` and repository `git diff --check` are unavailable; inspect GitHub commit diffs and run source checks in isolated copies.
- CI APKs use a temporary signer and cannot update an installed production app. Owner visual approval remains separate.

## Next cleanup target
- After verifying the `normalizeDay` extraction on the new PR head, inspect `ensureForecast` and its callers. Characterize date windows, saved forecast revisions, merges and failure paths before changing its structure.