# M5 source reconciliation — 2026-10-31

Status: implementation committed for review; exact-SHA verification pending.

## Context and boundary

The approved M1–M9 plan is being continued from the latest M4 branch, m4/forecast-video-result-screen-20261031 at base SHA c7f3b3211bb9c50ed3f900e2a702541d8d123e8b. M4 is already closed on the two accepted user MP4 files. M5 is the first unimplemented milestone in this plan; the separate m5/native-forecast-ui-20261031 branch is an interface integration task and does not implement this milestone.

This change preserves the existing Java/WebView UI and uses the project's native SQLiteOpenHelper. It does not add Room or change financial formulas.

## M5 implementation

- Database version 5 adds nullable orders.observed_at and replaces only the active read views. The upgrade is additive from versions 1–4; source rows remain in the underlying tables.
- active_aggregate_order_counts returns one deterministic row for identical same-scope totals, excludes a conflicting or unknown scope, and prefers confirmed slot totals over a matching unconfirmed day total. It keeps a day total when observed slots do not account for the full day. Period snapshots remain outside order aggregates.
- Video order identities use Yandex order number where available, otherwise date + slot + visible minute + payout + occurrence. Same-minute orders with occurrence 1 and 2 remain distinct.
- A visible list time is stored as observed_at; it is not presented as accepted/completed time. Cross-source matching uses a Yandex ID, a complete accepted/completed detail signature, or a complete daily RAW multiset whose order count and payout multiset both match the video.
- A partial or conflicting overlap is preserved and marked for review. The app does not infer missing RAW rows. Conflicting aggregate rows stay in source tables and are hidden from the forecast projection until reviewed.
- Import audit payloads record suppressed duplicate rows, matching slot totals, conflicts, and review status.

## Required data cases

- 2026-10-28: 11 RAW orders / ₽1,100 plus a matching video list must remain 11 orders and one active aggregate after importing the same facts from two different video sources.
- 2026-10-17: 29 day-level orders with 12 observed RAW rows must retain only the 12 individual rows; no 17 rows are synthesized.
- 2026-10-18: the two 18:57 orders remain separate, even when time and payout match.
- The 57-hour / 90-order period snapshot remains a period snapshot; it does not become a daily count.
- The ₽22,376 final hourly guarantee remains in the financial ledger and is not added to the 12-week 5% premium base. Existing premium source tests run in the same workflow.

## Verification

Pending GitHub Actions on this branch's exact commit SHA. Required checks: M2/M3/M4 regressions, the new M5 SQLite contract suite, Java identity unit tests, and the Android API 35 emulator reconciliation probe. No PASS will be recorded until those checks complete.

## Limits

Rows that lack an order number, matching completed-order details, and a complete daily RAW multiset cannot be safely linked across sources. They remain stored with provenance and the import result requests review. Previously stored M4 list rows did not persist their visible time; this migration does not invent that missing timestamp or rewrite historical facts.
