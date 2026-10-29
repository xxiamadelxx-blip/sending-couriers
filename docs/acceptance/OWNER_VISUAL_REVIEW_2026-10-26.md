# Owner-approved visual work and next-screen queue · 26 October 2026

**Design acceptance policy:** ONLY by viewing real Android screenshots/recordings and owner's explicit visual approval. Unit/CI/XML are engineering checks, never proof that visual composition is good. No TalkBack or 200%-font design acceptance.

## Owner decisions in actual chronological order

1. Earlier density redesign **V3 rejected** by owner; reverted on branch. Do not shrink the Home rhythm circle, move the percentage onto its border, or change the Home visual hierarchy without a fresh visual proposal.
2. Owner reviewed the real-current vs concept pairs for **Settings** and **Add Slot**. Despite an earlier assistant self-rejecting its own first form sketch, **the owner explicitly approved BOTH proposed screens**, overriding that preliminary judgement. Owner also explicitly requested the crooked central `+` button be corrected.
3. Owner instructed **implement**, authorizing precisely these three changes without separate permission.
4. Later correction from owner: the assistant should continue Gauntlet work through actual Android visual review and assess the next steps; do not stop at a green APK build.

## Current approved implementation, visual evidence

- First approved implementation: commit [`1a5c0eec`](https://github.com/xxiamadelxx-blip/sending-couriers/commit/1a5c0eec3c75844aff60134da272fac82f6329d3), changes limited to `web/app.mjs` and `web/style.css`. Existing Home/gauge, forecast model, money/state and 5 destinations unchanged.
- Real Android35 build and screenshot evidence: [run #40324455836](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40324455836), [artifact #12651159128](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40324455836/artifacts/12651159128), files `ui-after/settings-main-390-dark.png`, `form-390-dark.png`, `home-390-dark.png`, plus 360/390 dark/light variants.
- **Visual review of those actual images:** bottom `+` now visually seated inside bar, no longer raised haphazardly; Settings date is Russian, rate prominent and still editable; Add Slot groups hours/orders and money and preserves sticky Save. A visible Settings defect remained: `360`, `₽`, `/ час` spaced too far apart. **Do NOT mark the first implementation visually finished.**
- Localized visual correction: commits [`851bdf70`](https://github.com/xxiamadelxx-blip/sending-couriers/commit/851bdf707524f5c7b43ba2f233b016ed84000fd0) and [`730a0caf`](https://github.com/xxiamadelxx-blip/sending-couriers/commit/730a0caf847ba92c67f7f96eafc699c6a3448fcb) keep dynamically editable rate and its currency/unit next to the value, including when a different tariff date is selected. Repeat Android visual captures are pending [run #40329391059](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40329391059).
- Engineering results at first implementation SHA: `npm test`, Android UI matrix, named control layout, XLSX repeat import and same-temporary-signer update **PASS**. Existing UI-013/014 diagnostics still **FAIL** (not part of current design acceptance, not silently erased). Actual owner-signed APK-on-device upgrade **NOT RUN**.
- **Owner's visual PASS for the implemented screens: PENDING.** The owner approved designs **before code**, not automatically the rendered result.

## Ordered, limited next steps

| Order | Stage | Owner approval scope | Acceptance/evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | Settings + Add Slot + central `+` | **Approved to implement** | Compare baseline vs actual Android35 new screenshots at 360/390 dark/light; review typography, real edit inputs, Save and central bar optically; ask owner for visual verdict | **IMPLEMENTED; Android recheck pending for rate correction; visual owner PASS PENDING** |
| 2 | History and Period | No new major design authorized | Audit current native screenshots first. If hierarchy change needed, show proposals and obtain approval BEFORE source changes | **REVIEW NEXT, NOT STARTED** |
| 3 | Forecast / two time controls | No new major design authorized | Independently inspect existing two sliders, spacing, dates, visual emphasis; proposals only until approved. Do not touch forecast math | **NOT STARTED** |
| 4 | Empty states, dialogues, import/export, theme variants | No new major design authorized | Visual before/after for specific states; preserve actual workflows; ask owner before meaningful redesign | **NOT STARTED** |
| 5 | Release hardening and owner-signed Android update | Functional QA does NOT count as design review | Fresh exact-SHA full suite, test on Android, protect facts, produce owner-signed APK using the existing private signer, test update with same signing identity and synthetic history before distribution | **OPEN / NOT READY** |

**Rule:** do not broaden to new modules, replace the selected graphite/orange SHIFT CONTROL style, or invent UI acceptance thresholds. The original V3 visual mistake of fitting an earning number by shrinking a gauge must not recur.
