# Export dialog visual proposal · 27 October 2026

**Status: OWNER APPROVED ILLUSTRATION; SCOPED IMPLEMENTATION CODED; ANDROID VISUAL REVIEW PENDING.** The owner explicitly replied «Да, реализуйте эскиз». The illustrative previews and browser captures are not Android design evidence or a visual PASS.

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

Capture real Android 35 after images at 360 and 390 dp in both themes, visually inspect against the Android baseline and approved illustration, then ask for a separate owner verdict on the implemented screen. The overall release remains NOT READY.
