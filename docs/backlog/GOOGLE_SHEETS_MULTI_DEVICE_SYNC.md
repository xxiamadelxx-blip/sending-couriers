# Backlog — optional Google Sheets sync across devices

**Status: deferred by owner. This is not the active M7 milestone and does not block the local forecast or video-import flow.**

The active M7 in `docs/COURIER_FORECAST_AGENT_IMPLEMENTATION_PLAN.md` is user-started Android screen capture, local OCR, and report import. Google OAuth and multi-device sync can be resumed later if the owner requests it. No OAuth client registration, Google authorization, second device, or cloud round trip is required to use the current forecast.

The unverified prototype was removed from the active forecast branch and is preserved at local branch `backlog/google-sheets-sync-unverified` for a future, explicit restart. It was never built or installed as part of this work.

## Scope

- Google sync is off by default and starts only from Settings after an in-app explanation and Google authorization.
- Sync is a foreground action. The access token is held only for the active request and is not written to JSON, SQLite, SharedPreferences, or logs.
- Current finance entries, period closures, and app settings are represented as append-only events in a new `__CourierSync` sheet. The original 15 business tabs are not rewritten.
- Forecast state, forecast snapshots/evaluations/models, video files, OCR text, and frame evidence are excluded from the sync event payload.
- Local state remains usable offline. `sync_queue` stores edits in SQLite schema 6 until a successful append or an explicit conflict choice. Disconnecting keeps the queue and conflicts.
- HTTP 429 and transient 5xx responses use bounded retries and honor `Retry-After`; the next allowed retry time and error status are stored locally. A failed call does not delete queued events.
- If the same record changed on both devices, or a previously known remote event disappeared, the app records both versions and waits for the owner to choose “Оставить здесь” or “Взять из Google”. It does not merge or replace the local record silently.
- JSON fallback contains entries, closures, and settings but omits `forecast`. CSV fallback exports/imports finance entries only. Both use the existing import confirmation flow.

## Storage and network boundary

`CourierDatabase.VERSION` advances from 5 to 6. The migration only appends fields to the existing `sync_queue` and creates M7 head/conflict/metadata tables; it does not delete source rows. Sync events use record types `entry`, `closure`, and `settings`, stable IDs, payload hashes, and base hashes.

The Android WebView still blocks network loads. Google authorization and Sheets HTTPS requests run in native Android code. A user must approve Google's spreadsheet scope before the app creates or uses `__CourierSync` in the known `Courier Forecast` spreadsheet. Other tabs are left untouched.

## External setup required

Google's Android authorization requires the Sheets API enabled in the Cloud project and an OAuth Android client registered for package `ru.courier.finance` and the SHA-1 certificate fingerprint used by the installable app. The repository does not contain that OAuth registration or the private release signer. The CI QA application uses a package suffix and debug signing, so it cannot prove authorization for the owner's production installation. The requested Sheets scope is sensitive and may require Google's app verification before public distribution. Do not put a client secret or signing key in source control.

The default spreadsheet ID remains the canonical `Courier Forecast` workbook. For isolated QA, build with `-Pm7SheetsSpreadsheetId=<test-copy-id>`; the value is validated and compiled into that build. Register the exact QA package name and signing SHA-1 for the QA authorization check. Never use the production ID for two-device conflict or retry exercises.

## Checks to resume only if this backlog item is selected

1. Build the M7 branch and install it with the same package and signing certificate as the target app.
2. Register the production OAuth client and verify connect, cancel, disconnect, and re-consent on Android.
3. Build with the test copy's ID using `-Pm7SheetsSpreadsheetId=<test-copy-id>` and use two devices against that copy: first sync, pull-only, push-only, offline edits, same-record edits on both devices, deletion conflicts, and repeat/idempotent sync.
4. Trigger or simulate 429 and expired/revoked authorization; confirm the queue survives and manual JSON/CSV transfer leaves forecast state untouched.

The prototype is not accepted for release. Keep it out of any release gate until the owner brings this backlog item back into scope and the checks above have concrete Android and Sheets evidence.
