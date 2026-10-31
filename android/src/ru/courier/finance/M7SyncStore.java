package ru.courier.finance;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.TreeSet;
import java.util.UUID;

/** Durable local queue and explicit conflict ledger for the opt-in M7 sheet sync. */
public final class M7SyncStore {
    public static final String TYPE_ENTRY="entry", TYPE_CLOSURE="closure", TYPE_SETTINGS="settings";
    public static final String ACTION_UPSERT="UPSERT", ACTION_DELETE="DELETE";
    public static final String REMOTE_MISSING="MISSING";
    private static final String META_ENABLED="enabled", META_LAST_SYNC="last_sync_at", META_RETRY_AT="retry_at", META_LAST_ERROR="last_error";
    private final CourierDatabase helper;

    public M7SyncStore(CourierDatabase helper) { this.helper=helper; }

    public synchronized boolean enabled() { return "true".equals(meta(META_ENABLED)); }
    public synchronized void setEnabled(boolean enabled) { putMeta(META_ENABLED,enabled?"true":"false"); }
    public synchronized long retryAt() { try{return Long.parseLong(meta(META_RETRY_AT));}catch(Exception ignored){return 0;} }
    public synchronized void setRetryAt(long when) { putMeta(META_RETRY_AT,Long.toString(Math.max(0,when))); }
    public synchronized void setLastError(String value) { putMeta(META_LAST_ERROR,value==null?"":value.substring(0,Math.min(value.length(),500))); }
    public synchronized void markSyncComplete() { putMeta(META_LAST_SYNC,now());setRetryAt(0);setLastError(""); }

    public synchronized void recordLocalChanges(String before,String after) throws Exception {
        if(!enabled())return;
        Map<String,Record> oldRows=records(before),newRows=records(after);
        Set<String> keys=new TreeSet<>();keys.addAll(oldRows.keySet());keys.addAll(newRows.keySet());
        for(String key:keys) {
            Record old=oldRows.get(key),current=newRows.get(key);
            if(old!=null&&current!=null&&old.hash.equals(current.hash))continue;
            Record sample=current==null?old:current;
            String action=current==null?ACTION_DELETE:ACTION_UPSERT;
            enqueue(sample.type,sample.id,action,current==null?null:current.payload,headHash(sample.type,sample.id));
        }
    }

    public synchronized Map<String,Record> currentRecords(String state) throws Exception { return records(state); }

    private Map<String,Record> records(String raw) throws Exception {
        Map<String,Record> out=new HashMap<>();
        if(raw==null||raw.isEmpty())return out;
        JSONObject state=new JSONObject(raw);
        JSONArray entries=state.optJSONArray("entries");
        if(entries!=null)for(int i=0;i<entries.length();i++) {
            JSONObject entry=entries.optJSONObject(i);if(entry==null)continue;
            String id=entry.optString("id","");if(id.isEmpty())continue;
            add(out,new Record(TYPE_ENTRY,id,ACTION_UPSERT,canonical(entry),0));
        }
        JSONObject closures=state.optJSONObject("closures");
        if(closures!=null)for(java.util.Iterator<String> it=closures.keys();it.hasNext();) {
            String id=it.next();Object value=closures.opt(id);
            if(value instanceof JSONObject)add(out,new Record(TYPE_CLOSURE,id,ACTION_UPSERT,canonical((JSONObject)value),0));
        }
        JSONObject settings=state.optJSONObject("settings");
        if(settings!=null)add(out,new Record(TYPE_SETTINGS,"global",ACTION_UPSERT,canonical(settings),0));
        return out;
    }

    private static void add(Map<String,Record> rows,Record row) throws Exception {
        row.hash=hash(row.action,row.payload);rows.put(key(row.type,row.id),row);
    }

    private static String key(String type,String id) { return type+"\u001f"+id; }

    public synchronized List<Event> pending() {
        List<Event> out=new ArrayList<>();SQLiteDatabase db=helper.getReadableDatabase();
        try(Cursor c=db.rawQuery("SELECT id,record_type,record_id,action,base_hash,payload_hash,payload_json,attempts FROM sync_queue WHERE state='pending' AND payload_hash IS NOT NULL ORDER BY created_at,id",null)) {
            while(c.moveToNext())out.add(new Event(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.isNull(4)?null:c.getString(4),c.getString(5),c.isNull(6)?null:c.getString(6),c.getInt(7)));
        }
        return out;
    }

    public synchronized Map<String,Head> heads() {
        Map<String,Head> out=new HashMap<>();SQLiteDatabase db=helper.getReadableDatabase();
        try(Cursor c=db.rawQuery("SELECT record_type,record_id,action,payload_json,payload_hash,event_id,remote_row FROM m7_sync_heads",null)) {
            while(c.moveToNext()) {
                Head h=new Head(c.getString(0),c.getString(1),c.getString(2),c.isNull(3)?null:c.getString(3),c.getString(4),c.getString(5),c.getLong(6));
                out.put(key(h.type,h.recordId),h);
            }
        }
        return out;
    }

