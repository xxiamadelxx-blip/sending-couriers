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
    public static final int VERSION = 4;
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
        applySchema(db, "www/m2_schema_v1.sql");
        applySchema(db, "www/m2_views_v2.sql");
        applySchema(db, "www/m3_schema_v1.sql");
    }

    private void applySchema(SQLiteDatabase db, String asset) {
        applySchema(db,asset,false);
    }

    private void applySchema(SQLiteDatabase db, String asset, boolean additive) {
        try (InputStream in = appContext.getAssets().open(asset);
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buffer.write(chunk,0,n);
                if (buffer.size()>256_000) throw new SQLiteException("M2 schema unexpectedly large");
            }
            String script = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            // Strip standalone SQL comments before splitting. Otherwise,
            // comments between statements hide the CREATE boundary from
            // Android SQLiteDatabase.execSQL (one statement per call).
            script = script.replaceAll("(?m)^\\s*--[^\\r\\n]*", "");
            if (additive) {
                // Version 1/2 installations may lack tables appended after
                // the first schema shipped. Reapply ALL declarations without
                // deleting old rows or replacing their table definitions.
                for(String kind:new String[]{"TABLE","INDEX","TRIGGER"})
                    script=script.replaceAll("(?i)\\bCREATE\\s+"+kind+"\\s+(?!IF\\s+NOT\\s+EXISTS)",
                        "CREATE "+kind+" IF NOT EXISTS ");
            }
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
        if ((from == 1 || from == 2) && to == 4) {
            // M2 adds the source archive; M3 adds append-only evaluation metadata.
            // SQLiteOpenHelper wraps onUpgrade in a transaction; preserve every existing row.
            applySchema(db, "www/m2_schema_v1.sql", true);
            applySchema(db, "www/m2_views_v2.sql");
            applySchema(db, "www/m3_schema_v1.sql");
            return;
        }
        if (from == 3 && to == 4) {
            applySchema(db, "www/m3_schema_v1.sql");
            return;
        }
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
        int expectedAggregates=0, expectedFinanceRows=0;
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
                    expectedAggregates++;
                    ContentValues aggregate=new ContentValues();
                    aggregate.put("id","legacy:"+id);aggregate.put("date",date);
                    aggregate.put("slot_id",id);aggregate.put("order_count",count);
                    aggregate.put("source_kind","legacy_state");aggregate.put("confidence","unverified_legacy");
                    aggregate.put("created_at",created);aggregate.put("updated_at",updated);
                    db.insertOrThrow("aggregate_order_counts",null,aggregate);
                }
                String[] keys={"reward","tax","parkCommission","tips","separateBonus"};
                String[] kinds={"reward","tax","park_commission","tip","separate_bonus"};
                for(int m=0;m<keys.length;m++) {
                    Long cents=kopecksOrNull(e,keys[m]);
                    if(cents==null) continue;
                    expectedFinanceRows++;
                    ContentValues financial=new ContentValues();
                    financial.put("id","legacy:"+id+":"+kinds[m]);financial.put("date",date);
                    financial.put("slot_id",id);financial.put("kind",kinds[m]);
                    financial.put("amount_kopecks",cents);
                    financial.put("source_kind","legacy_state");financial.put("confidence","unverified_legacy");
                    financial.put("created_at",created);financial.put("updated_at",updated);
                    db.insertOrThrow("financial_ledger",null,financial);
                }
            }
            ContentValues snapshot=new ContentValues();
            snapshot.put("id",1);snapshot.put("state_json",raw);
            snapshot.put("sha256",fingerprint);snapshot.put("schema_version",schema);
            snapshot.put("mirrored_at",when);
            db.insertWithOnConflict("legacy_state",null,snapshot,SQLiteDatabase.CONFLICT_REPLACE);

            // Fixed source ID; update in-place, preserving future FK references.
            ContentValues source=new ContentValues();
            source.put("id","legacy-state");source.put("sha256",fingerprint);
            source.put("source_kind","legacy_state");source.put("parser_version","legacy-json-v6");
            source.put("status","mirrored");source.put("created_at",when);source.put("updated_at",when);
            if(db.update("import_sources",source,"id=?",new String[]{"legacy-state"})==0)
                db.insertOrThrow("import_sources",null,source);
            ContentValues audit=new ContentValues();
            audit.put("id","legacy-revision:"+fingerprint);
            audit.put("happened_at",when);audit.put("action","legacy_mirrored");
            audit.put("record_type","legacy_state");audit.put("record_id","1");
            audit.put("source_kind","legacy_state");
            db.insertWithOnConflict("audit_events",null,audit,SQLiteDatabase.CONFLICT_IGNORE);
            // Verify parity while the transaction can still be rolled back.
            long slots=countQuery(db,"SELECT COUNT(*) FROM legacy_slot_facts WHERE source='legacy_state'");
            long aggregated=countQuery(db,"SELECT COUNT(*) FROM aggregate_order_counts WHERE source_kind='legacy_state'");
            long financial=countQuery(db,"SELECT COUNT(*) FROM financial_ledger WHERE source_kind='legacy_state'");
            if(slots!=entries.length()||aggregated!=expectedAggregates||financial!=expectedFinanceRows)
                throw new SQLiteException("M2 mirror count mismatch; rolled back");
            db.setTransactionSuccessful();
            return true;
        } finally {
            db.endTransaction();
        }
    }

    private static long countQuery(SQLiteDatabase db, String query) {
        try(Cursor cursor=db.rawQuery(query,null)) {
            if(!cursor.moveToFirst()) throw new SQLiteException("M2 parity query missing");
            return cursor.getLong(0);
        }
    }

    /**
     * Mirror every historical XLSX row exactly once. No "orders" are generated
     * here, since sheet rows can be reconstructed, incomplete or aggregates.
     * The caller gives a hash of ORIGINAL XLSX bytes, not the JSON projection.
     */
    public synchronized int mirrorWorkbook(String parsedWorkbook, String fileSha) throws Exception {
        if (fileSha==null || !fileSha.matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("Invalid original XLSX SHA256");
        JSONObject root = new JSONObject(parsedWorkbook);
        JSONObject sheets = root.getJSONObject("sheets");
        if (sheets.length()>15) throw new IllegalArgumentException("Unsupported XLSX tabs");
        SQLiteDatabase db=getWritableDatabase();
        String sourceId="xlsx:"+fileSha, when=nowUtc();
        try (Cursor cursor=db.rawQuery("SELECT status FROM import_sources WHERE id=?",new String[]{sourceId})) {
            if (cursor.moveToFirst()) {
                String status=cursor.getString(0);
                if ("mirrored".equals(status) || "superseded".equals(status)
                    || "partial".equals(status)) return 0;
            }
        }
        db.beginTransaction();
        try {
            ContentValues source=new ContentValues();
            source.put("id",sourceId); source.put("sha256",fileSha);
            source.put("source_kind","xlsx"); source.put("parser_version","m2-sheet-archive-1");
            source.put("status","staging");source.put("created_at",when);source.put("updated_at",when);
            db.insertWithOnConflict("import_sources",null,source,SQLiteDatabase.CONFLICT_REPLACE);
            int rowsInserted=0;
            java.util.Map<String,Integer> normalizedExpected=new java.util.HashMap<>();
            java.util.Iterator<String> names=sheets.keys();
            while(names.hasNext()){
                String name=names.next();
                JSONObject rows=sheets.getJSONObject(name);
                java.util.Iterator<String> keys=rows.keys();
                while(keys.hasNext()){
                    String key=keys.next();
                    int row=Integer.parseInt(key);
                    if(row<2) continue; // headers belong to workbook structure
                    JSONObject values=rows.getJSONObject(key);
                    if(values.length()==0) continue;
                    if(++rowsInserted>50_000) throw new IllegalArgumentException("Too many history rows");
                    ContentValues fact=new ContentValues();
                    fact.put("id",sourceId+":"+name+":"+row);
                    fact.put("source_id",sourceId);fact.put("sheet_name",name);
                    fact.put("row_number",row);fact.put("raw_json",values.toString());
                    fact.put("created_at",when);fact.put("updated_at",when);
                    db.insertOrThrow("sheet_import_rows",null,fact);

                    // Normalize only fields that carry unambiguous semantics.
                    // Never create individual orders from spreadsheet aggregates.
                    JSONObject normalized=SheetFactNormalizer.normalize(name,values);
                    if(normalized==null)continue;
                    String table=normalized.getString("table");
                    normalizedExpected.put(table,normalizedExpected.containsKey(table)
                        ? normalizedExpected.get(table)+1 : 1);
                    ContentValues checked=new ContentValues();
                    checked.put("id",sourceId+":"+name+":"+row);
                    checked.put("source_id",sourceId);
                    checked.put("created_at",when);
                    if("orders".equals(table)){
                        checked.put("source_kind","xlsx");
                        checked.put("updated_at",when);
                        checked.put("date",normalized.getString("date"));
                        checked.put("confidence",normalized.getString("confidence"));
                        checked.put("precision",normalized.getString("precision"));
                        for(String timestampField : new String[]{"accepted_at","completed_at"})
                            if(normalized.has(timestampField))
                                checked.put(timestampField,normalized.getString(timestampField));
                        if(normalized.has("reward_kopecks"))
                            checked.put("reward_kopecks",normalized.getLong("reward_kopecks"));
                    }else if("aggregate_order_counts".equals(table)){
                        checked.put("source_kind","xlsx");checked.put("updated_at",when);
                        checked.put("date",normalized.getString("date"));
                        checked.put("order_count",normalized.getInt("order_count"));
                        checked.put("confidence",normalized.getString("confidence"));
                    }else if("financial_ledger".equals(table)){
                        checked.put("source_kind","xlsx");checked.put("updated_at",when);
                        checked.put("date",normalized.getString("date"));
                        checked.put("kind",normalized.getString("kind"));
                        checked.put("amount_kopecks",normalized.getLong("amount_kopecks"));
                        checked.put("gross_or_net",normalized.optString("gross_or_net","unspecified"));
                        checked.put("confidence",normalized.getString("confidence"));
                    }else if("period_snapshots".equals(table)){
                        checked.put("source_kind","xlsx");checked.put("updated_at",when);
                        checked.put("period_start",normalized.getString("period_start"));
                        checked.put("period_end",normalized.getString("period_end"));
                        checked.put("seen_at",normalized.getString("seen_at"));
                        checked.put("precision",normalized.getString("precision"));
                        if(normalized.has("orders")) checked.put("orders",normalized.getInt("orders"));
                        if(normalized.has("accounted_hundredths")) checked.put("accounted_hundredths",normalized.getInt("accounted_hundredths"));
                    }else if("historical_forecasts".equals(table)){
                        checked.put("row_number",row);
                        checked.put("target_date",normalized.getString("target_date"));
                        checked.put("center_orders",normalized.getInt("center_orders"));
                        checked.put("source_status",normalized.getString("source_status"));
                        checked.put("record_json",values.toString());
                        for(String field : new String[]{"window_label","claimed_publication","claimed_model"})
                            if(normalized.has(field))checked.put(field,normalized.getString(field));
                        for(String field : new String[]{"lower_orders","upper_orders"})
                            if(normalized.has(field))checked.put(field,normalized.getInt(field));
                    }else if("historical_rule_specs".equals(table)){
                        checked.put("row_number",row);
                        checked.put("rule_label",normalized.getString("rule_label"));
                        checked.put("source_status",normalized.getString("source_status"));
                        if(normalized.has("rule_text"))
                            checked.put("rule_text",normalized.getString("rule_text"));
                    }else if("historical_model_specs".equals(table)){
                        checked.put("row_number",row);
                        checked.put("model_label",normalized.getString("model_label"));
                        checked.put("source_status",normalized.getString("source_status"));
                        if(normalized.has("model_state"))
                            checked.put("model_state",normalized.getString("model_state"));
                        if(normalized.has("declared_version"))
                            checked.put("declared_version",normalized.getString("declared_version"));
                    }else throw new SQLiteException("Unexpected sheet normalization table");
                    db.insertOrThrow(table,null,checked);
                }
            }
            long stored=countQuery(db,"SELECT COUNT(*) FROM sheet_import_rows WHERE source_id='"+sourceId+"'");
            if(stored!=rowsInserted) throw new SQLiteException("Sheet row parity mismatch");
            // Independent normalized-vs-source-row count check: a failed/partial
            // insert cannot silently mark an XLSX as fully migrated.
            for(java.util.Map.Entry<String,Integer> expectation:normalizedExpected.entrySet()){
                String table=expectation.getKey();
                if(!java.util.Arrays.asList("orders","aggregate_order_counts",
                    "financial_ledger","period_snapshots","historical_forecasts",
                    "historical_rule_specs","historical_model_specs").contains(table))
                    throw new SQLiteException("Unexpected source mapping in parity check");
                try(Cursor actual=db.rawQuery("SELECT COUNT(*) FROM "+table+" WHERE source_id=?",
                    new String[]{sourceId})){
                    if(!actual.moveToFirst()||actual.getInt(0)!=expectation.getValue())
                        throw new SQLiteException("M2 normalized count mismatch: "+table);
                }
            }
            // Source revisions are immutable evidence. Only one COMPLETE XLSX
            // revision is active; partial files never supersede verified facts.
            String[] required={"orders","aggregate_order_counts","financial_ledger",
                "period_snapshots","historical_forecasts","historical_rule_specs",
                "historical_model_specs"};
            long represented=countQuery(db,
                "SELECT COUNT(DISTINCT sheet_name) FROM sheet_import_rows WHERE source_id='"+sourceId+"'");
            boolean complete=sheets.length()==15 && represented==15;
            for(String category:required)
                complete &= normalizedExpected.getOrDefault(category,0)>0;
            // A later exported workbook can omit an already-confirmed
            // historic order or settlement. Preserve the last verified
            // projection and archive the reduced source for explicit review.
            // The owner may later approve a correction, never lose it silently.
            // Do not auto-promote a revision of a previously verified
            // workbook: equal row counts do not imply equal facts. Preserve
            // every new export as evidence until correction review.
            if(complete) {
                long preceding=countQuery(db,
                    "SELECT COUNT(*) FROM import_sources WHERE source_kind='xlsx'"+
                    " AND status='mirrored' AND id<>'"+sourceId+"'");
                if(preceding>0) complete=false;
            }
            if(complete) {
                for(String category:required) {
                    long older=countQuery(db,
                        "SELECT COUNT(*) FROM "+category+
                        " WHERE source_id IN (SELECT id FROM import_sources"+
                        " WHERE source_kind='xlsx' AND status='mirrored')");
                    if(normalizedExpected.getOrDefault(category,0)<older) {
                        complete=false;
                        break;
                    }
                }
            }
            if(complete) {
                ContentValues obsolete=new ContentValues();
                obsolete.put("status","superseded");obsolete.put("updated_at",when);
                db.update("import_sources",obsolete,
                    "source_kind=? AND status=? AND id<>?",
                    new String[]{"xlsx","mirrored",sourceId});
            }
            ContentValues success=new ContentValues();
            success.put("status",complete?"mirrored":"partial");
            success.put("updated_at",when);
            db.update("import_sources",success,"id=?",new String[]{sourceId});
            ContentValues audit=new ContentValues();
            audit.put("id","workbook:"+fileSha); audit.put("happened_at",when);
            audit.put("action","workbook_archived");audit.put("record_type","import_sources");
            audit.put("record_id",sourceId);audit.put("source_kind","xlsx");
            db.insertWithOnConflict("audit_events",null,audit,SQLiteDatabase.CONFLICT_IGNORE);
            db.setTransactionSuccessful();
            return rowsInserted;
        } finally {
            db.endTransaction();
        }
    }


    /**
     * Verify all fifteen archival sheets were committed as source evidence.
     * This does not invent any missing order or training cutoff. An incomplete
     * XLSX cannot switch the active storage backend.
     */
    public synchronized boolean hasCompleteWorkbook(String fileSha) {
        if(fileSha==null||!fileSha.matches("[0-9a-f]{64}"))return false;
        String sourceId="xlsx:"+fileSha;
        SQLiteDatabase db=getReadableDatabase();
        try(Cursor status=db.rawQuery(
            "SELECT status FROM import_sources WHERE id=?",new String[]{sourceId})) {
            if(!status.moveToFirst()||!"mirrored".equals(status.getString(0)))return false;
        }
        try(Cursor rows=db.rawQuery(
            "SELECT COUNT(DISTINCT sheet_name) FROM sheet_import_rows WHERE source_id=?",
            new String[]{sourceId})) {
            if(!rows.moveToFirst()||rows.getLong(0)!=15)return false;
        }
        // A 15-tab spreadsheet full of blanks/unknown values is NOT a
        // migration. Require independent source-grounded counts and ledgers
        // before allowing the WebView to switch its authoritative backend.
        for(String table:new String[]{"orders","aggregate_order_counts",
            "financial_ledger","period_snapshots","historical_forecasts",
            "historical_rule_specs","historical_model_specs"}) {
            try(Cursor facts=db.rawQuery("SELECT COUNT(*) FROM "+table+" WHERE source_id=?",
                new String[]{sourceId})) {
                if(!facts.moveToFirst()||facts.getLong(0)<1)return false;
            }
        }
        try(Cursor integrity=db.rawQuery("PRAGMA quick_check",null)) {
            if(!integrity.moveToFirst()||!"ok".equals(integrity.getString(0)))return false;
        }
        return true;
    }

    /**
     * The initial primary-store cutover is one-time and requires an independently
     * audited, SHA-pinned canonical export plus exact sheet/typed row parity.
     * A merely well-formed or truncated 15-tab workbook is NOT sufficient.
     * Later revisions remain archived pending reconciliation, not overwritten.
     */
    public synchronized boolean isApprovedPrimarySource(String sha) {
        if(!hasCompleteWorkbook(sha))return false;
        try(InputStream in=appContext.getAssets().open("www/m2_source_contract_v1.json");
            ByteArrayOutputStream buffer=new ByteArrayOutputStream()){
            byte[] chunk=new byte[4096];int count;
            while((count=in.read(chunk))!=-1){
                buffer.write(chunk,0,count);
                if(buffer.size()>16384)return false;
            }
            JSONObject contract=new JSONObject(new String(buffer.toByteArray(),StandardCharsets.UTF_8));
            if(!sha.equals(contract.getString("sha256")))return false;
            String sourceId="xlsx:"+sha;
            SQLiteDatabase database=getReadableDatabase();
            JSONObject sheetCounts=contract.getJSONObject("source_rows");
            java.util.Iterator<String> names=sheetCounts.keys();
            while(names.hasNext()){
                String sheet=names.next();
                try(Cursor c=database.rawQuery(
                    "SELECT COUNT(*) FROM sheet_import_rows WHERE source_id=? AND sheet_name=?",
                    new String[]{sourceId,sheet})){
                    if(!c.moveToFirst()||c.getInt(0)!=sheetCounts.getInt(sheet))return false;
                }
            }
            if(sheetCounts.length()!=15)return false;
            JSONObject typed=contract.getJSONObject("typed_rows");
            java.util.Iterator<String> tables=typed.keys();
            while(tables.hasNext()){
                String name=tables.next();
                if(!java.util.Arrays.asList("orders","aggregate_order_counts",
                    "financial_ledger","period_snapshots","historical_forecasts",
                    "historical_rule_specs","historical_model_specs").contains(name))return false;
                try(Cursor c=database.rawQuery("SELECT COUNT(*) FROM "+name+" WHERE source_id=?",
                    new String[]{sourceId})){
                    if(!c.moveToFirst()||c.getInt(0)!=typed.getInt(name))return false;
                }
            }
            return typed.length()==7;
        }catch(Exception failure){
            return false; // Keep the existing JSON source authoritative.
        }
    }

    /**
     * Return the exact latest persisted app state, only after verifying the
     * source SHA. A damaged/missing DB must never masquerade as an empty day.
     */
    public synchronized String readVerifiedState() throws Exception {
        try(Cursor cursor=getReadableDatabase().rawQuery(
            "SELECT state_json,sha256 FROM legacy_state WHERE id=1",null)) {
            if(!cursor.moveToFirst())return null;
            String value=cursor.getString(0),expected=cursor.getString(1);
            if(value==null||!sha256(value).equals(expected))
                throw new SQLiteException("M2 state checksum mismatch");
            return value;
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
