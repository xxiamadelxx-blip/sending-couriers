# Period closure form visual proposal · 28 October 2026

**Status: OWNER APPROVED ILLUSTRATION; IMPLEMENTATION CODED; ANDROID VISUAL REVIEW PENDING.** The owner explicitly replied «Да, реализуйте эскиз». Approval authorizes the scoped form layout and copy; it is not an implemented visual PASS.

## Current and proposed state

The current form is reachable from History via «Закрытие периода». It shows the selected period, one required signed «Финальная доплата» input, an optional note, and «Сохранить закрытие». An existing closure also offers «Снять отметку о закрытии». Current browser previews are local `design/review/closure-browser-current-{360-dark,360-light,390-dark}.png`.

The proposed browser illustration is local `design/review/closure-browser-concept-{360-dark,360-light,390-dark}.png`. It groups the existing period, amount, and note in separate SHIFT CONTROL panels and adds concise explanations that the supplement is factual, slot records remain editable, and a closure can later be changed. The back action, theme toggle, required explicit amount including zero, optional note, Save action, and existing remove-closure action remain. Storage, formulas, history navigation, and meaning of a closure must remain unchanged.

The proposal images are browser renderings of a temporary DOM/CSS prototype, not Android screenshots. A real Android 35 baseline capture for the current form was added to the UI audit at source `3eac77ed4fa11846f04309db0aff3b58ee4b44cb`. Run #40659077413 captured `closure-360-dark.png`, then failed because the new QA script expected title case «История» after Back while the actual heading is «ИСТОРИЯ»; the Android screenshot and XML confirm the navigation succeeded. The corrected QA-only baseline is source `c82378f8ab17fcd1ab13d8896df0bf7a928ab2c7`, run [#40660764037](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40660764037), artifact [#12804584427](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40660764037/artifacts/12804584427). The scoped implementation changes only `closure()` markup and `.closure-page` styles. Local browser interaction verified explicit required amount, saving zero, re-opening the stored note, and removing the closure. Do not re-show the accepted import/export/empty-History images.

## Implemented Android review

The exact implementation source is `74129b78a996b27bc91cecd284eb8345987bd5dd`, Android 35 run [#40664034027](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40664034027), artifact [#12806124280](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40664034027/artifacts/12806124280). GitHub's pull-request merge SHA is `6a39ab0babadad23571c2f771d5bc1b8c75703c4`. Both artifacts contain `ui-after/closure-{360,390}-{dark,light}.png` and matching native XML. Local untracked copies are `design/review/closure-android-{before,after}-{360,390}-{dark,light}.png`.

All eight native images were visually inspected in matched width and theme pairs on the same synthetic period and blank closure form. The new period panel, grouped amount and note fields, explanatory copy and Save action are visible and readable; no text or action is clipped in any of the four implemented views. This is an independent visual observation. **Owner verdict on implemented Android appearance: PENDING.**

The new source's native `ui_matrix`, action layout, repeated XLSX import, and temporary-signer transfer upgrade are PASS. Overall CI remains **FAIL** due the previously known `native_edit_labels` and `large_font_form` gates. An owner-signed Android upgrade and TalkBack speech were not tested; the overall release remains **NOT READY**.
