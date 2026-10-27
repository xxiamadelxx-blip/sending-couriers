# Empty History: design proposal, not implemented · 27 Oct 2026

**OWNER APPROVAL: PENDING.** The user approved the populated History and Period designs, **not** a redesign of the empty History state or its actions. Do not implement this proposal until owner reviews the **ordinary PNG comparison** and explicitly approves it. Design is accepted ONLY visually; no CI/layout/XML gate can establish aesthetic PASS.

## Grounded Android reference
- Repo: `xxiamadelxx-blip/sending-couriers`, UI branch `ui/audit-issue-3`.
- Current visual state reference: Android 35 `ui-after/00-empty-history-390-dark.png`, previously captured in [run #40306989532](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40306989532).
- Exact screenshot retains: app title **ИСТОРИЯ**, the period navigator (left/right arrows and interval), fixed **five actual nav actions** including central Add-slot `+`.
- Existing empty message: **Пока нет записей**, description **Добавьте часы, заказы и выплаты за слот**. Existing ungrouped actions: Export for ChatGPT, Close period, Import JSON. Do not invent data.

## Proposed content-only layout
- Replace dashed box with a slate, coral left-rail empty-state panel and clear headline. Keep all labels factual, no synthetic forecast or earnings.
- Add **Добавить слот** shortcut as a proposed new prominent CTA, which would need to reuse the existing `form()` action. This is **not currently implemented** and owner approval is explicitly required.
- Visually group the three pre-existing actions `Экспорт для ChatGPT`, `Импорт JSON`, and `Закрытие периода` as readable rows with subtitles. Preserve their original semantics. No new business behaviors are approved.
- Retain the original status bar, header, **period picker** and fixed bottom navigation **pixel-identically** in the illustration. The early first draft was **REJECTED BEFORE PRESENTATION** because it mistakenly obscured the period picker and rendered broken pseudo-icons. The corrected comparison uses text, vector chevrons, no missing glyphs. This is only a proposal, not native implementation.

## Review artifacts in the current conversation
- `/mnt/data/courier-empty-history-review/history-empty-before-proposal.png`: two-column comparison, real native screenshot on left and clearly labeled proposed image on right.
- `/mnt/data/courier-empty-history-review/history-empty-current-android.png`: real Android original.
- `/mnt/data/courier-empty-history-review/history-empty-concept-fixed.png`: clearly non-implemented concept. Header/period picker and lower nav crop verified identical to source bytes.
- No repository attachment URL is claimed for the local PNGs. Recreate from exact source screenshot if session is lost.

## Previous milestone: approved Forecast
- Owner approved the right-hand Forecast variant **except for the mockup's altered tab icons**. The original 5 actions and actual icons must remain unchanged.
- Production Forecast changes through commit [`54aeba8c`](https://github.com/xxiamadelxx-blip/sending-couriers/commit/54aeba8ca62af4dd02e356f895ddea7c09805968) visually inspected on real Android 35, [CI #40466490750](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750), [artifact #12716949585](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750/artifacts/12716949585): compact honest insufficient-data card, both visible 14h/8h sliders, visible idle-time footnote, **unaltered original bottom bar**. First-view bottom edge includes top part of Import button; navigation remains scrollable.
- Engineering gate: `ui_matrix`, `action_layout`, `xlsx_import`, `transfer_upgrade` PASS. Historical XML field-label diagnostic and 200% font test FAIL remain separate, excluded from design acceptance by owner. **Forecast final owner visual PASS: PENDING.** Test-signed APK does not mean owner-signed release.

## Following stage sequence
1. Present the **PNG** for empty History in mobile-readable format and obtain approval/rejection.
2. If approved, implement ONLY approved content, preserve period picker/nav and existing behavior. Validate actual Android 360/390 dark/light screenshots and owner visual verdict.
3. Independently review import/export dialogs visually without changing functionality; propose any large layout changes before editing.
4. Release hardening with owner-signed update only after separate functional acceptance.

No change to production UI or calculators is authorized by the empty-History proposal alone.
