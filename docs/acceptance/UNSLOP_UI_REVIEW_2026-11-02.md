# Unslop UI audit · 2 November 2026

**Scope:** UI only, no forecast models, business logic, records, navigation, or storage changes. This is a **light-polish candidate**, not an approved release. Credit: [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop), CC BY 4.0.

## Verified baselines

- Base APK source branch: `release/forecast-video-upload-20261101`, commit `1ba9b0d04b47e0c15c99aa6ba0f8edd2d6b2ed25`. The APK obtained from GitHub Actions run [41415151486](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/41415151486) contains `assets/www/style.css`, `app.mjs`, and the other UI assets for source inspection. This run is an M4 build, **not a visual Android sign-off**.
- Historical Android 35 dark/light screenshots at 360/390 from [UI audit run 40846918821](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40846918821), artifact `ui-audit-a1340c1d23615893a68dbafc705930578236dda7`. They show Home, Period, Add Slot, Forecast and History, **but are from 29 October and a different SHA**; they are context only, not evidence for this candidate.
- Local technical checks of extracted release APK assets: JS syntax `node --check` PASS; CSS `tinycss2.parse_stylesheet` PASS after the two CSS edits. These checks **do not prove Android visual QA**.

## Android QA · SpawnDroid · 2 November 2026

- Candidate source: branch `ui/unslop-light-polish-20261102`, commit `f366a269219afffe0c41283c823131f1b8cc8525`.
- Device: Android 15 / API 35 phone, Russian locale, 720×1280 px at 320 dpi (360×640 dp).
- Base: `Courier-Finance-1.7.24-base-UI-QA.apk`, package `ru.courier.finance.transfer`, version `1.7.24 (38)`, SHA-256 `d66311209289c967f2b464abd46e974e35d1954f729d98c6d5fdabd336d18008`.
- Candidate: `Courier-Finance-1.7.24-unslop-UI-QA.apk`, same package/version, SHA-256 `a12f08d0adc419d1e586686f9d38e9a47f6af02cf87918e6f9ebab3c2be4c2fb`. It was derived from that base APK with the PR's CSS and signed with a temporary QA key so SpawnDroid could replace the test build. Both test APKs used that QA signer; neither is a production update.
- Synthetic data: one entry for 2 November 2026 with a 320 ₽ reward and unknown hours/orders. The JSON import preview showed 1 record, 1 day, and 0 closed periods on both APKs. Import was cancelled on both; no import was applied.
- Base and candidate import-dialog captures use the same preview data. The candidate's three counter captions are visibly larger; “ЗАКРЫТЫХ ПЕРИОДОВ” still wraps within its tile without colliding with other content. See [base](evidence/unslop-2026-11-02/base-import-dialog.jpg) and [candidate](evidence/unslop-2026-11-02/candidate-import-dialog.jpg).
- On the candidate, Period was checked collapsed and expanded with the synthetic entry. The day-card metadata at 12 px remains legible and inside the card. The expanded-card capture is [here](evidence/unslop-2026-11-02/candidate-period-expanded.jpg). A matched base capture of the expanded card was not retained, so this is a candidate inspection, not a before/after comparison for that screen.
- Candidate UI navigation to History and the import dialog worked. No visual regression was noticed in the tested card treatment, orange accents, or bottom navigation. In the captured viewport, the expanded card continues below the fixed navigation line; full scroll and touch behavior was not validated.
- The SpawnDroid session was stopped after inspection. The candidate is a test artifact only; no release build or installed user app was changed.

## Five-point direction (derived from approved SHIFT CONTROL brand)

1. **Product:** autonomous Android app for tracking courier shifts, money and forecast.
2. **Character:** focused, precise, sturdy.
3. **World:** courier shift instrument panel, graphite night surface with the approved warm orange.
4. **Moments:** the Home pace gauge and financial amount, not decorative badges.
5. **Signature:** existing orange progress/selection treatment and the central +; retain the established brand artwork.

## Unslop audit: observation → action

