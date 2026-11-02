# Unslop UI audit · 2 November 2026

**Scope:** UI only, no forecast models, business logic, records, navigation, or storage changes. This is a **light-polish candidate**, not an approved release. Credit: [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop), CC BY 4.0.

## Verified baselines

- Current source branch: `release/forecast-video-upload-20261101`, commit `1ba9b0d04b47e0c15c99aa6ba0f8edd2d6b2ed25`. The APK obtained from GitHub Actions run [41415151486](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/41415151486) contains `assets/www/style.css`, `app.mjs`, and the other UI assets for source inspection. This run is an M4 build, **not a visual Android sign-off**.
- Actual historical Android 35 dark/light screenshots at 360/390 from [UI audit run 40846918821](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40846918821), artifact `ui-audit-a1340c1d23615893a68dbafc705930578236dda7`. They show Home, Period, Add Slot, Forecast and History, **but are from 29 October and a different SHA**.
- Current SpawnDroid logged-in browser session: **BLOCKED** here. Browser connector rejects access without its originating browser/extension context. TinyFish has neither a recorded SpawnDroid sign-in nor a funded balance; Limrun has no running instance. No fresh Android screenshots for this candidate were obtained.
- Local technical checks of extracted release APK assets: JS syntax `node --check` PASS; CSS `tinycss2.parse_stylesheet` PASS after the two CSS edits. These checks **do not prove Android visual QA**.

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

### Nine Unslop passes, light mode

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
| No changes to financial calculations, forecast or storage | CSS-only source diff | PASS for **diff scope** |
| CSS stays syntactically valid | `tinycss2` parse of candidate CSS | PASS |
| Existing JS remains parseable | `node --check` over extracted APK assets; JS unchanged | PASS for **baseline only** |
| At 360/390 dp both small-text corrections are readable without overlap | Fresh Android 35/SpawnDroid screenshot after installing a build of this branch | **NOT RUN** |
| Day expanded cards, import dialog, dark/light, large text | Native touch interactions + visual comparison | **NOT RUN** |
| Restart, edit/save and historical facts remain intact | Native read/write validation on exact new APK | **NOT RUN** |
| User accepts visual result | Show fresh before/after images from the exact APK | **NOT RUN** |

**Release gate:** do not merge or claim visual PASS until a fresh APK is built, installed, and inspected on Android and owner explicitly approves the resulting screen. This draft must not be confused with the previously tested APK.

**Next action:** restore the originating SpawnDroid browser session in Work/connected browser, run current baseline and candidate APK on the same 360/390 device configurations, capture Import and Period collapsed/expanded and inspect. If the changes do not fit, revert the two CSS selectors.
