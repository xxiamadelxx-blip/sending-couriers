package ru.courier.finance;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;
import android.database.sqlite.SQLiteOpenHelper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * M2 reversible shadow store. Existing SharedPreferences remains authoritative
 * until complete migration parity and an actual Android upgrade have passed.
 *
 * Native SQLite is used intentionally: Android minSdk26, no Gradle dependency or
 * server, no changed UI, and no release-signature change. Unknowns stay SQL NULL.
 */
public final class CourierDatabase extends SQLiteOpenHelper {
    public static final String FILE_NAME = "courier_facts_v1.db";
    public static final int VERSION = 1;
    private final Context appContext;

    public CourierDatabase(Context context) {
        super(context.getApplicationContext(), FILE_NAME, null, VERSION);
        appContext = context.getApplicationContext();
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        try (InputStream in = appContext.getAssets().open("www/m2_schema_v1.sql");
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buffer.write(chunk,0,n);
                if (buffer.size()>256_000) throw new SQLiteException("M2 schema unexpectedly large");
            }
            String script = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            // A trigger has an internal ';' before END. Split only before the
            // following CREATE keyword; never execute half a trigger.
            for (String statement : script.split(";\\s*(?=CREATE)")) {
                if (!statement.trim().isEmpty()) db.execSQL(statement.trim());
            }
        } catch (Exception error) {
            throw new SQLiteException("Failed to initialize courier SQLite schema: " + error.getClass().getSimpleName());
        }
    }

    @Override public void onUpgrade(SQLiteDatabase db, int from, int to) {
        // Never use destructive fallback for real financial facts.
        throw new SQLiteException("Unreviewed courier migration from " + from + " to " + to);
    }

    private static String nowUtc() {
        SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static String sha256(String input) throws Exception {
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder result=new StringBuilder(64);
        for (byte b:bytes) result.append(String.format(Locale.ROOT,"%02x",b & 0xff));
        return result.toString();
    }

    private static Integer integerOrNull(JSONObject row, String key) throws Exception {
        if (!row.has(key)||row.isNull(key)||String.valueOf(row.get(key)).trim().isEmpty()) return null;
        BigDecimal n=new BigDecimal(String.valueOf(row.get(key)));
        int value=n.intValueExact();
        if(value<0) throw new IllegalArgumentException("negative count");
        return value;
    }

    private static Integer hundredthsOrNull(JSONObject row, String key) throws Exception {
        if (!row.has(key)||row.isNull(key)||String.valueOf(row.get(key)).trim().isEmpty()) return null;
        int value=new BigDecimal(String.valueOf(row.get(key)))
            .multiply(new BigDecimal("100")).setScale(0,RoundingMode.HALF_UP).intValueExact();
        if(value<0) throw new IllegalArgumentException("negative hours");
        return value;
    }

    private static Long kopecksOrNull(JSONObject row, String key) throws Exception {
        if (!row.has(key)||row.isNull(key)||String.valueOf(row.get(key)).trim().isEmpty()) return null;
        // Persist signed adjustments as supplied, without invented deductions.
        return new BigDecimal(String.valueOf(row.get(key)))
            .multiply(new BigDecimal("100")).setScale(0,RoundingMode.HALF_UP).longValueExact();
    }

    /**
     * Idempotent and transactional. Preserves a byte-for-byte JSON recovery
     * copy, original IDs, nulls, separate slots, and exact kopeck amounts.
     * Never manufactures order rows or unobserved work intervals.
     */
    public synchronized boolean mirrorLegacy(String raw) throws Exception {
        if(raw==null||raw.isEmpty()) return false;
        JSONObject state=new JSONObject(raw);
        int schema=state.getInt("schemaVersion");
        if(schema<1||schema>6) throw new IllegalArgumentException("unsupported legacy schema");
        JSONArray entries=state.getJSONArray("entries");
        if(entries.length()>10000) throw new IllegalArgumentException("too many legacy entries");
        String fingerprint=sha256(raw);
        SQLiteDatabase db=getWritableDatabase();
        try(Cursor existing=db.rawQuery("SELECT sha256 FROM legacy_state WHERE id=1",null)) {
            if(existing.moveToFirst()&&fingerprint.equals(existing.getString(0))) return false;
        }
        String when=nowUtc();
        db.beginTransaction();
        try {
            // Future manual facts/imports have different source_kind and survive.
            db.execSQL("DELETE FROM aggregate_order_counts WHERE source_kind='legacy_state'");
            db.execSQL("DELETE FROM financial_ledger WHERE source_kind='legacy_state'");
            db.execSQL("DELETE FROM legacy_slot_facts WHERE source='legacy_state'");

            for(int i=0;i<entries.length();i++) {
                JSONObject e=entries.getJSONObject(i);
                String date=e.getString("date");
                String id=e.has("id")&&!e.isNull("id")?e.getString("id") :
                    "legacy-"+date+"-"+i; // stable per source snapshot; no fabricated order events
                String created=e.optString("createdAt",when);
                String updated=e.optString("updatedAt",when);
                Integer count=integerOrNull(e,"dailyOrders");
                Integer hours=hundredthsOrNull(e,"dailyHours");
                ContentValues slot=new ContentValues();
                slot.put("id",id);slot.put("date",date);
                if(count==null)slot.putNull("order_count");else slot.put("order_count",count);
                if(hours==null)slot.putNull("accounted_hundredths");else slot.put("accounted_hundredths",hours);
                slot.put("raw_json",e.toString());slot.put("source","legacy_state");
                slot.put("created_at",created);slot.put("updated_at",updated);
                db.insertOrThrow("legacy_slot_facts",null,slot);
                if(count!=null) {
                    ContentValues aggregate=new ContentValues();
                    aggregate.put("id","legacy:"+id);aggregate.put("date",date);
                    aggregate.put("slot_id",id);aggregate.put("order_count",count);
                    aggregate.put("source_kind","legacy_state");aggregate.put("confidence","reported");
                    aggregate.put("created_at",created);aggregate.put("updated_at",updated);
                    db.insertOrThrow("aggregate_order_counts",null,aggregate);
                }
                String[] keys={"reward","tax","parkCommission","tips","separateBonus"};
                String[] kinds={"reward","tax","park_commission","tip","separate_bonus"};
                for(int m=0;m<keys.length;m++) {
                    Long cents=kopecksOrNull(e,keys[m]);
                    if(cents==null) continue;
                    ContentValues financial=new ContentValues();
                    financial.put("id","legacy:"+id+":"+kinds[m]);financial.put("date",date);
                    financial.put("slot_id",id);financial.put("kind",kinds[m]);
                    financial.put("amount_kopecks",cents);
                    financial.put("source_kind","legacy_state");financial.put("confidence","reported");
                    financial.put("created_at",created);financial.put("updated_at",updated);
                    db.insertOrThrow("financial_ledger",null,financial);
                }
            }
            ContentValues snapshot=new ContentValues();
            snapshot.put("id",1);snapshot.put("state_json",raw);
            snapshot.put("sha256",fingerprint);snapshot.put("schema_version",schema);
            snapshot.put("mirrored_at",when);
            db.insertWithOnConflict("legacy_state",null,snapshot,SQLiteDatabase.CONFLICT_REPLACE);

            // Fixed source ID; changes in source are recorded as versions via audit_events.
            db.execSQL("DELETE FROM import_sources WHERE id='legacy-state'"); // no FKs to this source yet
            ContentValues source=new ContentValues();
            source.put("id","legacy-state");source.put("sha256",fingerprint);
            source.put("source_kind","legacy_state");source.put("parser_version","legacy-json-v6");
            source.put("status","mirrored");source.put("created_at",when);source.put("updated_at",when);
            db.insertOrThrow("import_sources",null,source);
            ContentValues audit=new ContentValues();
            audit.put("id","legacy-revision:"+fingerprint);
            audit.put("happened_at",when);audit.put("action","legacy_mirrored");
            audit.put("record_type","legacy_state");audit.put("record_id","1");
            audit.put("source_kind","legacy_state");
            db.insertWithOnConflict("audit_events",null,audit,SQLiteDatabase.CONFLICT_IGNORE);
            db.setTransactionSuccessful();
            return true;
        } finally {
            db.endTransaction();
        }
    }

    /** For parity review only: verify immutable copy corresponds to the original. */
    public synchronized boolean matchesLegacy(String raw) throws Exception {
        if(raw==null||raw.isEmpty()) return false;
        try(Cursor cursor=getReadableDatabase().rawQuery("SELECT sha256 FROM legacy_state WHERE id=1",null)) {
            return cursor.moveToFirst()&&sha256(raw).equals(cursor.getString(0));
        }
    }
}
