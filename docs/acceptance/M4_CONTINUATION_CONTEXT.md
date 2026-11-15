# M4 continuation context — archived

Updated: 2026-10-31

This note previously tracked an unfinished v8 check against one diagnostic video. Its 33-order target and infrastructure retry plan are superseded. Do not use them as the current M4 acceptance gate or request that video again.

The current M4 result is **PASS / CLOSED** on parser v10. The two available owner videos passed Android 35 extraction, automatic forecast-fact writing, and persistence after app force-stop and restart in [the M4 acceptance record](COURIER_FORECAST_VIDEO_IMPORT_M4_2026-10-29.md), backed by [GitHub Actions #41145341250](https://github.com/xxiamadelxx-blip/sending-couriers/actions/runs/41145341250) on code SHA `f98ac2166f80e5922a3c1dba199da4a3efba399c`.

The parser processes a video locally after the user selects it. It writes forecast facts only when the extracted order count and amount match the slot summary; otherwise it keeps candidates for review. It does not retrain itself. The CI APK has a temporary test signature; owner-signed distribution is a separate release step.
