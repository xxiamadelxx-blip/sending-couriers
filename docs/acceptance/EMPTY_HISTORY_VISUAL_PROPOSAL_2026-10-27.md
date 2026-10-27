# Empty History visual review, owner corrections · 27 October 2026

**STATUS: VISUAL PROPOSAL v3, NOT APPROVED, NOT IMPLEMENTED.** No production app changes are authorized. This document supersedes misleading earlier descriptions of the v1/v2 sketches.

## What owner rejected

- v1 duplicated `Добавить слот` inside empty History, despite the ever-present center `+` in the native bottom navigation. Owner rejected this duplicate. Do not reinstate it.
- v2 removed the duplicate but had multiple visible visual defects: coral rail almost touched the section copy, the period-picker chevron appeared too close to the select field border, and the main action labels and captions were not centered. More seriously, the manual full-screen image painting **obscured the real period picker** in an earlier sample. The previously documented "pixel-identical period selector" claim for that earlier output was **incorrect**. The user clearly rejected this quality level.
- No plug-in automatically approved that poor mock. The underlying cause was placing graphic and text elements at unrelated pixel coordinates and failure to inspect the full-size composite before sharing it.

## Revised proposal v3, not yet submitted for owner approval

- True source: actual Android35 `ui-after/00-empty-history-390-dark.png` from [run #40466490750](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750), [artifact #12716949585](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750/artifacts/12716949585), app visual code SHA `54aeba8ca62af4dd02e356f895ddea7c09805968`.
- Reconstructed the **concept only** with browser-rendered CSS Grid and one shared spacing scale rather than manual per-label coordinates. This is an illustrative overlay, NOT a screenshot of a new APK.
- Under the existing (unaltered) Android status/header controls, all empty-state copy has an approximately 20dp common inset inside its graphite card, with a distinct coral rail on the left. The "РАБОТА С ДАННЫМИ" and "ДЕЙСТВИЕ С ПЕРИОДОМ" section labels align with that inset.
- The two existing Export/Import actions have symmetrically balanced invisible left and chevron right columns; title + optional secondary label use the center column and share its horizontal/vertical center, with consistent safe space around the right chevron. Closing the period remains in its original separate, less prominent action.
- Existing period selector remains visually present, only the concept's down-chevron is moved in from the right edge to give adequate visual clearance. **This picker-arrow change is a proposal**, not implemented or authorized in product code.
- Bottom navigation and center `+` were copied from the exact Android source with identical image bytes for the entire lower native navigation/system region. No nav/icon/style changes are proposed.
- Feedback from Better Design was used for consistent section-title/card-text insets and preserving the actual icon family; **plugin guidance is not visual acceptance**. The generated PNG was opened at full scale and visually inspected. Owner retains the only design PASS authority.
- Conversation output: `/mnt/data/history-visual-review-aligned/history-empty-aligned-concept.png`, plus mobile-size rendering `.../history-empty-aligned-390.png`, source comparison `/mnt/data/empty_history_review_v2/current-android.png`. The raster output is attached to the conversation only, not committed to GitHub; don't invent an attachment URL.
- Engineering checks verifying no accidental outside-the-scope image changes are not substituted for visual design acceptance.

## Scope and next stage

The user must review the **ordinary PNG itself** before any production implementation. If they approve it, edit only empty History content/spacing and selector-chevron inset to match v3, preserving actions, data, screen destinations and complete bottom bar. Then capture real Android screenshots at 360/390 in dark/light themes and show them before asking for owner visual PASS.

The next independently available design step is visual review of import/export dialogs. Do not change those dialogs before another owner-approved visual proposal. Work on tests and normal app functionality remains separate from design acceptance. The overall release is NOT READY.