    public synchronized void saveHead(Event event,long remoteRow) { saveHead(event.type,event.recordId,event.action,event.payload,event.payloadHash,event.id,remoteRow); }
    public synchronized void saveHead(RemoteEvent event) { saveHead(event.type,event.recordId,event.action,event.payload,event.payloadHash,event.id,event.row); }
    private void saveHead(String type,String recordId,String action,String payload,String hash,String eventId,long row) {
        ContentValues v=new ContentValues();v.put("record_type",type);v.put("record_id",recordId);v.put("action",action);
        if(payload==null)v.putNull("payload_json");else v.put("payload_json",payload);
        v.put("payload_hash",hash);v.put("event_id",eventId);v.put("remote_row",Math.max(0,row));v.put("updated_at",now());
        helper.getWritableDatabase().insertWithOnConflict("m7_sync_heads",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    public synchronized void removeHead(String type,String recordId) { helper.getWritableDatabase().delete("m7_sync_heads","record_type=? AND record_id=?",new String[]{type,recordId}); }
    public synchronized String headHash(String type,String recordId) {
        try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT payload_hash FROM m7_sync_heads WHERE record_type=? AND record_id=?",new String[]{type,recordId})) {
            return c.moveToFirst()?c.getString(0):null;
        }
    }

    public synchronized Event enqueue(String type,String recordId,String action,String payload,String baseHash) throws Exception {
        String payloadHash=hash(action,payload),when=now();SQLiteDatabase db=helper.getWritableDatabase();
        db.beginTransaction();
        try {
            String existing=null;
            try(Cursor c=db.rawQuery("SELECT id FROM sync_queue WHERE record_type=? AND record_id=? AND state='pending' ORDER BY created_at DESC LIMIT 1",new String[]{type,recordId})) { if(c.moveToFirst())existing=c.getString(0); }
            ContentValues values=new ContentValues();values.put("record_type",type);values.put("record_id",recordId);values.put("action",action);
            values.put("state","pending");values.put("updated_at",when);values.put("base_hash",baseHash);values.put("payload_hash",payloadHash);
            if(payload==null)values.putNull("payload_json");else values.put("payload_json",payload);
            values.putNull("last_error");
            Event event;
            if(existing!=null) {
                values.put("attempts",0);db.update("sync_queue",values,"id=?",new String[]{existing});
                event=new Event(existing,type,recordId,action,baseHash,payloadHash,payload,0);
            } else {
                String id=UUID.randomUUID().toString();values.put("id",id);values.put("attempts",0);values.put("created_at",when);
                db.insertOrThrow("sync_queue",null,values);event=new Event(id,type,recordId,action,baseHash,payloadHash,payload,0);
            }
            db.setTransactionSuccessful();return event;
        } finally { db.endTransaction(); }
    }

    public synchronized Event pendingFor(String type,String recordId) {
        try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT id,record_type,record_id,action,base_hash,payload_hash,payload_json,attempts FROM sync_queue WHERE record_type=? AND record_id=? AND state='pending' AND payload_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1",new String[]{type,recordId})) {
            return c.moveToFirst()?new Event(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.isNull(4)?null:c.getString(4),c.getString(5),c.isNull(6)?null:c.getString(6),c.getInt(7)):null;
        }
    }
    public synchronized boolean hasOpenConflict(String type,String recordId) {
        try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT 1 FROM m7_sync_conflicts WHERE record_type=? AND record_id=? AND state='open' LIMIT 1",new String[]{type,recordId})) { return c.moveToFirst(); }
    }
    public synchronized void markDelivered(String eventId) { helper.getWritableDatabase().execSQL("UPDATE sync_queue SET state='done',updated_at=?,last_error=NULL WHERE id=?",new Object[]{now(),eventId}); }
    public synchronized void markConflict(String eventId) { helper.getWritableDatabase().execSQL("UPDATE sync_queue SET state='conflict',updated_at=? WHERE id=?",new Object[]{now(),eventId}); }
    public synchronized void recordAttempt(String eventId,String message) {
        helper.getWritableDatabase().execSQL("UPDATE sync_queue SET attempts=attempts+1,updated_at=?,last_error=? WHERE id=?",new Object[]{now(),message==null?"":message,eventId});
    }
    public synchronized void rebasePending(String type,String recordId,String oldBase,String newBase) {
        SQLiteDatabase db=helper.getWritableDatabase();
        if(oldBase==null)db.execSQL("UPDATE sync_queue SET base_hash=?,updated_at=? WHERE record_type=? AND record_id=? AND state='pending' AND base_hash IS NULL",new Object[]{newBase,now(),type,recordId});
        else db.execSQL("UPDATE sync_queue SET base_hash=?,updated_at=? WHERE record_type=? AND record_id=? AND state='pending' AND base_hash=?",new Object[]{newBase,now(),type,recordId,oldBase});
    }

