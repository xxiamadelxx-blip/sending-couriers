package ru.courier.finance;

import android.app.Activity;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;
import android.os.Bundle;
import android.widget.TextView;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.json.JSONObject;

/** TEST-ONLY headless forecast proof. It never creates or launches a WebView. */
public final class M3DeviceProbeActivity extends Activity {
    private static final String ZONE = "Europe/Moscow";
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static long scalar(SQLiteDatabase db, String sql) {
        try (Cursor c = db.rawQuery(sql, null)) {
            if (!c.moveToFirst()) throw new AssertionError("empty result: " + sql);
            return c.getLong(0);
        }
    }
    private static void addDay(SQLiteDatabase db, LocalDate date, Integer count) {
        addDay(db, date, count, true);
    }
    private static void addDay(SQLiteDatabase db, LocalDate date, Integer count, boolean withWork) {
        String day = date.toString();
        android.content.ContentValues order = new android.content.ContentValues();
        order.put("id", "m3-order-day-" + day); order.put("date", day);
        if (count != null) order.put("order_count", count);
        order.put("source_kind", "manual_test"); order.put("confidence", "confirmed");
        order.put("created_at", "2026-10-29T00:00:00Z"); order.put("updated_at", "2026-10-29T00:00:00Z");
        db.insertOrThrow("aggregate_order_counts", null, order);
        if (!withWork) return;

        ZonedDateTime start = date.atTime(9, 0).atZone(ZoneId.of(ZONE));
        android.content.ContentValues work = new android.content.ContentValues();
        work.put("id", "m3-work-day-" + day); work.put("date", day);
        work.put("started_at", DateTimeFormatter.ISO_INSTANT.format(start.toInstant()));
        work.put("ended_at", DateTimeFormatter.ISO_INSTANT.format(start.plusMinutes(390).toInstant()));
        work.put("zone", ZONE); work.put("state", "WORK"); work.put("active_minutes", 390);
        work.put("source_kind", "manual_test"); work.put("confidence", "confirmed");
        work.put("created_at", "2026-10-29T00:00:00Z"); work.put("updated_at", "2026-10-29T00:00:00Z");
        db.insertOrThrow("work_intervals", null, work);
    }
    private static void assertBlocked(Runnable operation, String message) {
        try { operation.run(); }
        catch (SQLiteException expected) { return; }
        throw new AssertionError(message);
    }

