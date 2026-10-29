package ru.courier.finance;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.json.JSONObject;

/** Native SQLite adapter for the offline count model; it has no WebView or network dependency. */
public final class AutonomousForecastStore {
    private AutonomousForecastStore() {}

    private static final class CountDay {
        long count;
        int rows;
        boolean valid = true;
        final Set<String> sources = new HashSet<>();
    }

    private static final class Part {
        final Instant start, end;
        Part(Instant start, Instant end) { this.start = start; this.end = end; }
    }

    private static final class ExposureDay {
        boolean valid = true;
        final Set<String> sources = new HashSet<>();
        final List<Part> parts = new ArrayList<>();
    }

    public static NativeCountModel.Prediction predict(SQLiteDatabase db, String targetDate,
                                                       int targetWorkMinutes, String zone) {
        LocalDate.parse(targetDate);
        ZoneId tz = ZoneId.of(zone);
        Map<String, CountDay> counts = readCounts(db, targetDate);
        Map<String, ExposureDay> exposures = readExposure(db, targetDate, zone, tz);
        List<NativeCountModel.Observation> observations = new ArrayList<>();
        for (Map.Entry<String, CountDay> e : counts.entrySet()) {
            CountDay count = e.getValue();
            ExposureDay exposure = exposures.get(e.getKey());
            if (!count.valid || count.rows == 0 || count.count > 1_000_000 || count.sources.size() != 1
                    || exposure == null || !exposure.valid || exposure.sources.size() != 1) continue;
            int workMinutes = unionMinutes(exposure.parts);
            if (workMinutes <= 0 || workMinutes > 1440) continue;
            observations.add(new NativeCountModel.Observation(e.getKey(), zone, (int) count.count, workMinutes));
        }
        return NativeCountModel.predict(observations, targetDate, targetWorkMinutes, zone);
    }

