# Controlled design restart · Discovery and direction approval · 29.10.2026

**STATUS: RESEARCHED / THREE EDITABLE FIGMA CONCEPTS READY / OWNER DECISION PENDING.**
This is a design-only branch. No Android, WebView, finance, forecast, imports, navigation, splash, launch icon, signing identity or production UI is altered until owner selects a visual direction. Previous signed APKs and owner approvals remain valid reference, not a license to change unrelated UI.

## Owner requirements (not negotiable)
- Preserve existing **SHIFT CONTROL** palette: graphite `#10151A`, orange lettering/signal `#FF7952`, gold action `#FFBD57`, cream text `#F4F1E9`. Orange typography remains visible and intentional in **all** three concepts; no global recolor.
- Preserve the existing **five bottom destinations** and bundled **Tabler** vector icon family. The center `+` stays where it is. No decorative extra add-slot button on other screens.
- The HOME pace ring/number must remain comfortably centered if retained. No V3 forced densification, overlapping texts, clipped bars or unreadable captions.
- A concept is not app implementation and not automatically accepted. **Only real Android screenshots and explicit owner approval** can determine an implemented design's visual PASS.
- Separate observed facts, forecasts, payouts, and conditional bonuses. The shown `9 h / 18 orders / 3 200 ₽ / 2.00 orders/h` is a **synthetic visual fixture**, never user data and never a new formula.
- Maintain two time controls on Forecast: active hours and full slot. Preserve local offline model, exact money and persistence.
- No independent modification of launch icon/startup identity; Codex has a still-unapproved 4-part mark at HEAD `56c3582b`.

## Primary reference research (29 Oct 2026)

References are **not** imported source code or automatically suitable components. Copy only the specified UX principle, not brand, licensed assets or navigation.

1. **DoorDash Dasher Earnings**: [official Dasher overview](https://help.doordash.com/en-us/dashers/article/dasher-app-overview), [official Earnings article](https://dasher.doordash.com/en-us/blog/new-doordash-dasher-app). Use time/work vs money distinction, weekly history and primary earnings metric. Do not add a map.
2. **Uber Driver Earnings**: [official earnings information](https://www.uber.com/us/en/drive/driver-app/), [official weekly statement breakdown](https://help.uber.com/en/driving-and-delivering/article/ni-wapi-naweza-kuona-mapato-niliyopokea-katika-safari?nodeId=ceebe501-e329-4891-98dd-f1cc026137ad). Use period selection and clear separation of earnings, tips, adjustments, payouts. Do not copy Uber's payout mechanics.
3. **Monzo Trends**: [official screen](https://monzo.com/blog/cost-of-living-how-were-supporting), [Trends help](https://monzo.com/help/monzo-perks/trends-spending-and-balance-web). Use clean period summaries, monetary hierarchy, aligned transaction rows. Do not import budgeting features.
4. **Revolut Analytics**: [official example](https://www.revolut.com/cs-CZ/bank-account/). Use first-glance numerical hierarchy and proportion visualizations; do not turn actual order pace into a spending donut.
5. **Strava Progress / Dark Mode**: [official dark mode](https://stories.strava.com/articles/hello-dark-mode), [activity history](https://support.strava.com/en-us/articles/15402014-viewing-your-activity-history-on-strava). Use large single-purpose metrics, controlled orange accent, distinct training periods, not Strava-style extra tabs.
6. **YNAB Reflect**: [official breakdown on mobile](https://www.ynab.com/whats-new/spending-breakdown-on-mobile), [income vs spending](https://www.ynab.com/whats-new/check-your-income-vs-spending-on-mobile). Use stable financial row alignment and clear numeric denominations, not YNAB budget categories.

Mobbin was **actually called** but refused the search: paid plan required. It is not evidence and no Mobbin screens were used. Better Design `find_design_system` and Figma Material 3 design system search were actually called. Android continues to use existing Tabler icons. No generated UI illustrations or invented pictograms.

## Three distinct directions, editable Figma

**Figma:** https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX
- A · Instrument: https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX?node-id=2-2 — closest to approved SHIFT CONTROL; ample central ring and single primary money panel. Tradeoff: less room for secondary details.
- B · Ledger: https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX?node-id=2-56 — editorial financial ledger, larger money figure and strong category separators. Tradeoff: original gauge is no longer a ring; needs explicit approval.
- C · Command: https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX?node-id=2-113 — operational modules for income, pace and shifts with orange labels and numeric-first presentation. Tradeoff: visually dense and removes circular instrument; needs explicit approval.

The Figma file contains **native editable text, shapes, vectors and hierarchical frames**, not flattened app screenshots. Three variants share identical sample facts and the preserved five-tab navigation structure. The previews use local Inter fallback while actual Android currently uses system sans; typography choice must be locked in the design system after approval. Figma native screenshot preview was inspected. Defects corrected in the previews: duplicate amount caption in A and separated `₽` glyph in B.

## Mandatory controlled implementation sequence
1. Owner selects or rejects one of A/B/C; ask one Discovery clarification only if a material requirement is still unknown. **No production code before this.**
2. Establish tokens, text styles, component sizes, native Tabler icons, states, long labels, empty/error and light/dark variants in editable Figma. Preserve already-approved UI decisions unless explicitly overridden.
3. Map selected visual target to actual Android UI. Implement incrementally by screen, keeping finance and persistence untouched. Every change attaches to an exact SHA.
4. For every changed screen: build/test Android in cloud emulator, obtain **real screenshots**, visually compare against approved Figma at identical synthetic facts, use independent adversarial visual reviewer, correct and repeat. No geometry-only visual PASS. Functional tests separately protect data and calculations.
5. Final owner visual sign-off, then full release QA, stable signing certificate and installed upgrade check. A built/test-signed APK is not proof of signed release.

**CURRENT REDESIGN MILESTONE: DISCOVERY / AWAITING VISUAL DIRECTION APPROVAL.** No screen redesign, icon change or production APK has been approved by creation of this document.
