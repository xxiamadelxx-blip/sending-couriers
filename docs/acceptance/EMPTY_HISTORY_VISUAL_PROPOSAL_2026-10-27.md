# Empty History visual review, owner corrections · 27 October 2026

**CURRENT STATUS: REVISED CONCEPT IMPLEMENTED; REAL ANDROID 35 CAPTURES REVIEWED; OWNER VISUAL VERDICT PENDING.** The older v1/v2 sketches were rejected and the v3 draft was superseded by the reviewed illustration. Owner approval of that illustration authorized this scoped implementation, not a visual PASS for the Android build.

## What owner rejected

- v1 duplicated `Добавить слот` inside empty History, despite the ever-present center `+` in the native bottom navigation. Owner rejected this duplicate. Do not reinstate it.
- v2 removed the duplicate but had multiple visible visual defects: coral rail almost touched the section copy, the period-picker chevron appeared too close to the select field border, and the main action labels and captions were not centered. More seriously, the manual full-screen image painting **obscured the real period picker** in an earlier sample. The previously documented "pixel-identical period selector" claim for that earlier output was **incorrect**. The user clearly rejected this quality level.
- No plug-in automatically approved that poor mock. The underlying cause was placing graphic and text elements at unrelated pixel coordinates and failure to inspect the full-size composite before sharing it.

## Revised proposal v3, approved for implementation

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

The owner reviewed the revised **ordinary PNG** and approved implementation. The scoped change preserves actions, data, screen destinations and the complete bottom bar. Capture real Android screenshots at 360/390 in dark/light themes and show them before asking for owner visual PASS.

The next independently available design step is visual review of import/export dialogs. Do not change those dialogs before another owner-approved visual proposal. Work on tests and normal app functionality remains separate from design acceptance. The overall release is NOT READY.

## Current review artifact · 27 October 2026

The actual Android empty-History baseline is in the [Android35 run artifact #12716949585](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750/artifacts/12716949585), `ui-after/00-empty-history-390-dark.png`. A revised illustration generated from that Android screenshot was shown to the owner in this conversation; it is **not** a capture of an implemented APK and its unchanged-looking header, selector and navigation must not be treated as pixel-identical source regions. It keeps the existing period picker and central `+`, introduces no duplicate add action, and aligns the two section labels with the empty-card text. Action titles and secondary labels are visually centered between side icons.

**Owner decision: APPROVED FOR IMPLEMENTATION in the current conversation.** The scoped implementation is in `web/app.mjs` and `web/style.css`: empty History gets the approved card and action hierarchy; the native period selector keeps its function with an inset chevron, the five bottom actions remain, and populated History keeps its previous footer. Local browser renderings were captured at 360/390 in both themes and visually inspected; they are not committed source assets. Browser interactions verified period change, export open/close, closure navigation, and a saved populated slot. `npm test` and syntax/diff checks passed. These browser images are **not Android evidence**.

## Implemented Android 35 evidence

The implementation is source SHA `9506c68474279163a45f7e6b78b7effe75065ea8` in [CI run #40506733392](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40506733392), [artifact #12735759862](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40506733392/artifacts/12735759862). Its real Android captures are `ui-after/00-empty-history-{360,390}-{dark,light}.png`. All four were visually inspected and shown to the owner alongside the matched earlier Android baseline captures; the owner verdict on the implemented build is pending. **Visual status: NOT VERIFIED; no design PASS yet.**

The independent Android UI matrix, action layout, repeated XLSX import, and same-temporary-signer transfer upgrade gates passed on this SHA. The full CI run failed due the historical `native_edit_labels` diagnostic (blank UiAutomator EditText `content-desc`) and `large_font_form` 200% label clipping. These failures are preserved as FAIL and are not evidence for or against the visual design. A real owner-signed upgrade is still NOT RUN. Local review PNGs in `design/review/` are untracked and are not part of the submitted implementation.