    /** Append-only publication. A null ID means facts were insufficient for a forecast. */
    public static String publish(CourierDatabase store, String targetDate,
                                 int targetWorkMinutes, String zone) throws Exception {
        SQLiteDatabase db = store.getWritableDatabase();
        NativeCountModel.Prediction p = predict(db, targetDate, targetWorkMinutes, zone);
        if (!p.available) return null;
        String created = nowUtc();
        String id = "native:" + UUID.randomUUID().toString();
        String modelVersion = NativeCountModel.VERSION + ":" + p.selectedModel;
        JSONObject payload = new JSONObject();
        payload.put("zone", p.zone);
        payload.put("targetWorkMinutes", p.targetWorkMinutes);
        payload.put("sourceHash", p.sourceHash);
        payload.put("selectedModel", p.selectedModel);
        payload.put("validationN", p.validationN);
        put(payload, "mae", p.mae); put(payload, "bias", p.bias); put(payload, "wape", p.wape);
        put(payload, "baselineMae", p.baselineMae); put(payload, "poissonMae", p.poissonMae);
        put(payload, "negativeBinomialMae", p.negativeBinomialMae);
        payload.put("dispersion", p.dispersion);
        payload.put("negativeBinomialAlpha", p.negativeBinomialAlpha);
        payload.put("intervalMethod", p.intervalMethod);
        payload.put("offline", true);

        ContentValues snapshot = new ContentValues();
        snapshot.put("id", id); snapshot.put("target_date", targetDate);
        snapshot.put("created_at", created); snapshot.put("model_version", modelVersion);
        snapshot.put("training_cutoff", p.trainingCutoff);
        snapshot.put("center_orders", p.central); snapshot.put("lower_orders", p.lower);
        snapshot.put("upper_orders", p.upper); snapshot.put("confidence", p.confidence);
        snapshot.put("comparable_n", p.comparableN); snapshot.put("baseline_orders", p.baseline);
        snapshot.put("payload_json", payload.toString());

        ContentValues model = new ContentValues();
        model.put("id", NativeCountModel.VERSION + ":" + p.sourceHash);
        model.put("version", modelVersion); model.put("trained_at", created);
        model.put("training_cutoff", p.trainingCutoff);
        if (p.mae != null) model.put("mae_orders_tenths", Math.round(p.mae * 10));
        if (p.bias != null) model.put("signed_bias_tenths", Math.round(p.bias * 10));
        if (p.baselineMae != null) model.put("baseline_mae_tenths", Math.round(p.baselineMae * 10));
        model.put("payload_json", payload.toString());
        model.put("created_at", created); model.put("updated_at", created);

        db.beginTransaction();
        try {
            db.insertWithOnConflict("model_registry", null, model, SQLiteDatabase.CONFLICT_IGNORE);
            db.insertOrThrow("forecast_snapshots", null, snapshot);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return id;
    }

    /**
     * Evaluate against the active, confirmed aggregate for the forecast date.
     * Same fact revision is idempotent; later corrections become new rows.
     */
    public static boolean evaluate(CourierDatabase store, String forecastId,
                                   String evaluatedAt) throws Exception {
        SQLiteDatabase db = store.getWritableDatabase();
        String target, cutoff;
        try (Cursor c = db.rawQuery("SELECT target_date,training_cutoff FROM forecast_snapshots WHERE id=?",
                new String[]{forecastId})) {
            if (!c.moveToFirst()) return false;
            target = c.getString(0); cutoff = c.getString(1);
        }
        JSONObject payload;
        try (Cursor c = db.rawQuery("SELECT payload_json FROM forecast_snapshots WHERE id=?",
                new String[]{forecastId})) {
            if (!c.moveToFirst() || c.isNull(0)) return false;
            payload = new JSONObject(c.getString(0));
        }
        String zone = payload.optString("zone", "");
        if (zone.isEmpty() || !LocalDate.parse(cutoff).isBefore(LocalDate.parse(target))) return false;
        LocalDate evaluatedDate = Instant.parse(evaluatedAt).atZone(ZoneId.of(zone)).toLocalDate();
        if (!LocalDate.parse(target).isBefore(evaluatedDate)) return false;

        CountDay fact = new CountDay();
        StringBuilder revision = new StringBuilder();
        try (Cursor c = db.rawQuery("SELECT id,order_count,source_kind,confidence,updated_at " +
                "FROM active_aggregate_order_counts WHERE date=? ORDER BY id", new String[]{target})) {
            while (c.moveToNext()) {
                fact.rows++;
                if (c.isNull(1) || !"confirmed".equalsIgnoreCase(c.getString(3))) fact.valid = false;
                else fact.count += c.getLong(1);
                fact.sources.add(c.getString(2));
                revision.append(c.getString(0)).append('|')
                        .append(c.isNull(1) ? "null" : c.getLong(1)).append('|')
                        .append(c.getString(4)).append('\n');
            }
        }
        if (!fact.valid || fact.rows == 0 || fact.sources.size() != 1 || fact.count > 1_000_000) return false;
        int predicted, lower, upper;
        try (Cursor c = db.rawQuery("SELECT center_orders,lower_orders,upper_orders " +
                "FROM forecast_snapshots WHERE id=?", new String[]{forecastId})) {
            if (!c.moveToFirst() || c.isNull(0) || c.isNull(1) || c.isNull(2)) return false;
            predicted = c.getInt(0); lower = c.getInt(1); upper = c.getInt(2);
        }
        String factRevision = sha256(revision.toString());
        ContentValues value = new ContentValues();
        value.put("id", "native-eval:" + sha256(forecastId + "\n" + factRevision));
        value.put("forecast_id", forecastId); value.put("fact_revision", factRevision);
        value.put("evaluated_at", evaluatedAt); value.put("factual_orders", (int) fact.count);
        value.put("signed_error", predicted - (int) fact.count);
        value.put("absolute_error", Math.abs(predicted - (int) fact.count));
        value.put("interval_covers_fact", fact.count >= lower && fact.count <= upper ? 1 : 0);
        JSONObject evidence = new JSONObject();
        evidence.put("sourceKind", fact.sources.iterator().next());
        evidence.put("sourceRows", fact.rows);
        value.put("payload_json", evidence.toString());
        return db.insertWithOnConflict("forecast_evaluations", null, value,
                SQLiteDatabase.CONFLICT_IGNORE) != -1;
    }

    private static Map<String, CountDay> readCounts(SQLiteDatabase db, String targetDate) {
        Map<String, CountDay> days = new HashMap<>();
        try (Cursor c = db.rawQuery("SELECT date,id,order_count,source_kind,confidence FROM " +
                "active_aggregate_order_counts WHERE date<? ORDER BY date,id", new String[]{targetDate})) {
            while (c.moveToNext()) {
                String date = c.getString(0);
                CountDay d = days.get(date);
                if (d == null) { d = new CountDay(); days.put(date, d); }
                d.rows++;
                d.sources.add(c.getString(3));
                if (c.isNull(2) || !"confirmed".equalsIgnoreCase(c.getString(4))) d.valid = false;
                else d.count += c.getLong(2);
                if (d.count > 1_000_000) d.valid = false;
            }
        }
        return days;
    }

    private static Map<String, ExposureDay> readExposure(SQLiteDatabase db, String targetDate,
                                                          String zone, ZoneId tz) {
        Map<String, ExposureDay> days = new HashMap<>();
        try (Cursor c = db.rawQuery("SELECT w.date,w.state,w.started_at,w.ended_at,w.active_minutes," +
                "w.source_kind,w.confidence,w.source_id,s.status " +
                "FROM work_intervals w LEFT JOIN import_sources s ON s.id=w.source_id " +
                "WHERE w.date<? AND w.zone=? AND w.state IN ('WORK','UNKNOWN') " +
                "AND (w.source_id IS NULL OR s.status='mirrored') ORDER BY w.date,w.id",
                new String[]{targetDate, zone})) {
            while (c.moveToNext()) {
                String ownerDate = c.getString(0), state = c.getString(1);
                String source = c.getString(5), confidence = c.getString(6);
                boolean verifiedSource = c.isNull(7) || "mirrored".equals(c.getString(8));
                if ("UNKNOWN".equals(state)) {
                    blockSpan(days, ownerDate, c.isNull(2) ? null : c.getString(2),
                            c.isNull(3) ? null : c.getString(3), tz, targetDate);
                    continue;
                }
                if (!"confirmed".equalsIgnoreCase(confidence) || !verifiedSource) {
                    blockSpan(days, ownerDate, c.isNull(2) ? null : c.getString(2),
                            c.isNull(3) ? null : c.getString(3), tz, targetDate);
                    continue;
                }
                try {
                    if (c.isNull(2) || c.isNull(3)) throw new IllegalArgumentException("missing interval bounds");
                    Instant start = parseInstant(c.getString(2));
                    Instant end = parseInstant(c.getString(3));
                    if (!end.isAfter(start) || Duration.between(start, end).toMinutes() <= 0
                            || Duration.between(start, end).toHours() > 24) throw new IllegalArgumentException("bad interval");
                    LocalDate startDate = start.atZone(tz).toLocalDate();
                    if (!startDate.toString().equals(ownerDate)) throw new IllegalArgumentException("date/zone mismatch");
                    long wallMinutes = Duration.between(start, end).toMinutes();
                    if (!c.isNull(4) && Math.abs(wallMinutes - c.getInt(4)) > 1)
                        throw new IllegalArgumentException("work-minute mismatch");
                    Instant cursor = start;
                    while (cursor.isBefore(end)) {
                        ZonedDateTime local = cursor.atZone(tz);
                        LocalDate localDate = local.toLocalDate();
                        Instant midnight = localDate.plusDays(1).atStartOfDay(tz).toInstant();
                        Instant partEnd = end.isBefore(midnight) ? end : midnight;
                        if (localDate.toString().compareTo(targetDate) < 0) {
                            ExposureDay d = days.get(localDate.toString());
                            if (d == null) { d = new ExposureDay(); days.put(localDate.toString(), d); }
                            d.sources.add(source);
                            d.parts.add(new Part(cursor, partEnd));
                        }
                        cursor = partEnd;
                    }
                } catch (Exception invalid) {
                    blockSpan(days, ownerDate, c.isNull(2) ? null : c.getString(2),
                            c.isNull(3) ? null : c.getString(3), tz, targetDate);
                }
            }
        }
        return days;
    }

    private static void block(Map<String, ExposureDay> days, String date) {
        ExposureDay d = days.get(date);
        if (d == null) { d = new ExposureDay(); days.put(date, d); }
        d.valid = false;
    }

    private static void blockSpan(Map<String, ExposureDay> days, String ownerDate,
                                  String startText, String endText, ZoneId tz, String targetDate) {
        block(days, ownerDate);
        if (startText == null || endText == null) return;
        try {
            Instant start = parseInstant(startText), end = parseInstant(endText);
            if (!end.isAfter(start) || Duration.between(start, end).toHours() > 24) return;
            Instant cursor = start;
            while (cursor.isBefore(end)) {
                ZonedDateTime local = cursor.atZone(tz);
                LocalDate day = local.toLocalDate();
                if (day.toString().compareTo(targetDate) < 0) block(days, day.toString());
                Instant midnight = day.plusDays(1).atStartOfDay(tz).toInstant();
                cursor = end.isBefore(midnight) ? end : midnight;
            }
        } catch (Exception ignored) { /* ownerDate is already blocked */ }
    }

    private static int unionMinutes(List<Part> parts) {
        if (parts.isEmpty()) return 0;
        Collections.sort(parts, Comparator.comparing(p -> p.start));
        Instant start = parts.get(0).start, end = parts.get(0).end;
        long total = 0;
        for (int i = 1; i < parts.size(); i++) {
            Part next = parts.get(i);
            if (!next.start.isAfter(end)) {
                if (next.end.isAfter(end)) end = next.end;
            } else {
                total += Duration.between(start, end).toMinutes();
                start = next.start; end = next.end;
            }
        }
        total += Duration.between(start, end).toMinutes();
        return total > Integer.MAX_VALUE ? 0 : (int) total;
    }

    private static Instant parseInstant(String value) {
        try { return OffsetDateTime.parse(value).toInstant(); }
        catch (Exception ignored) { return Instant.parse(value); }
    }

    private static String nowUtc() {
        return java.time.format.DateTimeFormatter.ISO_INSTANT.format(Instant.now());
    }

    private static void put(JSONObject object, String key, Double value) throws Exception {
        object.put(key, value == null ? JSONObject.NULL : value);
    }

    private static String sha256(String value) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(64);
        for (byte b : digest) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return out.toString();
    }
}
