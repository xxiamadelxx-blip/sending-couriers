# JSON import dialog visual proposal · 27 October 2026

**Status: OWNER APPROVED ILLUSTRATION; SCOPED IMPLEMENTATION CODED; ANDROID VISUAL REVIEW PENDING.** The owner explicitly replied «Обобряю». The current and proposed images here are browser renderings with seven synthetic entries. They are not Android evidence or an implemented design PASS.

## Reviewed state

The existing import preview uses one sentence for counts, a dense paragraph for merge and 12-week cycle behavior, a primary Import action, and Cancel. The current browser renderings at 360/390 in dark/light themes were captured locally as `design/review/import-dialog-browser-before-{360,390}-{dark,light}.png`. The proposed browser renderings use the same app, width, themes, and synthetic counts as `design/review/import-dialog-concept-{360,390}-{dark,light}.png`. All were visually inspected. These local images are untracked and were shown in the conversation; no product code has changed for this proposal.

## Proposed scope

- Retain the existing Import and Cancel actions, JSON format, actual merge rules, error handling, and selected app navigation.
- Present the file preview counts as three cards: entries, days, and closed periods. Values must come from the normalized selected file; the illustrated 7/7/0 values are synthetic only.
- Explain that matching records are replaced while other slots remain.
- Place the existing 12-week start-date note in a separate compact notice so it does not visually merge with the record count.
- Keep the SHIFT CONTROL dark/light palette and a full-width primary Import action with a clear Cancel action.

Approval of these illustrations authorized only this dialog layout and copy. The implementation adds scoped dialog markup and styles while keeping the original import merge, cancellation, error, and persistence handlers. Counts are populated from the normalized selected file. The existing complete count sentence stays available to assistive technology, while the visual cards are marked as decorative to avoid duplicate announcements.

Browser renderings of the implementation were captured at 360/390 in both themes as local `design/review/import-dialog-browser-after-{360,390}-{dark,light}.png` and inspected. With a seven-entry synthetic JSON file, browser interaction confirmed 7/7/0 counts, cancellation without persistence, and confirmation with seven persisted records. These are not Android visual evidence. The Android QA matrix now opens the same synthetic JSON through DocumentsUI, captures all four modal variants, and cancels without committing the fixture. Real Android 35 captures and a separate owner verdict on the implemented dialog are still required. The overall release remains NOT READY.