| Screen / layer | Evidence | Severity | Decision |
| --- | --- | --- | --- |
| Home gauge and money | Historical real Android captures | No established slop | **Keep** layout and emphasized amounts; do not change brand/palette |
| Bottom navigation, centered + | Historical real Android captures and project rules | No established slop | **Keep** icons, order, and shape |
| Period: expandable day-card captions | Latest `web/style.css` had 11px metadata at `.period-day-title small` and `.period-day-figures small` | P3 legibility risk | Change to 12px; no changes to order, data, edit IDs, cards |
| Import dialog: three counter labels | Latest `#importDialog .import-stats small` had 9px text, weight 800 and tracking .08em | P2 legibility risk | Change to 12px, weight 600, tracking 0; preserve strings and three columns |
| App typography beyond these selectors | Large layered historical stylesheet contains additional 10–11px text, bold and uppercase | P3 **inspection needed**, not all are slop | Leave unchanged pending fresh screenshots |
| Brand visuals | Existing gradients belong to user-approved SHIFT CONTROL mark | Protected brand | **Keep**; Unslop generic removal guidance does not override design approval |
| Motion | No demonstrated visual defect | Not confirmed | No changes |
| Forecast model and import | Explicitly out of scope | Protected | No changes |

### Nine Unslop passes · polish mode

1. **Spacing:** retained approved period and nav geometry.
2. **Color:** retained graphite/orange and saved themes.
3. **Icons:** retained Tabler and brand icon.
4. **Copy:** retained precise Russian product wording; no new slogans.
5. **Type:** targeted two caption blocks above.
6. **Layout:** no sections moved, no card dimensions or control behavior changed.
7. **Details:** no new shadows, glows, widgets, or decor.
8. **Visuals:** no generated art or new imagery.
9. **Motion:** unchanged.

## Acceptance: criterion → evidence → status

| Criterion | Evidence / check | Status |
| --- | --- | --- |
| Financial calculations, forecast and storage remain unchanged | CSS-only source diff | **PASS** |
| CSS stays syntactically valid | `tinycss2` parse of candidate CSS | PASS |
| Existing JS remains parseable | `node --check` over extracted APK assets; candidate JS is unchanged | **PASS** |
| Import-counter labels, same synthetic preview, base vs candidate at 360 dp | SpawnDroid screenshots; larger candidate labels, no overlap, third label wraps within its tile | **PASS** |
| Candidate Period collapsed/expanded with a day entry | SpawnDroid candidate screenshot; 12 px metadata fits in the visible card | **PASS** |
| Matched before/after expanded Period card | No retained base expanded-card screenshot | **NOT RUN** |
| Light theme, 390 dp, large text, remaining UI states | Not part of this SpawnDroid pass | **NOT RUN** |
| Restart, edit/save and historical facts remain intact | No force-stop/restart or edit/save validation on this candidate | **NOT RUN** |
| User accepts visual result | Owner review of the attached Android captures | **NOT RUN** |

**Release gate:** this is a limited Android spot check, not full UI acceptance. Do not merge or claim final visual PASS until the owner explicitly approves the screenshots. The draft must not be confused with a production-signed update.

**Next action:** owner reviews the attached captures. Keep the PR draft until that review. If the visual result is rejected, revert the two CSS selectors.

## Follow-up polish — import-dialog labels · 2 November 2026

The real SpawnDroid capture above showed four remaining labels in all caps; the 12-week heading was also 10 px with wide tracking. This matches Unslop's typography findings for uppercase labels and very small text.

- Changed the three existing import counters and the existing cycle heading to sentence case. The cycle heading is now 12 px / weight 600 / zero tracking. Counter captions keep the earlier 12 px size. No labels were added or removed; the wording and import actions are unchanged.
- Direction remains the approved SHIFT CONTROL graphite/orange instrument panel. No blocks, colors, navigation, calculations, records or storage changed.
- Rendered the same 1-record / 1-day / 0-closed-period preview at 360×640 in local Chromium. The labels fit in their existing cells. This is a browser rendering check, **not Android acceptance**.
- Created a temporary QA APK from the earlier QA APK by replacing only `assets/www/index.html` and `assets/www/style.css`, then signing with a one-time QA key. Package/version remain `ru.courier.finance.transfer`, 1.7.24 (38); SHA-256 `d64b9c95885435b28e5d6106a9f2194599bde13779d27983e2320f5929b1bd0e`. Signature and zip alignment verified. This is a focused CSS/HTML preview APK, not a fresh full source build or release build.
- The current browser's file chooser did not expose the local APK to SpawnDroid. This follow-up APK was **not installed**; a matched Android after-capture for the casing/heading adjustment is **NOT RUN**. The earlier Android screenshots above remain evidence only for the prior CSS candidate.

**Current gate:** previous candidate's Android spot check remains recorded; this follow-up's Android visual result and owner approval remain **NOT RUN**. Keep PR #14 draft.
