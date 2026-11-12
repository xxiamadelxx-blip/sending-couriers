# Project context

## Canonical line
- One active line: `refactor/deep-cleanup-20261104-recovered`, PR [#19](https://github.com/xxiamadelxx-blip/sending-couriers/pull/19), base `main`. Read the live PR head before editing; keep `main` unchanged.
- App identity: version **1.7.36 / code 50**, package `ru.courier.finance.transfer`.
- Compared branch heads: PRs #1, #4–#9 and #14–#18 are ancestors of this line. Ahead-only refs contain unmerged, unaccepted design, M5/M7 feature, weather-diagnostic and QA-only workflow work; they remain historical because they add behavior or duplicate CI outside this cleanup. Only PR #19 is open.

## Source and tests
- Active docs now total 108 lines / 1,338 words versus the recorded baseline of 239 lines / 5,696 words (54.8% fewer lines; 76.5% fewer words). Superseded checkpoints are in [the archive](archive/REFACTOR_CHECKPOINTS_2026-11.md).
- `SheetFactNormalizer.normalize` dispatches to named helpers for seven known sheets. Their mappings preserve the prior field rules; UI audit #278 passed this change on `377fac5e`.
- `validCountModel` delegates row, fit and validation checks to focused helpers without changing its public API or acceptance rules. Tests cover complete and baseline artifacts, malformed nested records, array limits and install filtering. The generated worker bundle is refreshed from this source.
- The prior and refactored validators passed the same 56-case differential matrix; focused characterization passed 2/2 against both versions. CI #278 passed on parent SHA `377fac5e1b5b7fc252aac3c93088dbf017e0b8cf`; those results do not replace checks on the live PR head.
- [UI audit #278](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/43320823306) passed all 30 steps, including Android 35. Its quality artifact is [13990955911](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/43320823306/artifacts/13990955911).
- [Android QA #124](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/43320822787) passed on its pinned 1.7.11 smoke APK; it does not prove an installed-app upgrade from 1.7.36.

## Limits and next action
- CI APKs use a temporary signer. No production-signed update was generated; owner visual approval remains separate.
- This workspace has no local Git checkout. Use the connected branch and current-SHA CI for repository changes; report local `git diff --check` as unavailable.
- After the current PR head passes, characterize `normalizeDay`'s evidence/conflict derivation and extract it only if the responsibility boundary is clear. Preserve data shape and all existing tests.