    private void runProof(TextView output) throws Exception {
        CourierDatabase store = new CourierDatabase(this);
        SQLiteDatabase db = store.getWritableDatabase();
        LocalDate first = LocalDate.parse("2026-06-01");
        for (int i = 0; i < 84; i++) {
            LocalDate date = first.plusDays(i);
            int count = i % 9 == 0 ? 0 : 5 + date.getDayOfWeek().getValue() % 4;
            addDay(db, date, count, i != 20); // confirmed count but no confirmed WORK exposure
        }
        LocalDate target = LocalDate.parse("2026-11-01");
        NativeCountModel.Prediction beforeFuture =
                AutonomousForecastStore.predict(db, target.toString(), 390, ZONE);
        check(beforeFuture.available, "offline SQLite forecast unavailable");
        check(beforeFuture.trainingCutoff.equals(first.plusDays(83).toString()), "wrong training cutoff");
        check(beforeFuture.comparableN == 11 && beforeFuture.central >= 0,
                "count without WORK exposure was included or zero-order WORK was lost");

        // Same-day and later facts are deliberately extreme; neither may leak into a forecast.
        addDay(db, target, 900);
        addDay(db, target.plusDays(1), 901);
        NativeCountModel.Prediction afterFuture =
                AutonomousForecastStore.predict(db, target.toString(), 390, ZONE);
        check(beforeFuture.sourceHash.equals(afterFuture.sourceHash), "future rows changed the training source hash");
        check(beforeFuture.central.equals(afterFuture.central), "future rows changed the forecast");

        // The training denominator is WORK exposure, never legacy accounted/Yandex hours.
        NativeCountModel.Prediction absentExposure =
                AutonomousForecastStore.predict(db, target.toString(), 390, "Asia/Tokyo");
        check(!absentExposure.available && absentExposure.central == null, "wrong-zone facts fabricated a forecast");
        String forecastId = AutonomousForecastStore.publish(store, target.toString(), 390, ZONE);
        check(forecastId != null, "forecast snapshot not published");
        check(scalar(db, "SELECT COUNT(*) FROM forecast_snapshots") == 1, "snapshot count");
        check(scalar(db, "SELECT COUNT(*) FROM model_registry") == 1, "model registry count");

        // The target-date 900 count was deliberately added only after prediction;
        // it is now the held-out fact used for evaluation.
        String evaluatedAt = target.plusDays(1).atTime(12, 0).atZone(ZoneId.of(ZONE))
                .toInstant().toString();
        check(AutonomousForecastStore.evaluate(store, forecastId, evaluatedAt), "evaluation not written");
        check(!AutonomousForecastStore.evaluate(store, forecastId, evaluatedAt), "same evaluation was duplicated");
        check(scalar(db, "SELECT COUNT(*) FROM forecast_evaluations") == 1, "evaluation count");

        JSONObject published;
        try (Cursor c = db.rawQuery("SELECT payload_json FROM forecast_snapshots WHERE id=?",
                new String[]{forecastId})) {
            check(c.moveToFirst(), "published row missing");
            published = new JSONObject(c.getString(0));
        }
        check(published.optBoolean("offline") && ZONE.equals(published.optString("zone")),
                "forecast provenance missing");
        final SQLiteDatabase beforeMigration = db;
        assertBlocked(() -> beforeMigration.execSQL("UPDATE forecast_snapshots SET center_orders=999 WHERE id='" + forecastId + "'"),
                "published forecast update was allowed");
        assertBlocked(() -> beforeMigration.execSQL("DELETE FROM forecast_snapshots WHERE id='" + forecastId + "'"),
                "published forecast deletion was allowed");
        assertBlocked(() -> beforeMigration.execSQL("UPDATE forecast_evaluations SET factual_orders=999"),
                "evaluation update was allowed");
        assertBlocked(() -> beforeMigration.execSQL("DELETE FROM model_registry"),
                "model registry deletion was allowed");

        // Exercise the real 3 -> 4 migration after records exist, then recheck preservation.
        String path = getDatabasePath(CourierDatabase.FILE_NAME).getPath();
        store.close();
        SQLiteDatabase prior = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        for (String trigger : new String[]{"tr_forecast_eval_immutable_update",
                "tr_forecast_eval_immutable_delete", "tr_model_registry_immutable_update",
                "tr_model_registry_immutable_delete"}) prior.execSQL("DROP TRIGGER IF EXISTS " + trigger);
        prior.setVersion(3);
        prior.close();
        store = new CourierDatabase(this);
        db = store.getWritableDatabase();
        check(scalar(db, "PRAGMA user_version") == 4, "schema did not migrate to v4");
        check(scalar(db, "SELECT COUNT(*) FROM forecast_snapshots") == 1, "migration lost forecast");
        check(scalar(db, "SELECT COUNT(*) FROM forecast_evaluations") == 1, "migration lost evaluation");
        final SQLiteDatabase afterMigration = db;
        assertBlocked(() -> afterMigration.execSQL("UPDATE forecast_evaluations SET factual_orders=999"),
                "v3 -> v4 migration did not restore evaluation immutability");
        try (Cursor c = db.rawQuery("PRAGMA integrity_check", null)) {
            check(c.moveToFirst() && "ok".equals(c.getString(0)), "SQLite integrity check failed");
        }
        store.close();
        output.setText("M3 NATIVE OFFLINE QA PASS\n84 daily counts; only confirmed WORK exposure trained the model; " +
                "model registry + immutable snapshot/evaluation; SQLite v3→v4 preserved records.");
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView output = new TextView(this);
        output.setTextSize(18); output.setPadding(24, 80, 24, 24);
        setContentView(output);
        try { runProof(output); }
        catch (Throwable error) { output.setText("M3 NATIVE OFFLINE QA FAIL: "
                + error.getClass().getSimpleName() + " " + error.getMessage()); }
    }
}
