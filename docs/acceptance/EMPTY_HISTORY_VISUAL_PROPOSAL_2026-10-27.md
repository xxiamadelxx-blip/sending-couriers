# Empty History: revised visual proposal v2 · 27 October 2026

**STATUS: PROPOSED / OWNER APPROVAL PENDING. No production code changes.** The owner explicitly **rejected v1** of the empty History concept: the extra `Добавить слот` button duplicated the existing prominent center `+` of the persistent bottom navigation. Its label was also visually off-center. That CTA is **forbidden** in the revised concept, not merely repositioned. The approved populated History/Period and Forecast layouts do not imply automatic approval of this empty-state redesign.

## Real device source and scope

- Current target repository: `xxiamadelxx-blip/sending-couriers`, branch `ui/audit-issue-3`. Head at time of review `104ddf2b09f87cfa22d433aa285537fa995a6b8a`; only documentation changed beyond visual code SHA `54aeba8ca62af4dd02e356f895ddea7c09805968`.
- Actual Android35 baseline screen: `ui-after/00-empty-history-390-dark.png`, from [run #40466490750](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750), [artifact #12716949585](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40466490750/artifacts/12716949585).
- The default empty History still has the period selector, `Пока нет записей`, and three pre-existing actions `Экспорт для ChatGPT`, `Закрытие периода`, `Импорт JSON`. A center `+` already opens the Add-slot form on every screen. No new Add-slot action is needed in History.
- Source screenshot, illustrative image and Android native export dialog were inspected separately. The concept is composited from an **actual Android screenshot**; its newly designed content is **not a running Android implementation**.

## v2 proposal without duplicate Add-slot action

1. Keep all existing status bar / app title / period navigator / bottom navigation (including the fixed central `+`) **pixel-identical** to the real device screenshot.
2. Replace only the empty dashed container with one slate card, coral left rail and a legible empty-state message, explicitly communicating zero saved shifts, **without a CTA, a new flow, or an extra plus**.
3. Group only the **two existing data operations** in matching, easy-to-scan rows: `Экспорт для ChatGPT` and `Импорт JSON`. Their existing behavior, file processing and persistence remain unchanged.
4. Give the existing `Закрытие периода` action its own quieter row separated from import/export to avoid visually equating period closure with routine file actions. Do not hide, remove, or silently change that workflow.
5. Keep existing graphite/coral/orange SHIFT CONTROL colors and original nav icons. No new custom pictograms or unintelligible placeholder icons.

## Visual QA carried out before showing owner

- Original screenshot and v2 PNG are both 1170 × 2532 px. The original title/date selector region (rows 0..644 inclusive) and all persistent bottom/nav/system rows from 2140 onward were compared byte-for-byte and verified **identical** in the new concept. These are **source-fidelity safeguards only**, not designer acceptance criteria.
- Manually examined the full-size output: empty headline and both data operations are readable on a 390dp phone; `Закрытие периода` remains a separate action. No duplicate button `Добавить слот` appears in the proposed content.
- Conversation artifact paths (NOT GitHub repository files): `/mnt/data/empty_history_review_v2/current-android.png`, `/mnt/data/empty_history_review_v2/proposal-no-duplicate-add.png`. Never fabricate a GitHub binary attachment for these files.
- Only owner visual approval after reviewing the ordinary PNG authorizes implementation; the previous design rejected by owner stays **REJECTED**. Implementation would need fresh exact-SHA Android screenshots for final visual acceptance.

## Following independent stage: import/export dialogs

- Existing native `ui-after/export-dialog-360-dark.png` from the same Android 35 run was inspected: actions `Поделиться файлом`, `Сохранить файл`, `Резервная копия JSON`, `Закрыть` are currently present, with a native modal over the app.
- No permission to reorder, remove, duplicate or restyle these actions yet. Separate visual proposal would require review and explicit approval; never treat XML coordinates, build PASS, or screenshot capture alone as a visual design PASS.
- Functional Android UI matrix, named-action layout, repeated XLSX import and synthetic test-signed upgrade PASS in #40466490750; historical native edit-label XML and 200% font tests FAIL remain logged separately and are not part of the owner-requested design process. Actual owner-signed release APK still OPEN.

**Next action:** present the revised v2 empty History **PNG** directly in chat and request a design verdict. No production modifications until approved.
