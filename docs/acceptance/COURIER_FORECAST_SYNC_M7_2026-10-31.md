# M7 — opt-in Google Sheets sync

**Status: M7 debug APK build passed in GitHub Actions (run 41223719165). OAuth consent, real Sheets round trip, and two-device acceptance remain unverified.**

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

Google's Android authorization requires the Sheets API enabled in the Cloud project and an OAuth Android client registered for package `ru.courier.finance` and the SHA-1 certificate fingerprint used by the installable app. The repository does not contain that OAuth registration or the private release signer. The current QA APK uses package `ru.courier.finance.m4probe` and QA signing SHA-1 `0b4c9a5ee432d5f16049c98ca53f3268d9a6601c`. GitHub Actions reuses its QA debug keystore between builds. Production package `ru.courier.finance` and its release signer still need separate OAuth registration. The requested Sheets scope is sensitive and may require Google's app verification before public distribution. Do not put a client secret or signing key in source control.

The default spreadsheet ID remains the canonical `Courier Forecast` workbook. For isolated QA, build with `-Pm7SheetsSpreadsheetId=<test-copy-id>`; the value is validated and compiled into that build. Register the exact QA package name and signing SHA-1 for the QA authorization check. Never use the production ID for two-device conflict or retry exercises.

## Still required before M7 acceptance

1. Install the M7 QA APK from the successful GitHub Actions artifact on both test devices; keep package `ru.courier.finance.m4probe` and the QA signing certificate unchanged.
2. Register the production OAuth client and verify connect, cancel, disconnect, and re-consent on Android.
3. Build with the test copy's ID using `-Pm7SheetsSpreadsheetId=<test-copy-id>` and use two devices against that copy: first sync, pull-only, push-only, offline edits, same-record edits on both devices, deletion conflicts, and repeat/idempotent sync.
4. Trigger or simulate 429 and expired/revoked authorization; confirm the queue survives and manual JSON/CSV transfer leaves forecast state untouched.

M7 is not marked accepted until those checks have concrete Android and Sheets evidence. The branch does not merge or publish an APK.
