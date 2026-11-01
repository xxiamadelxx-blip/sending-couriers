package ru.courier.finance;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read already committed video orders for a durable forecast handoff. */
public final class VideoForecastRecovery {
    private static final ZoneId MOSCOW=ZoneId.of("Europe/Moscow");
    private static final String RECOVERY_VERSION="ocr-time-pairs-v1";
    private VideoForecastRecovery() {}

    /** Repair missing timestamps from the video's immutable OCR frames once per recovery version. */
    public static String reconcileAndRead(Context context,CourierDatabase store,String hash) throws Exception {
        validate(hash);
        SharedPreferences prefs=context.getSharedPreferences("m4-video-time-recovery",Context.MODE_PRIVATE);
        String key=RECOVERY_VERSION+":"+hash;
        if(!prefs.getBoolean(key,false)&&reconcile(context,store,hash))
            prefs.edit().putBoolean(key,true).commit();
        return read(store,hash);
    }

    private static boolean reconcile(Context context,CourierDatabase store,String hash) throws Exception {
        VideoImportDatabase evidence=new VideoImportDatabase(context);
        List<VideoOrderTimePairs.Frame> frames=new ArrayList<>();
        try {
            try(Cursor cursor=evidence.getReadableDatabase().rawQuery(
                    "SELECT o.frame_sha256,o.ocr_text FROM m4_screen_observations o "
                    +"JOIN m4_video_imports v ON v.id=o.import_id "
                    +"WHERE v.source_sha256=? ORDER BY o.frame_index LIMIT 601",
                    new String[]{hash})) {
                while(cursor.moveToNext()) {
                    if(frames.size()>=600) throw new IllegalStateException("Video OCR frame limit exceeded");
                    frames.add(new VideoOrderTimePairs.Frame(cursor.getString(0),cursor.getString(1)));
                }
            }
        } finally { evidence.close(); }
        if(frames.isEmpty()) return false;
        List<VideoOrderTimePairs.Pair> pairs=VideoOrderTimePairs.extract(frames);
        Map<String,VideoOrderTimePairs.Pair> byCompletion=new HashMap<>();
        for(VideoOrderTimePairs.Pair pair:pairs) byCompletion.put(pair.completed,pair);
        SQLiteDatabase db=store.getWritableDatabase();
        Map<String,Integer> counts=new HashMap<>();
        List<String[]> rows=new ArrayList<>();
        String source="video:"+hash;
        try(Cursor cursor=db.rawQuery(
                "SELECT id,date,observed_at,accepted_at,completed_at,yandex_order_id,reward_kopecks "
                +"FROM orders WHERE source_id=? ORDER BY id LIMIT 2001",new String[]{source})) {
            while(cursor.moveToNext()) {
                if(rows.size()>=2000) throw new IllegalStateException("Video order limit exceeded");
                String date=cursor.getString(1),observed=cursor.getString(2);
                Integer visible=minute(observed);
                if(date==null||visible==null) continue;
                String end=String.format(java.util.Locale.ROOT,"%sT%02d:%02d",date,visible/60,visible%60);
                counts.put(end,counts.containsKey(end)?counts.get(end)+1:1);
                rows.add(new String[]{cursor.getString(0),end,cursor.getString(3),cursor.getString(4),
                    cursor.getString(5),cursor.isNull(6)?null:cursor.getString(6)});
            }
        }
        int recovered=0;
        db.beginTransaction();
        try {
            for(String[] row:rows) {
                VideoOrderTimePairs.Pair pair=byCompletion.get(row[1]);
                if(pair==null||counts.get(row[1])!=1||row[2]!=null||row[3]!=null) continue;
                if(row[4]!=null&&!pair.orderNumbers.contains(row[4])) continue;
                if(!pair.amounts.isEmpty()&&(row[5]==null||!pair.amounts.contains(row[5]))) continue;
                String accepted=toUtc(pair.accepted),completed=toUtc(pair.completed);
                ContentValues values=new ContentValues();
                values.put("accepted_at",accepted);values.put("completed_at",completed);
                values.put("confidence","confirmed");values.put("precision","ocr_time_pair_crosschecked");
                values.put("updated_at",Instant.now().toString());
                recovered+=db.update("orders",values,"id=? AND source_id=? AND accepted_at IS NULL AND completed_at IS NULL",
                    new String[]{row[0],source});
            }
            if(recovered>0) {
                ContentValues audit=new ContentValues();
                audit.put("id",source+":"+RECOVERY_VERSION);
                audit.put("happened_at",Instant.now().toString());
                audit.put("action","video_order_times_recovered");audit.put("record_type","video_import");
                audit.put("record_id",source);audit.put("source_kind","video_import");
                audit.put("payload_json",new JSONObject().put("matchedRows",recovered)
                    .put("distinctTimePairs",pairs.size()).toString());
                db.insertWithOnConflict("audit_events",null,audit,SQLiteDatabase.CONFLICT_IGNORE);
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return true;
    }

    private static String toUtc(String local) {
        return LocalDateTime.parse(local).atZone(MOSCOW).toInstant().toString();
    }

    public static String read(CourierDatabase store,String hash) throws Exception {
        validate(hash);
        JSONArray orders=new JSONArray();
        SQLiteDatabase db=store.getReadableDatabase();
        try(Cursor cursor=db.rawQuery(
                "SELECT id,date,observed_at,accepted_at,completed_at,yandex_order_id,precision "
                +"FROM orders WHERE source_id=? ORDER BY date,observed_at,id LIMIT 2001",
                new String[]{"video:"+hash})) {
            while(cursor.moveToNext()) {
                if(orders.length()>=2000) throw new IllegalStateException("Video order limit exceeded");
                String date=cursor.getString(1),observed=cursor.getString(2);
                if(date==null||!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) continue;
                Integer visible=minute(observed),accepted=minute(cursor.getString(3)),
                    delivered=minute(cursor.getString(4));
                JSONObject row=new JSONObject().put("id",cursor.getString(0))
                    .put("date",date).put("visibleMin",visible==null?JSONObject.NULL:visible)
                    .put("acceptedMin",accepted==null?JSONObject.NULL:accepted)
                    .put("deliveredMin",delivered==null?JSONObject.NULL:delivered)
                    .put("orderNumber",cursor.getString(5)==null?JSONObject.NULL:cursor.getString(5))
                    .put("source","video:"+hash).put("confidence",
                        accepted!=null&&delivered!=null
                            ?"ocr_time_pair_crosschecked".equals(cursor.getString(6))
                                ?"ORDER_DETAIL_TIME_CROSSCHECKED":"ORDER_DETAIL_MATCHED"
                            :"LIST_ROW_CROSSCHECKED")
                    .put("confirmed",accepted!=null&&delivered!=null);
                String source="video:"+hash;
                row.put("fieldSources",new JSONObject()
                    .put("visibleMin",new JSONObject().put("status",visible==null?"UNKNOWN":"CONFIRMED").put("source",source))
                    .put("acceptedMin",new JSONObject().put("status",accepted==null?"UNKNOWN":"CONFIRMED").put("source",source))
                    .put("deliveredMin",new JSONObject().put("status",delivered==null?"UNKNOWN":"CONFIRMED").put("source",source)));
                orders.put(row);
            }
        }
        return new JSONObject().put("ok",true).put("orders",orders).toString();
    }

    private static Integer minute(String utc) {
        if(utc==null||utc.isEmpty()) return null;
        ZonedDateTime local=Instant.parse(utc).atZone(MOSCOW);
        return local.getHour()*60+local.getMinute();
    }

    private static void validate(String hash) {
        if(hash==null||!hash.matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("Invalid video source");
    }
}
