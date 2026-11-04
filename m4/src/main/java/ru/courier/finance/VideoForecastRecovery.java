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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read already committed video orders for a durable forecast handoff. */
public final class VideoForecastRecovery {
    private static final ZoneId MOSCOW=ZoneId.of("Europe/Moscow");
    private static final String RECOVERY_VERSION="ocr-time-pairs-v5";
    private VideoForecastRecovery() {}

    /** Recompute from immutable OCR frames on each read so old reports cannot mask parser fixes. */
    public static String reconcileAndRead(Context context,CourierDatabase store,String hash) throws Exception {
        validate(hash);
        SharedPreferences prefs=context.getSharedPreferences("m4-video-time-recovery",Context.MODE_PRIVATE);
        String key=RECOVERY_VERSION+":"+hash;
        String report=reconcile(context,store,hash).toString();
        if(!prefs.edit().putString(key,report).commit())
            throw new IllegalStateException("Recovery report could not be saved");
        return new JSONObject(read(store,hash)).put("recovery",new JSONObject(report)).toString();
    }

    /** Re-imports repair the existing source from fresh OCR without duplicating any order. */
    public static JSONObject reconcileFreshAnalysis(Context context,CourierDatabase store,
                                                    VideoImportProcessor.Result analysis) throws Exception {
        validate(analysis.sourceSha256);
        List<VideoOrderTimePairs.Frame> frames=new ArrayList<>();
        for(VideoImportProcessor.Observation observation:analysis.observations)
            frames.add(new VideoOrderTimePairs.Frame(observation.frameSha256,observation.ocrText,
                observation.candidates));
        JSONObject report=applyPairs(store,analysis.sourceSha256,frames,analysis.uniqueCandidateCount("ORDER_DETAIL"));
        String key=RECOVERY_VERSION+":"+analysis.sourceSha256;
        if(!context.getSharedPreferences("m4-video-time-recovery",Context.MODE_PRIVATE)
                .edit().putString(key,report.toString()).commit())
            throw new IllegalStateException("Fresh OCR recovery report could not be saved");
        return report;
    }

    private static JSONObject reconcile(Context context,CourierDatabase store,String hash) throws Exception {
        VideoImportDatabase evidence=new VideoImportDatabase(context);
        List<VideoOrderTimePairs.Frame> frames=new ArrayList<>();
        Map<String,VideoOrderTimePairs.Frame> byObservation=new HashMap<>();
        int savedDetails=0;
        try {
            try(Cursor cursor=evidence.getReadableDatabase().rawQuery(
                    "SELECT o.id,o.frame_sha256,o.ocr_text FROM m4_screen_observations o "
                    +"JOIN m4_video_imports v ON v.id=o.import_id "
                    +"WHERE v.source_sha256=? ORDER BY o.frame_index LIMIT 601",
                    new String[]{hash})) {
                while(cursor.moveToNext()) {
                    if(frames.size()>=600) throw new IllegalStateException("Video OCR frame limit exceeded");
                    VideoOrderTimePairs.Frame frame=new VideoOrderTimePairs.Frame(cursor.getString(1),cursor.getString(2));
                    frames.add(frame);byObservation.put(cursor.getString(0),frame);
                }
            }
            try(Cursor cursor=evidence.getReadableDatabase().rawQuery(
                    "SELECT c.observation_id,c.candidate_json FROM m4_extracted_candidates c "
                    +"JOIN m4_screen_observations o ON o.id=c.observation_id "
                    +"JOIN m4_video_imports v ON v.id=o.import_id "
                    +"WHERE v.source_sha256=? AND c.candidate_type='ORDER_DETAIL' LIMIT 3001",
                    new String[]{hash})) {
                while(cursor.moveToNext()) {
                    if(savedDetails>=3000) throw new IllegalStateException("Saved detail limit exceeded");
                    VideoOrderTimePairs.Frame frame=byObservation.get(cursor.getString(0));
                    if(frame==null) continue;
                    try {
                        JSONObject value=new JSONObject(cursor.getString(1));
                        JSONObject fields=value.getJSONObject("fields");
                        List<YandexScreenParser.Field> parsed=new ArrayList<>();
                        for(java.util.Iterator<String> names=fields.keys();names.hasNext();) {
                            String name=names.next();JSONObject field=fields.getJSONObject(name);
                            parsed.add(new YandexScreenParser.Field(name,field.getString("type"),field.getString("value")));
                        }
                        frame.savedCandidates.add(new YandexScreenParser.Candidate("ORDER_DETAIL",0.92f,parsed));
                        savedDetails++;
                    } catch(org.json.JSONException malformed) { /* Keep immutable OCR text as fallback. */ }
                }
            }
        } finally { evidence.close(); }
        if(frames.isEmpty()) return new JSONObject().put("frames",0).put("savedDetails",0)
            .put("timePairs",0).put("newRows",0).put("status","NO_SAVED_VIDEO");
        return applyPairs(store,hash,frames,savedDetails);
    }

