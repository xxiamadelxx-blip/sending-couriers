# Architecture

This describes the source at the current refactor checkpoint. See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the verified commit and open gates.

## Components

- **Web UI (`web/`)**: `index.html` loads `app.mjs`, which renders screens, handles navigation and coordinates state. `core.mjs` contains date, validation, ledger, income, payout and premium calculations. Forecast logic is split across `forecast*.mjs`, count-model/runtime modules and a Web Worker. Import/reconciliation, period views, slot working-time handling, feedback and weather have separate modules.
- **Android host (`android/src/ru/courier/finance/`)**: `MainActivity` configures the WebView, serves bundled assets from `web/`, exposes `CourierNative`, and handles Android file selection, export, theme, feedback and weather requests. `CourierDatabase` owns the native SQLite schema and fact import/mirror operations. `ForecastAutomation` and `ForecastAutomationWorker` run local scheduled maintenance through WorkManager.
- **Build and QA**: `build.py` packages the WebView assets and Android classes; `.github/workflows/ui-audit.yml` is the existing Android 35 emulator and release-transfer QA path. `preview.mjs` serves the same `web/` directory for browser checks. JavaScript and Python tests live under `tests/`.

## Data flow

1. Android loads the packaged WebView assets; browser preview loads the same HTML and modules directly.
2. The UI obtains the serialized state through `CourierNative.readState()` on Android or `localStorage` in preview. Calculations run in JavaScript; forecast model preparation can run in a Web Worker.
3. User edits and accepted imports update the state, then call `CourierNative.writeState()` on Android or save to browser storage. Java validates size/schema limits and coordinates native persistence.
4. XLSX/JSON/video entry points pass data into JavaScript callbacks; JavaScript normalizes and merges observed facts before recalculating totals. Export uses the native file/share bridge.
5. Weather is optional external data. Android fetches a public forecast and returns it through the WebView bridge; failures leave the local financial state intact.

## Persistence and compatibility

- Browser preview uses `localStorage` key `courier-finance-v1`.
- Android retains the legacy JSON state in SharedPreferences file `courier_finance`, key `state`, and stores form drafts and preferences there.
- SQLite is `courier_facts_v1.db`, schema version 5. The `m2_sqlite_primary` preference controls whether verified SQLite state is read/written as primary. Otherwise JSON remains authoritative while facts are mirrored. On primary writes, the JSON value is retained as a backup/fallback. Do not force migration or delete either store without a separately verified migration plan.
- Forecast background work consumes local facts. It does not send financial records to a server.

## Stable contracts and decisions

- The WebView bridge name is `CourierNative`; its state, file, feedback, theme, font-scale, forecast and weather methods are implemented in `MainActivity.NativeBridge`. Callback entry points include `window.receiveImport`, `window.receiveForecastImport` and `window.receiveWeather`.
- Keep financial rules in JavaScript so preview and Android use the same implementation. Java owns Android lifecycle, platform APIs, local database access and WorkManager integration.
- Keep SQLite migration reversible while the older JSON store remains in use. Release updates must preserve the transfer package ID and established signing identity; private signing material is not stored in Git or public CI.
- No separate decisions log is needed yet: these decisions are few and belong with the architecture they constrain.
