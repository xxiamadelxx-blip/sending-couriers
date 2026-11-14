# Export dialog visual proposal · 27 October 2026

**Status: SCOPED EXPORT DIALOG VISUAL PASS BY OWNER ON REAL ANDROID 35 CAPTURES.** The owner first approved the illustration («Да, реализуйте эскиз»), then approved the implemented Android dialog («Да, окно устраивает»). This does not approve the overall UI-MVP release.

## Current Android evidence

The current dialog was reviewed from `ui-after/export-dialog-360-dark.png` in [Android 35 run #40506733392](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40506733392), [artifact #12735759862](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40506733392/artifacts/12735759862), implementation SHA `9506c68474279163a45f7e6b78b7effe75065ea8`. The local review copy is `design/review/export-dialog-android-current-360-dark.png` and is not committed.

## Proposed visual change

Two standalone browser-rendered illustrations at 360 CSS px, dark and light, were shown to the owner in this conversation as `design/review/export-dialog-concept-360-{dark,light}.png`. Their dimmed page backgrounds and navigation are schematic; only the dialog design is proposed.

- Retain the existing `Экспорт для ChatGPT` title and all four actions: share report, save report, JSON backup, and close.
- Add a selected-period label and one sentence explaining the report. The period must come from the current selected period, not the static date shown in the illustration.
- Rename the first two visible action labels to `Поделиться отчётом` and `Сохранить отчёт` while keeping their existing share/save behavior and Markdown report content.
- Separate the all-data JSON backup under `КОПИЯ ДАННЫХ`, with `Все записи для восстановления` as its subtitle. Its existing file and action behavior must remain.
- Keep a plain `Закрыть` action and the current SHIFT CONTROL palette. Do not change navigation, data, export formats, or screen destinations.

Owner approval of this illustration authorizes only this scoped dialog implementation. The implementation updates `web/index.html`, `web/app.mjs`, and scoped `web/style.css`, keeping the existing file actions, dialog ids, export content, and native share/save path. The period label is populated when the dialog opens. `npm test` passed (20/20), syntax and diff checks passed, and browser captures at 360/390 in both themes were inspected. Browser interaction verified open/close and Markdown/JSON downloads. Browser captures are not Android acceptance evidence.

## Implemented Android evidence

The final scoped source is `c740651eb6cda9e5d4d04ea760bf69c8dc7b5ebf` in [Android 35 run #40530403006](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40530403006), [artifact #12748480089](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40530403006/artifacts/12748480089). Four real captures, `ui-after/export-dialog-{360,390}-{dark,light}.png`, were visually inspected against the earlier Android dark 360 baseline and approved illustrations and shown to the owner. They are also available locally in the untracked `design/review/` folder. The owner's explicit response after viewing them was «Да, окно устраивает». **Visual status: PASS for this implemented export dialog only.**

The independent Android UI matrix, four-layout named-action audit, repeated XLSX import, and same-temporary-signer transfer upgrade gates passed. Full CI remains FAIL because the historical `native_edit_labels` and `large_font_form` diagnostics failed again. This is not a design verdict. A real owner-signed upgrade remains NOT RUN. The overall release is NOT READY.