    private static JSONObject applyPairs(CourierDatabase store,String hash,
                                         List<VideoOrderTimePairs.Frame> frames,int savedDetails) throws Exception {
        List<VideoOrderTimePairs.Pair> pairs=VideoOrderTimePairs.extract(frames);
        Map<String,List<VideoOrderTimePairs.Pair>> byCompletion=new HashMap<>();
        Map<String,List<VideoOrderTimePairs.Pair>> byOrderNumber=new HashMap<>();
        for(VideoOrderTimePairs.Pair pair:pairs) {
            byCompletion.computeIfAbsent(pair.completed,k->new ArrayList<>()).add(pair);
            if(pair.orderNumber!=null) byOrderNumber.computeIfAbsent(pair.orderNumber,k->new ArrayList<>()).add(pair);
        }
        SQLiteDatabase db=store.getWritableDatabase();
        Map<String,Integer> counts=new HashMap<>(),orderNumberCounts=new HashMap<>();
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
                String orderNumber=cursor.getString(5);
                if(orderNumber!=null) orderNumberCounts.put(orderNumber,
                    orderNumberCounts.containsKey(orderNumber)?orderNumberCounts.get(orderNumber)+1:1);
                rows.add(new String[]{cursor.getString(0),end,cursor.getString(3),cursor.getString(4),
                    orderNumber,cursor.isNull(6)?null:cursor.getString(6)});
            }
        }
        int recovered=0,alreadyComplete=0;
        int matchedByOrderId=0,matchedByUniqueCompletion=0,ambiguousMatches=0,unmatchedPairs=0;
        db.beginTransaction();
        try {
            for(String[] row:rows) {
                if(row[2]!=null&&row[3]!=null) { alreadyComplete++;continue; }
                VideoOrderTimePairs.Pair pair=null;boolean matchedById=false;
                if(row[4]!=null&&orderNumberCounts.get(row[4])==1) {
                    List<VideoOrderTimePairs.Pair> exact=byOrderNumber.get(row[4]);
                    if(exact!=null&&exact.size()==1&&row[1].equals(exact.get(0).completed)) {
                        pair=exact.get(0);matchedById=true;
                    }
                }
                if(pair==null) {
                    List<VideoOrderTimePairs.Pair> completionPairs=byCompletion.get(row[1]);
                    if(completionPairs==null||completionPairs.isEmpty()) { unmatchedPairs++;continue; }
                    if(counts.get(row[1])!=1) {
                        // The rows need no arbitrary identity assignment when
                        // all independently observed cards have the same times.
                        VideoOrderTimePairs.Pair shared=VideoOrderTimePairs.commonTimesForDistinctOrders(
                            completionPairs,counts.get(row[1]));
                        if(shared==null) { ambiguousMatches++;continue; }
                        Set<String> knownIds=new HashSet<>();
                        boolean conflicting=false;
                        String sharedStart=toUtc(shared.accepted),sharedEnd=toUtc(shared.completed);
                        for(String[] other:rows) {
                            if(!row[1].equals(other[1])) continue;
                            if((other[2]!=null&&!other[2].equals(sharedStart))
                                    ||(other[3]!=null&&!other[3].equals(sharedEnd))) conflicting=true;
                            if(other[4]!=null) {
                                boolean found=false;
                                for(VideoOrderTimePairs.Pair candidate:completionPairs)
                                    if(other[4].equals(candidate.orderNumber)) found=true;
                                if(!found||!knownIds.add(other[4])) conflicting=true;
                            }
                        }
                        if(conflicting) { ambiguousMatches++;continue; }
                        if(row[4]==null) pair=shared;
                        else for(VideoOrderTimePairs.Pair candidate:completionPairs)
                            if(row[4].equals(candidate.orderNumber)) pair=candidate;
                        if(pair==null) { ambiguousMatches++;continue; }
                        String sharedAccepted=toUtc(pair.accepted),sharedCompleted=toUtc(pair.completed);
                        if((row[2]!=null&&!row[2].equals(sharedAccepted))
                                ||(row[3]!=null&&!row[3].equals(sharedCompleted))) {
                            ambiguousMatches++;continue;
                        }
                    }
                    List<VideoOrderTimePairs.Pair> compatible=new ArrayList<>();
                    for(VideoOrderTimePairs.Pair candidate:completionPairs) {
                        if(row[4]!=null&&candidate.orderNumber!=null&&!candidate.orderNumber.equals(row[4])) continue;
                        compatible.add(candidate);
                    }
                    if(pair==null&&compatible.size()>1&&row[5]!=null) {
                        List<VideoOrderTimePairs.Pair> amountMatches=new ArrayList<>();
                        for(VideoOrderTimePairs.Pair candidate:compatible)
                            if(row[5].equals(candidate.amount)||candidate.amounts.contains(row[5])) amountMatches.add(candidate);
                        if(amountMatches.size()==1) compatible=amountMatches;
                    }
                    if(pair==null) {
                        if(compatible.size()!=1) { ambiguousMatches++;continue; }
                        pair=compatible.get(0);
                    }
                }
                boolean orderIdMatches=row[4]!=null&&!pair.orderNumbers.isEmpty()
                    &&pair.orderNumbers.contains(row[4]);
                if(row[4]!=null&&!pair.orderNumbers.isEmpty()&&!orderIdMatches) continue;
                // Multi-frame time evidence is independent of the list's reward:
                // tips and demand coefficients can make the displayed amounts differ.
                // A single-frame pair still needs a second anchor before it is used.
                if(pair.frames<2&&!orderIdMatches
                        &&(row[5]==null||!pair.amounts.contains(row[5]))) continue;
                String accepted=toUtc(pair.accepted),completed=toUtc(pair.completed);
                ContentValues values=new ContentValues();
                if(row[2]==null) values.put("accepted_at",accepted);
                if(row[3]==null) values.put("completed_at",completed);
                values.put("confidence","confirmed");values.put("precision","ocr_time_pair_crosschecked");
                values.put("updated_at",Instant.now().toString());
                int updated=db.update("orders",values,"id=? AND source_id=? AND (accepted_at IS NULL OR completed_at IS NULL)",
                    new String[]{row[0],source});
                recovered+=updated;
                if(updated>0) {
                    if(matchedById) matchedByOrderId++;
                    else matchedByUniqueCompletion++;
                }
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
        return new JSONObject().put("frames",frames.size()).put("savedDetails",savedDetails)
            .put("timePairs",pairs.size()).put("alreadyComplete",alreadyComplete).put("newRows",recovered)
            .put("matchedByOrderId",matchedByOrderId).put("matchedByUniqueCompletion",matchedByUniqueCompletion)
            .put("ambiguousMatches",ambiguousMatches).put("unmatchedPairs",unmatchedPairs).put("status","CHECKED");
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
