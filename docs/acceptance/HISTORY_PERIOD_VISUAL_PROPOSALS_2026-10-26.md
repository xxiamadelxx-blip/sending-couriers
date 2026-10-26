# SHIFT CONTROL: History and Period visual proposals · 26 October 2026

**DECISION: OWNER APPROVAL PENDING.** Do not implement these conceptual layouts until the owner explicitly accepts the relevant screen(s). These are **static composited concept images**, NOT actual Android screenshots of implemented changes. The left half of each comparison is actual Android 35; the right half is an HTML-rendered proposal over the unchanged real status/title/nav chrome. The concepts are illustrative, not functional and not approved.

## Exact current reference and latest preceding visual check

- Live product branch: `ui/audit-issue-3`.
- Functional UI / Settings / Add Slot / centered `+` implementation: source commit `39791d680b3e14ba9e3ca1302eee5804f0d81501` (includes rate precision pass).
- Last complete actual Android 35 QA: [run #40329758075](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40329758075), [artifact #12654939786](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40329758075/artifacts/12654939786). Screens `ui-after/settings-main-390-dark.png`, `form-390-dark.png`, `history-390-dark.png`, `period-390-dark.png`, 360/390 dark/light. Genuine rate `360 ₽ / час` now visually grouped; original Home gauge remains unchanged.
- Independently reviewed screenshot of first rendered form shows 2 same-date slots information and the anchored Save. Owner's final aesthetic PASS of implementation is still **PENDING**, despite previously approved visual direction.
- Engineering only: finance tests, ordinary Android UI matrix, XLSX repeated import, and temporary-test-signer upgrade PASS. Historical UI-013/014 FAILED in run; owner removed them from redesign acceptance. CI failure is not evidence about visual taste.

## Proposal H1: History with clearer per-day money

Existing synthetic fact fixture: **26.10.2026**, period **16–29.10.2026**, two saved slots: Slot 2 = **5 h / 10 orders / 2,000 RUB**, Slot 1 = **4 h / 8 orders / 1,200 RUB**, combined **9 h / 18 orders / 3,200 RUB**. Tips and separate bonuses are **zero, not unknown**.

In the *right-hand conceptual preview*, date is still a full readable heading, the 9h/18 orders day summary remains, and the day's 3,200 RUB total is made visibly prominent beside it. Each record keeps an individually visible **Edit** action, separately readable hours and orders, earnings, tips and separate bonuses; no fields removed. Orange left-side card rail is a familiar SHIFT CONTROL cue. The concept deliberately retains **separate, legible rows for tips and bonuses** instead of squeezing the secondary money into tiny labels. Any real Android implementation still requires a new visual review.

**Trade-off:** Stronger scan path and faster separation of date/day total/individual earnings; loses a little of the old receipts' detailed row-by-row density. All underlying facts and edit semantics must remain identical if implemented. No changes to the bottom `+`, navigation, forecast or gross-pay logic.

## Proposal P1: Period with earnings under the numeric summary

Existing fixture: **9 hours**, **18 orders**, **3,200 RUB sum of slot rewards**, status **"Выплата под риском"**, message **"До 80 ч ещё 71 ч. Темп достигнут."**, **12 weeks** date unset. Current Period screen already has hour/order totals, risk, 12 weeks, Records, Export.

In the *right-hand conceptual preview*, keep the strong graphite/yellow period summary and the two **large** hours/orders. Propose an **additional visibly labeled 3,200 RUB reward total** inside that panel, distinguishable from the *overall income/paid/owed* figures of the main screen. Risk remains full-width immediately below; 12-week date choice, Records, and Export remain visible, without deleting any controls.

**Trade-off:** One more trustworthy money fact directly on the Period page, but requires verifying that this value consistently matches the real sum of rewards (not tips, commissions, payout or forecast) when implemented. It is a **new field on Period**, so **prior owner approval required**. No math or storage changes may be introduced solely to manufacture this number.

## Non-negotiable visual acceptance

- Screens before/after must be visually inspected using **real Android 35 screenshots** at the same synthetic fixture and selected theme. A correct XML position or green test can never produce a visual PASS.
- Final design PASS depends on owner approval **after** seeing the implemented native screenshots. Approval of this design proposal only authorizes a scoped implementation.
- Previous rejected V3 compact/gauge iteration remains REJECTED; don't shrink Home pace ring or change its numeric position. Never touch TalkBack/200% font QA during visual design iterations absent direct new request.
- Do not alter the next screen without new owner approval. Relevant next stage after H1/P1 is Proposal F (Forecast two existing sliders) and only then empty states/import/dialogue visual review.

## Status / next action

**UI-M1 History/Period visual direction: PROPOSED → AWAITING OWNER SELECTION.** Production source `web/app.mjs` and `web/style.css` unchanged by this proposal. Preview comparison PNGs are generated in the current conversation `courier-next-visual/comparison-history.png` and `courier-next-visual/comparison-period.png`, SHA256: history `d9a2e61dc115901534450fbbadebd4b7d34bc90e9dfd4e84f8c03bfc9b88bbdb`, period `99ae2f7e46413a8281fb2c4d77e81a32032e8f25c0436c9e1349a9901ba8166f`. If those attachments cannot be recovered in a later run, regenerate from this written specification and the exact referenced native artifact. No fictitious permanent GitHub binary artifact link.
