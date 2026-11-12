# Architecture

This reflects the source at the current checkpoint; exact verification is in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Runtime
- **Web (`web/`)**: `index.html` loads `app.mjs`; UI/navigation and storage coordination live in the app layer. `core.mjs` owns financial calculations. Forecasting, count-model preparation, import/reconciliation, period screens, weather and other UI areas are split into focused modules.
- **Android (`android/src/ru/courier/finance/`)**: `MainActivity` hosts the WebView and `CourierNative` bridge, and handles platform file, export, theme, feedback and weather operations. `CourierDatabase` owns SQLite and fact mirroring. Forecast maintenance uses local WorkManager jobs.
- **Build and checks**: `build.py` packages the app; `.github/workflows/ui-audit.yml` provides Android 35 gates. `preview.mjs` serves the same web files. Tests are under `tests/`.

## Data flow
1. WebView or browser preview loads the same web assets.
2. Android reads serialized state through `CourierNative`; preview uses `localStorage`. JavaScript owns calculations; model fitting can run in a Web Worker.
3. Edits and accepted imports normalize facts, update state and recalculate. Android persists through the bridge; preview saves locally.
4. XLSX, JSON and video imports pass through their parsers and reconciliation before updating facts. Export uses the native file/share bridge.
5. Weather is optional external input. Failures leave saved financial data intact.

## Persistence and contracts
- Preview storage: `courier-finance-v1`. Android legacy JSON: SharedPreferences `courier_finance/state`; form drafts and preferences are stored locally.
- SQLite: `courier_facts_v1.db`, schema 5. Unless `m2_sqlite_primary` is explicitly verified and enabled, JSON remains authoritative and SQLite is a mirror. Preserve both stores and migrations.
- `WorkbookReader` reads XLSX offline with size/part/cell bounds; it does not execute formulas, macros or links. `SheetFactNormalizer` maps grounded fields from seven known sheets and rejects ambiguous rows; imports preserve unknowns instead of fabricating facts.
- Bridge name and callbacks are public contracts: `CourierNative`, `window.receiveImport`, `window.receiveForecastImport` and `window.receiveWeather`. Keep calculations in shared JavaScript and Android lifecycle/platform work in Java.
- Financial data stays local. Release updates preserve package `ru.courier.finance.transfer` and the owner signing identity. Private signing files do not belong in Git or public CI.
