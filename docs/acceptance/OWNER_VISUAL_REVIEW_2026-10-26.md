# Owner visual review · 26 October 2026

**Status: PROPOSED, NOT APPROVED, NOT IMPLEMENTED.** No production app/CSS code changes in this review. The owner prohibited technical acceptance of design. Only actual Android images and explicit human approval may establish design PASS. Illustrative concepts must not be misrepresented as Android screens or as evidence of a working implementation.

## Current known good reference
- Branch `ui/audit-issue-3`, rollback HEAD parent `c3e70a45615bfdf18aace1e1854334538085ea9a`; visual CSS blob `2d0107c1d38a08486ebe44bee44b78608d17b617` restored after V3 rejection.
- Current Android screenshots: [QA artifact #12644596079](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40306989532/artifacts/12644596079) `ui-after/home-390-dark.png`, `forecast-390-dark.png`, `settings-main-390-dark.png`, `form-390-dark.png`.
- **Keep unchanged:** Home circle position/size and its percentage centered entirely inside ring; graphite+orange SHIFT CONTROL palette; existing time controls, 5 bottom tabs, persistence, forecasting, money, imports. Never shrink the ring merely to force earnings above the fold. No approval for V3 density changes.

## Scope of this review
Screens **Settings / Tariff** and **Add Slot** only, shown using a synthetic visual layout concept side-by-side with real Android baseline.

### Option S: Settings tariff hierarchy (illustrative, awaiting owner approval)
- Preserve the same tariff controls and same lower app tabs. Make the current rate the most visually legible value, show the selected effective date in Russian rather than mixed US date notation, keep other conditions collapsible.
- Visual tradeoff: rate looks clearer, but input affordance changes and may require deliberate functional/date-picker preservation. **Do not implement** unless owner approves.
- The static synthetic illustration is not an APK screenshot, not interactive, and cannot be accepted as final production design without a new native Android visual review.

### Option F: Slot form grouping (illustrative, awaiting owner approval)
- Keep existing date, hours, orders, reward, taxes, commissions, tips and bonuses and fixed Save action.
- Slightly regroup time/orders and earnings with clearer section hierarchy. Preserve distinction of unknown values from zero and all advanced controls, even though the static preview only shows the first viewport.
- Visual tradeoff: stronger scannability in concept but smaller labels and an edited layout may worsen readability. Needs owner selection before any app edits.

## Mandatory workflow
1. Present **real current Android screenshot vs clearly labeled static concept**. No geometry-based design PASS.
2. Collect owner's approval/rejection for each concept **before touching product code**.
3. If approved, implement only selected scope; capture fresh actual Android screenshots with the same synthetic fixtures and inspect composition visually; owner determines visual PASS.
4. Run existing functional tests separately for money/state correctness. Do not substitute them for visual approval. Keep release NOT READY until full relevant checks and owner-signed APK work complete.

Current visual milestone remains **OPEN / AWAITING OWNER REVIEW**, not PASS. No TalkBack, 200%-font or technical UI-position targets are design acceptance.
