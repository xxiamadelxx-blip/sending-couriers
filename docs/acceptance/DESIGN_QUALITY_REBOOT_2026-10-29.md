# SHIFT CONTROL · Design Quality Protocol reboot · 2026-10-29

**Status: DISCOVERY COMPLETE, THREE EDITABLE VISUAL CONCEPTS PREPARED, OWNER DIRECTION PENDING. No production UI implementation authorized by this document.**

## Immutable owner constraints
- **Retain the orange typographic highlights** and graphite/orange SHIFT CONTROL palette. Preserve existing five-item bottom navigation, exactly the already-used offline **Tabler Icons** paths, and the central Add Slot (+); do not introduce a second Add Slot button in empty states.
- Preserve the agreed Home progress gauge and its readable number inside the ring. Do not redesign gauge/spacing without explicit renewed owner approval.
- Keep active hours distinct from full slot hours; both time regulators belong to Forecast (6.5h active / 14h slot is valid). Keep calculated model offline and non-generative, preserve persisted facts, money, source metadata, import and payout meanings. Mock numerical data in Figma is **synthetic illustrative fixture**, not user records and not evidence of financial correctness.
- No extra district/technical settings on Home. No surprise adjustments to icon artwork, navigation, major product architecture, forecasts, or calculations.
- Design decisions are visually accepted ONLY via normal-size rendered images examined by owner; app functionality separately validated through exact-SHA tests and Android emulator, never inferred from a green build alone.

## Discovery evidence (official pages accessed on 29 October 2026)
External references are **research inputs**, not permission to copy navigation, brand colors, their payment model, nor proprietary assets.

1. **[Uber Driver Earnings Hub](https://www.uber.com/us/en/deliver/earnings/)**: example weekly/session earnings, distinct completed deliveries and time metrics; take the one-glance hierarchy and drill-down approach, not their rate formula or colors.
2. **[DoorDash Dasher App Overview](https://help.doordash.com/en-us/dashers/article/dasher-app-overview)**: dedicated earnings tab with weekly/monthly chart and daily breakdown, separate active time; take scannable period structure and clear labels.
3. **[Monzo Trends / Insights](https://monzo.com/help/budgeting-overdrafts-savings/trends-spending-and-balance-web)**: money in/out, running balance, spending view and targets; take separation of measures and period selection; avoid mixing income with payouts.
4. **[YNAB mobile Home](https://support.ynab.com/spotlight-BkdHBZUokg)**: priority figures and directly accessible detailed categories; take information hierarchy and action placement, not extra actions on an existing Add Slot tab.
5. **[Strava Goals on mobile](https://support.strava.com/en-us/articles/15401694-goals-on-the-strava-app)**: measurable time/activity goal with progress feedback; take progress visualization and precise metric labels, not social features.

**Access restriction:** Mobbin `search_screens` was actually invoked but returned `Mobbin MCP requires a paid plan`, so **no Mobbin images were used**. Do not state that Mobbin references were obtained. Better Design `find_design_system` and Figma `get_libraries` and `search_design_system` were actually invoked. Figma Material 3 Design Kit is available, but existing app Tabler navigation is canonical, not replaceable by a library's tabs. All Figma icon assets were updated to exact original repo SVG paths.

## Three alternative visual compositions

[**Editable Figma file · Courier SHIFT CONTROL Redesign direction review**](https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX)

- **A · Instrument** · [Figma frame 2:2](https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX?node-id=2-2). Closest to current visual language: reward first, existing pace ring visibly **not** compressed, active hours and orders separate, additional payouts/bonus rows. Best for preserving familiar progress hierarchy.
- **B · Ledger** · [Figma frame 2:56](https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX?node-id=2-56). Money-led ledger: prominently titled reward, large hours/orders, distinct pace and separate money facts; cleaner vertical flow, but moves more emphasis away from the original ring.
- **C · Command** · [Figma frame 2:113](https://www.figma.com/design/fZd32cC99Qy5rR4HZjftYX?node-id=2-113). Three disciplined blocks: money, order pace, slot facts; stronger typography and sectional order, but does not foreground a circular gauge and would need explicit owner approval before removing/replacing it.

All frames were authored as **editable Figma text, shapes and SVG layers** (not flattened screenshots). Figma `get_screenshot` was called for each frame, followed by visual defect search. Local fixes made: A duplicate amount caption, B detached currency symbol, every concept's navigation icon path, and synthetic money-label ambiguity. The published file remains the editable canonical review artifact. Source Android branch **ui/audit-issue-3** HEAD at discovery **56c3582b38b24a3a0689d3b46d08ffbe1dd174e1**; no source UI files changed for this step.

## Decision / Gauntlet Loop

- Owner must choose A, B, C, or request a combined revision. **Do not implement any direction or substitute another app's nav before explicit approval.**
- Once selected, extract current app CSS colors/typography, establish design tokens and component style rules, and create matching screenshots for Home, Period, History, Add Slot, Forecast and Settings. Use Figma design rather than an invented code-first mock.
- Implement a scoped milestone on its own branch/commits: visual target → Android emulator screenshot at 360/390dp, dark/light, default/large text → independent visual critique **against the exact approved Figma frame** → fix → repeat.
- Design PASS requires clean vertical baselines, consistent padding, button label centering, readable contrast, nothing clipped, scrollable actions, stable nav/icons, and direct owner visual sign-off. Unit tests/coverage cannot grant a visual PASS. Preserve engineering tests and repeat them when code changes.
- Up to three loops on one defect before documenting BLOCKED and moving to an independent issue. No owner-signed release until verified upgrade does not lose data.

**Open decision:** direction A / B / C; no visual acceptance of any of the three yet.
