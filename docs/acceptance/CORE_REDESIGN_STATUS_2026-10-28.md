# Core UI redesign status · 28 October 2026

This is the current scope check after the owner asked whether the main redesign was complete. **Answer: no.** Do not spend another cycle on accepted screen spacing until the remaining product surfaces are treated. The live reference is `docs/acceptance/UI_MVP_RELEASE_2026-10-25.md`; all visual PASS decisions require real Android images and explicit owner acceptance under `AGENTS.md`.

| Surface | Current state | Next material work |
| --- | --- | --- |
| Home, Period, populated History, Forecast, Add Slot | SHIFT CONTROL layout present; Android 35 screen matrix captured at 360/390 dp in both themes, but no global owner acceptance of every state | Final paired review after remaining core surfaces are complete |
| Empty History, export and import preview dialogs, blank closure form | Implemented and individually accepted by owner after Android screenshots; see their scoped acceptance files | Preserve; do not repeat their images unless they change |
| Settings tariff and standard 360 dp slot keyboard | Scoped fixes individually accepted after Android screenshots | Preserve; finish remaining settings states |
| Eight payment conditions | Current source exposes the rate and an expanded list under “Остальные условия”; `docs/UI_CHANGE_1.7.6.md` calls for eight horizontal pages, so the requested interaction and current source need reconciliation | Restore the requested interaction within the approved Settings look, then inspect all conditions on Android |
| Editing and deleting an existing slot | Actions exist; native confirmation and complete visual states have not been shown for final acceptance | Capture before/after, then finish the edit/delete and error states |
| Appearance, sound, feedback, fatal recovery | Functional controls exist; full visual review and owner acceptance are still open | Complete these states as part of Settings and system feedback |
| Launcher icon and startup | Android assets still use the former green identity and old launch colors | Current SHIFT CONTROL startup proposal awaits prior owner approval; then implement and capture Android |
| Overall release | Full Android CI still FAIL on historical native edit-label and 200% font-form diagnostics; owner-signed on-device upgrade NOT RUN | Keep separate from visual judgments; no release claim |

The immediate redesign priority is startup identity, then the unreviewed Settings/edit/delete/error surfaces. The latest accepted color change on the Home premium text is complete and is not a reason to revisit the Home design.