    public synchronized void createConflict(String type,String recordId,String localAction,String localPayload,String remoteAction,String remotePayload,String remoteEventId) throws Exception {
        String localHash=hash(localAction,localPayload),remoteHash=remoteAction.equals(REMOTE_MISSING)?hash(REMOTE_MISSING,null):hash(remoteAction,remotePayload);
        SQLiteDatabase db=helper.getWritableDatabase();ContentValues v=new ContentValues();v.put("record_type",type);v.put("record_id",recordId);
        v.put("local_action",localAction);if(localPayload==null)v.putNull("local_payload_json");else v.put("local_payload_json",localPayload);
        v.put("local_hash",localHash);v.put("remote_action",remoteAction);if(remotePayload==null)v.putNull("remote_payload_json");else v.put("remote_payload_json",remotePayload);
        v.put("remote_hash",remoteHash);if(remoteEventId==null)v.putNull("remote_event_id");else v.put("remote_event_id",remoteEventId);v.put("state","open");v.put("created_at",now());
        db.insertWithOnConflict("m7_sync_conflicts",null,v,SQLiteDatabase.CONFLICT_REPLACE);
        Event queued=pendingFor(type,recordId);if(queued!=null)markConflict(queued.id);
    }

    public synchronized List<Conflict> conflicts() {
        List<Conflict> out=new ArrayList<>();
        try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT id,record_type,record_id,local_action,local_payload_json,local_hash,remote_action,remote_payload_json,remote_hash,remote_event_id FROM m7_sync_conflicts WHERE state='open' ORDER BY created_at,id LIMIT 100",null)) {
            while(c.moveToNext())out.add(new Conflict(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.isNull(4)?null:c.getString(4),c.getString(5),c.getString(6),c.isNull(7)?null:c.getString(7),c.getString(8),c.isNull(9)?null:c.getString(9)));
        }
        return out;
    }

    public synchronized Conflict conflict(String id) {
        try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT id,record_type,record_id,local_action,local_payload_json,local_hash,remote_action,remote_payload_json,remote_hash,remote_event_id FROM m7_sync_conflicts WHERE id=? AND state='open'",new String[]{id})) {
            return c.moveToFirst()?new Conflict(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.isNull(4)?null:c.getString(4),c.getString(5),c.getString(6),c.isNull(7)?null:c.getString(7),c.getString(8),c.isNull(9)?null:c.getString(9)):null;
        }
    }

    public synchronized void resolveLocal(Conflict conflict,String currentState) throws Exception {
        Record current=records(currentState).get(key(conflict.type,conflict.recordId));
        String action=current==null?ACTION_DELETE:ACTION_UPSERT,payload=current==null?null:current.payload;
        if(REMOTE_MISSING.equals(conflict.remoteAction))removeHead(conflict.type,conflict.recordId);
        else saveHead(conflict.type,conflict.recordId,conflict.remoteAction,conflict.remotePayload,conflict.remoteHash,conflict.remoteEventId,0);
        enqueue(conflict.type,conflict.recordId,action,payload,REMOTE_MISSING.equals(conflict.remoteAction)?null:conflict.remoteHash);
        resolve(conflict.id,"local");
    }

    public synchronized RemoteEvent resolveRemote(Conflict conflict) {
        RemoteEvent remote=null;
        if(REMOTE_MISSING.equals(conflict.remoteAction)) {
            removeHead(conflict.type,conflict.recordId);
            remote=new RemoteEvent("missing-"+conflict.id,conflict.type,conflict.recordId,REMOTE_MISSING,null,conflict.remoteHash,null,0);
        } else {
            remote=new RemoteEvent(conflict.remoteEventId==null?"resolved-"+conflict.id:conflict.remoteEventId,conflict.type,conflict.recordId,conflict.remoteAction,null,conflict.remoteHash,conflict.remotePayload,0);
        }
        helper.getWritableDatabase().execSQL("UPDATE sync_queue SET state='done',updated_at=? WHERE record_type=? AND record_id=? AND state='conflict'",new Object[]{now(),conflict.type,conflict.recordId});
        resolve(conflict.id,"remote");return remote;
    }

    private void resolve(String id,String choice) { helper.getWritableDatabase().execSQL("UPDATE m7_sync_conflicts SET state=?,resolved_at=? WHERE id=? AND state='open'",new Object[]{choice,now(),id}); }

    public synchronized JSONObject status() throws JSONException {
        SQLiteDatabase db=helper.getReadableDatabase();int pending=count(db,"SELECT COUNT(*) FROM sync_queue WHERE state='pending' AND payload_hash IS NOT NULL"),conflicts=count(db,"SELECT COUNT(*) FROM m7_sync_conflicts WHERE state='open'");
        return new JSONObject().put("enabled",enabled()).put("pending",pending).put("conflicts",conflicts).put("lastSyncAt",meta(META_LAST_SYNC)).put("retryAt",retryAt()).put("lastError",meta(META_LAST_ERROR));
    }
    private static int count(SQLiteDatabase db,String sql) { try(Cursor c=db.rawQuery(sql,null)){return c.moveToFirst()?c.getInt(0):0;} }
    private String meta(String key) {
        try(Cursor c=helper.getReadableDatabase().rawQuery("SELECT value FROM m7_sync_meta WHERE key=?",new String[]{key})){return c.moveToFirst()?c.getString(0):"";}
    }
    private void putMeta(String key,String value) {
        ContentValues v=new ContentValues();v.put("key",key);v.put("value",value==null?"":value);v.put("updated_at",now());
        helper.getWritableDatabase().insertWithOnConflict("m7_sync_meta",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    private static String now() {
        SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(new Date());
    }

    public static String hash(String action,String payload) throws Exception {
        String value=action+"\n"+(payload==null?"":payload);
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder(64);
        for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&0xff));return out.toString();
    }
    public static String canonical(JSONObject value) throws JSONException {
        List<String> names=new ArrayList<>();for(java.util.Iterator<String> it=value.keys();it.hasNext();)names.add(it.next());Collections.sort(names);
        StringBuilder out=new StringBuilder("{");boolean first=true;
        for(String name:names){if(!first)out.append(',');first=false;out.append(JSONObject.quote(name)).append(':').append(canonicalValue(value.opt(name)));}
        return out.append('}').toString();
    }
    private static String canonicalValue(Object value) throws JSONException {
        if(value==null||value==JSONObject.NULL)return "null";
        if(value instanceof JSONObject)return canonical((JSONObject)value);
        if(value instanceof JSONArray){JSONArray a=(JSONArray)value;StringBuilder out=new StringBuilder("[");for(int i=0;i<a.length();i++){if(i>0)out.append(',');out.append(canonicalValue(a.opt(i)));}return out.append(']').toString();}
        if(value instanceof String)return JSONObject.quote((String)value);
        return value.toString();
    }

    public static final class Record {
        public final String type,id,action,payload;public String hash;public final long row;
        Record(String type,String id,String action,String payload,long row){this.type=type;this.id=id;this.action=action;this.payload=payload;this.row=row;}
    }
    public static final class Event extends EventBase {
        public final int attempts;
        Event(String id,String type,String recordId,String action,String baseHash,String payloadHash,String payload,int attempts){super(id,type,recordId,action,baseHash,payloadHash,payload);this.attempts=attempts;}
        public JSONArray sheetRow() { return new JSONArray().put(id).put(type).put(recordId).put(action).put(baseHash==null?"":baseHash).put(payloadHash).put(now()).put(payload==null?"":payload); }
    }
    public static final class RemoteEvent extends EventBase {
        public final long row;
        RemoteEvent(String id,String type,String recordId,String action,String baseHash,String payloadHash,String payload,long row){super(id,type,recordId,action,baseHash,payloadHash,payload);this.row=row;}
    }
    public static class EventBase {
        public final String id,type,recordId,action,baseHash,payloadHash,payload;
        EventBase(String id,String type,String recordId,String action,String baseHash,String payloadHash,String payload){this.id=id;this.type=type;this.recordId=recordId;this.action=action;this.baseHash=baseHash;this.payloadHash=payloadHash;this.payload=payload;}
    }
    public static final class Head {
        public final String type,recordId,action,payload,payloadHash,eventId;public final long row;
        Head(String type,String recordId,String action,String payload,String payloadHash,String eventId,long row){this.type=type;this.recordId=recordId;this.action=action;this.payload=payload;this.payloadHash=payloadHash;this.eventId=eventId;this.row=row;}
    }
    public static final class Conflict {
        public final String id,type,recordId,localAction,localPayload,localHash,remoteAction,remotePayload,remoteHash,remoteEventId;
        Conflict(String id,String type,String recordId,String localAction,String localPayload,String localHash,String remoteAction,String remotePayload,String remoteHash,String remoteEventId){this.id=id;this.type=type;this.recordId=recordId;this.localAction=localAction;this.localPayload=localPayload;this.localHash=localHash;this.remoteAction=remoteAction;this.remotePayload=remotePayload;this.remoteHash=remoteHash;this.remoteEventId=remoteEventId;}
    }
}
