# Settings rate spacing · 28 Oct 2026

Scope: one local spacing correction in the existing approved Settings tariff card. The editable amount now reserves only a small caret allowance before the ₽ suffix; the rate, payment rules, and other screen elements are unchanged.

## Native Android 35 evidence

| State | Source / run / artifact | Files |
| --- | --- | --- |
| Before | Branch SHA `74129b78a996b27bc91cecd284eb8345987bd5dd`; [run 40664034027](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40664034027); artifact `12806124280` | `ui-after/settings-main-{360,390}-{dark,light}.png` |
| After | Branch SHA `e0852519865336acdb200b2ad908d1242fc60b95`; [run 40680408338](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/40680408338); artifact `12814017065`; CI PR merge SHA `d86161ac6ecb5c1deaf302dadb346e52c3f9a130` | Same four native screenshots |

The four after screenshots were inspected against their matching before captures. In both themes and widths, `360` and `₽` now read together while `/ час` remains legible. No clipping or new collision is visible in the Settings card. The owner reviewed the new Android result and replied **«Одобряю»**. **Scoped visual verdict for the Settings rate spacing: PASS.** This does not close acceptance for other Settings states or the whole release.

`npm test`: 20 suites PASS. Browser interaction at 360/390 confirmed the rate field still grows for a longer value. Exact Android run: UI matrix PASS, named action layout PASS, XLSX import PASS, same-temporary-signer transfer upgrade PASS. The independent native edit label diagnostic and 200% font form check remain FAIL; whole CI FAIL. TalkBack speech and owner-signed upgrade remain NOT RUN. No release readiness is claimed.
