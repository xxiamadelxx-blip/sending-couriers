# Project rules

## Source of truth

- Read `docs/PROJECT_CONTEXT.md` first, then this file and the relevant acceptance document.
- Verify version/package in `app/build.gradle`; verify behavior in current source and current-SHA test results. Older reports describe only their cited SHA.
- Financial rules and pure calculations live in `web/core.mjs`; screen state and persistence adapters are coordinated by `web/app.mjs`. Android integration is in `android/src/ru/courier/finance/`; the WebView contract is `CourierNative` in `MainActivity`.

## Changes and tests

- Preserve existing behavior, user facts and settings. Never clear user data or weaken a failing test to obtain PASS.
- Use ub-mode: first reproduce behavior, add/fix a regression test, make the smallest change, run affected checks, inspect the diff, then commit one coherent step.
- Run `npm test` and `python3 -m unittest discover -s tests -v` for code changes. Run `git diff --check` before committing.
- For Android changes, use the existing `.github/workflows/ui-audit.yml` emulator path and report the exact commit, run and artifact. A local build, old CI result, screenshot, XML check or synthetic signer does not prove other gates.
- Keep `main` unchanged until accepted. Record PASS, FAIL, BLOCKED or NOT RUN; do not infer a result for a check that did not execute.

## Product and release safeguards

- Keep financial calculations local; do not add an AI dependency, paid API or server to the calculation path. Preserve unknown values as unknown and keep money, hours, active work and slot duration semantically distinct.
- Do not alter application IDs, signing identity or existing data migrations without explicit product need and regression evidence. Never generate a replacement release key, commit a keystore/password, or publish signing material.
- For updates to `ru.courier.finance.transfer`, first check the existing local files `signing/courier-transfer.jks` and `signing/password.txt` (ignored by Git). Alias: `courier-transfer`; certificate SHA-256: `eed086d5bdb63dd425494f3a585e90243224c0305eda4ff40845d7744f7a5ef1`. Do not report the key missing before checking those exact paths. Build transfer releases without `--test-signing`; that flag creates a QA-only signer and cannot update the installed app.
- Never delete or replace those production signing files. Before any cleanup command, preserve `signing/`; ignored signing files are private credentials, not disposable build output.
- Do not make visual redesign changes without the owner's approval. Technical layout checks do not constitute visual approval; visual PASS requires owner review of real Android captures.
- Keep private user data out of logs and artifacts. Make project changes in this repository; keep local build outputs in ignored `build/`.

## Completion

Summarize what changed, the exact commit, commands and observed results, remaining NOT RUN/BLOCKED checks, and the next unfinished stage. Do not call the project or a release complete while required acceptance gates remain open.
