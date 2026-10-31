package ru.courier.finance;

import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Foreground, user-triggered append-only sync transport for the M7 event log. */
public final class M7GoogleSheetsSync {
    public static final String SPREADSHEET_ID="1SJZ1MfVtkga9ihq2C0FrXIOQoQu3jtYRQn5wHd6CRCM";
    public static final String SHEET_TITLE="__CourierSync";
    public static final String OAUTH_SCOPE="https://www.googleapis.com/auth/spreadsheets";
    private static final String API="https://sheets.googleapis.com/v4/spreadsheets/";
    private static final int PAGE_ROWS=250, MAX_REMOTE_ROWS=50000, MAX_BODY_BYTES=12_000_000, MAX_ATTEMPTS=4;
    private static final JSONArray HEADER=new JSONArray().put("event_id").put("record_type").put("record_id").put("action")
        .put("base_hash").put("payload_hash").put("created_at").put("payload_json");
    private static final Pattern ROW_START=Pattern.compile("![A-Z]+([0-9]+):");

    private M7GoogleSheetsSync() { }

    public static Result synchronize(String accessToken,String localState,M7SyncStore store) throws Exception {
        if(accessToken==null||accessToken.isEmpty())throw new SyncFailure("Google не выдал разрешение на таблицу.",0,0);
        long retryAt=store.retryAt();if(retryAt>System.currentTimeMillis())throw new SyncFailure("Повторная синхронизация ещё не доступна.",429,retryAt);
        try {
            ensureSheet(accessToken);
            List<M7SyncStore.RemoteEvent> remote=readRemote(accessToken);
            Result result=reconcileAndPush(accessToken,localState,store,remote);
            result.pending=store.pending().size();result.conflicts=store.conflicts().size();
            return result;
        } catch(SyncFailure failure) {
            if(failure.status==429||failure.status>=500) {
                long next=failure.retryAt>System.currentTimeMillis()?failure.retryAt:System.currentTimeMillis()+30_000L;
                store.setRetryAt(next);store.setLastError(failure.status==429?"Google ограничил частоту запросов; очередь сохранена.":"Google временно не отвечает; очередь сохранена.");
            } else if(failure.status==0)store.setLastError(failure.getMessage());
            else store.setLastError("Синхронизация не завершена (HTTP "+failure.status+"). Очередь сохранена.");
            for(M7SyncStore.Event event:store.pending())store.recordAttempt(event.id,failure.getMessage());
            throw failure;
        } catch(Exception failure) {
            store.setLastError("Нет связи с Google. Изменения остались в локальной очереди.");
            throw failure;
        }
    }

    private static void ensureSheet(String token) throws Exception {
        JSONObject book=request("GET",API+SPREADSHEET_ID+"?fields=sheets.properties(sheetId,title)",token,null);
        if(hasSyncSheet(book))return;
        JSONObject body=new JSONObject().put("requests",new JSONArray().put(new JSONObject().put("addSheet",
            new JSONObject().put("properties",new JSONObject().put("title",SHEET_TITLE)))));
        try { request("POST",API+SPREADSHEET_ID+":batchUpdate",token,body); }
        catch(SyncFailure error) {
            // Two devices can both create the tab during their first sync.
            if(error.status!=400&&error.status!=409)throw error;
            JSONObject refreshed=request("GET",API+SPREADSHEET_ID+"?fields=sheets.properties(sheetId,title)",token,null);
            if(!hasSyncSheet(refreshed))throw error;
        }
        JSONArray existing=getValues(token,1,1);
        if(existing.length()==0||existing.optJSONArray(0)==null||existing.optJSONArray(0).length()==0)appendValues(token,new JSONArray().put(HEADER));
        else if(!sameHeader(existing.optJSONArray(0)))throw new SyncFailure("Лист "+SHEET_TITLE+" уже используется и имеет другой формат. Данные не изменены.",409,0);
    }

    private static boolean hasSyncSheet(JSONObject book) {
        JSONArray sheets=book.optJSONArray("sheets");if(sheets==null)return false;
        for(int i=0;i<sheets.length();i++){JSONObject properties=sheets.optJSONObject(i)==null?null:sheets.optJSONObject(i).optJSONObject("properties");if(properties!=null&&SHEET_TITLE.equals(properties.optString("title")))return true;}
        return false;
    }

    private static boolean sameHeader(JSONArray row) {
        if(row==null||row.length()!=HEADER.length())return false;
        for(int i=0;i<HEADER.length();i++)if(!HEADER.optString(i).equals(row.optString(i)))return false;
        return true;
    }

    private static List<M7SyncStore.RemoteEvent> readRemote(String token) throws Exception {
        JSONArray first=getValues(token,1,1);
        if(first.length()==0) {appendValues(token,new JSONArray().put(HEADER));first=getValues(token,1,1);}
        if(first.length()==0||!sameHeader(first.optJSONArray(0)))throw new SyncFailure("Не удалось проверить формат листа синхронизации.",409,0);
        List<M7SyncStore.RemoteEvent> all=new ArrayList<>();Map<String,M7SyncStore.RemoteEvent> ids=new HashMap<>();
        for(int start=2;start<=MAX_REMOTE_ROWS+1;start+=PAGE_ROWS) {
            JSONArray values=getValues(token,start,Math.min(start+PAGE_ROWS-1,MAX_REMOTE_ROWS+1));
            for(int i=0;i<values.length();i++) {
                JSONArray row=values.optJSONArray(i);if(row==null||row.length()==0)continue;
                M7SyncStore.RemoteEvent event=parseRemote(row,start+i);
                M7SyncStore.RemoteEvent previous=ids.get(event.id);
                if(previous!=null) {
                    if(!sameEvent(previous,event))throw new SyncFailure("В листе повторяется ID события с разными данными. Синхронизация остановлена.",409,0);
                    continue; // A 429 after a committed append can leave an identical retry row.
                }
                ids.put(event.id,event);all.add(event);
            }
            if(values.length()<PAGE_ROWS)break;
            if(start+PAGE_ROWS>MAX_REMOTE_ROWS)throw new SyncFailure("Лист синхронизации превысил безопасный предел чтения.",413,0);
        }
        return all;
    }

    private static M7SyncStore.RemoteEvent parseRemote(JSONArray row,long rowNumber) throws Exception {
        String id=value(row,0),type=value(row,1),recordId=value(row,2),action=value(row,3),base=value(row,4),payloadHash=value(row,5),payload=value(row,7);
        if(id.isEmpty()||recordId.isEmpty()||payloadHash.length()!=64||!payloadHash.matches("[0-9a-f]{64}"))throw new SyncFailure("В листе найдено неполное событие синхронизации.",409,0);
        if(!M7SyncStore.TYPE_ENTRY.equals(type)&&!M7SyncStore.TYPE_CLOSURE.equals(type)&&!M7SyncStore.TYPE_SETTINGS.equals(type))throw new SyncFailure("В листе найден неизвестный тип записи.",409,0);
        if(!M7SyncStore.ACTION_UPSERT.equals(action)&&!M7SyncStore.ACTION_DELETE.equals(action))throw new SyncFailure("В листе найдено неизвестное действие.",409,0);
        String canonicalPayload=null;
        if(M7SyncStore.ACTION_UPSERT.equals(action)) {
            JSONObject parsed;
            try{parsed=new JSONObject(payload);}catch(Exception invalid){throw new SyncFailure("В листе повреждена запись "+recordId+". Ничего не перезаписано.",409,0);}
            canonicalPayload=M7SyncStore.canonical(parsed);
        }
        String calculated=M7SyncStore.hash(action,canonicalPayload);
        if(!calculated.equals(payloadHash))throw new SyncFailure("Контрольная сумма события в Google Sheets не совпала. Синхронизация остановлена.",409,0);
        return new M7SyncStore.RemoteEvent(id,type,recordId,action,base.isEmpty()?null:base,payloadHash,canonicalPayload,rowNumber);
    }

    private static boolean sameEvent(M7SyncStore.RemoteEvent a,M7SyncStore.RemoteEvent b) {
        return a.type.equals(b.type)&&a.recordId.equals(b.recordId)&&a.action.equals(b.action)&&a.payloadHash.equals(b.payloadHash);
    }

    private static String value(JSONArray row,int index) { Object value=row.opt(index);return value==null||value==JSONObject.NULL?"":String.valueOf(value); }

    private static Result reconcileAndPush(String token,String rawState,M7SyncStore store,List<M7SyncStore.RemoteEvent> remote) throws Exception {
        Result result=new Result();Map<String,M7SyncStore.RemoteEvent> latest=new HashMap<>(),byEventId=new HashMap<>();
        for(M7SyncStore.RemoteEvent event:remote){latest.put(key(event.type,event.recordId),event);byEventId.put(event.id,event);}
        Map<String,M7SyncStore.Record> local=store.currentRecords(rawState);Map<String,M7SyncStore.Head> known=store.heads();Set<String> visited=new HashSet<>();

        for(M7SyncStore.RemoteEvent server:latest.values()) {
            String key=key(server.type,server.recordId);visited.add(key);
            if(store.hasOpenConflict(server.type,server.recordId))continue;
            M7SyncStore.Record current=local.get(key);M7SyncStore.Event pending=store.pendingFor(server.type,server.recordId);M7SyncStore.Head previous=known.get(key);
            if(pending!=null) {
                if(pending.payloadHash.equals(server.payloadHash)) {store.markDelivered(pending.id);store.saveHead(server);continue;}
                if(equal(pending.baseHash,server.payloadHash)) {store.saveHead(server);continue;}
                store.createConflict(server.type,server.recordId,pending.action,pending.payload,server.action,server.payload,server.id);result.conflicts++;continue;
            }
            boolean localMatches=matches(current,server);
            if(localMatches) {store.saveHead(server);continue;}
            if(previous!=null) {
                boolean localUnchanged=current==null?M7SyncStore.ACTION_DELETE.equals(previous.action):current.hash.equals(previous.payloadHash);
                if(localUnchanged) {
                    if(current!=null||!M7SyncStore.ACTION_DELETE.equals(server.action)) {
                        result.incoming.add(server);result.expectedLocalHashes.put(key,current==null?null:current.hash);
                    }
                    if(current==null&&M7SyncStore.ACTION_DELETE.equals(server.action))store.saveHead(server);
                    continue;
                }
                if(previous.payloadHash.equals(server.payloadHash)) {
                    queueCurrent(store,server.type,server.recordId,current,server.payloadHash);store.saveHead(server);continue;
                }
                store.createConflict(server.type,server.recordId,current==null?M7SyncStore.ACTION_DELETE:M7SyncStore.ACTION_UPSERT,current==null?null:current.payload,server.action,server.payload,server.id);result.conflicts++;continue;
            }
            if(current==null) {
                if(M7SyncStore.ACTION_UPSERT.equals(server.action)) {result.incoming.add(server);result.expectedLocalHashes.put(key,null);}
                else store.saveHead(server);
            } else {
                store.createConflict(server.type,server.recordId,M7SyncStore.ACTION_UPSERT,current.payload,server.action,server.payload,server.id);result.conflicts++;
            }
        }

        for(Map.Entry<String,M7SyncStore.Record> item:local.entrySet()) {
            if(visited.contains(item.getKey())||store.hasOpenConflict(item.getValue().type,item.getValue().id))continue;
            M7SyncStore.Record current=item.getValue();M7SyncStore.Event pending=store.pendingFor(current.type,current.id);M7SyncStore.Head previous=known.get(item.getKey());
            if(pending!=null)continue;
            if(previous==null)store.enqueue(current.type,current.id,current.action,current.payload,null);
            else if(previous.payloadHash.equals(current.hash))continue;
            else store.createConflict(current.type,current.id,current.action,current.payload,M7SyncStore.REMOTE_MISSING,null,null);
        }

        // A local tombstone is absent from the current state map. Its durable queue
        // event still participates in conflict checking and is never discarded.
        List<M7SyncStore.Event> pushable=new ArrayList<>();
        for(M7SyncStore.Event event:store.pending()) {
            if(store.hasOpenConflict(event.type,event.recordId))continue;
            M7SyncStore.RemoteEvent remoteHead=latest.get(key(event.type,event.recordId));
            if(byEventId.containsKey(event.id)) {
                M7SyncStore.RemoteEvent exact=byEventId.get(event.id);store.markDelivered(event.id);
                if(remoteHead==null||remoteHead.payloadHash.equals(exact.payloadHash))store.saveHead(remoteHead==null?exact:remoteHead);
                else {store.createConflict(event.type,event.recordId,event.action,event.payload,remoteHead.action,remoteHead.payload,remoteHead.id);result.conflicts++;}
                continue;
            }
            if(remoteHead==null) {
                if(event.baseHash==null)pushable.add(event);
                else {store.createConflict(event.type,event.recordId,event.action,event.payload,M7SyncStore.REMOTE_MISSING,null,null);result.conflicts++;}
                continue;
            }
            if(remoteHead.payloadHash.equals(event.payloadHash)) {
                store.markDelivered(event.id);store.saveHead(remoteHead);continue;
            }
            if(equal(event.baseHash,remoteHead.payloadHash))pushable.add(event);
            else {store.createConflict(event.type,event.recordId,event.action,event.payload,remoteHead.action,remoteHead.payload,remoteHead.id);result.conflicts++;}
        }
        if(!pushable.isEmpty()) {
            JSONArray rows=new JSONArray();for(M7SyncStore.Event event:pushable)rows.put(event.sheetRow());
            long firstRow=appendValues(token,rows);
            for(int i=0;i<pushable.size();i++) {
                M7SyncStore.Event event=pushable.get(i);M7SyncStore.RemoteEvent uploaded=new M7SyncStore.RemoteEvent(event.id,event.type,event.recordId,event.action,event.baseHash,event.payloadHash,event.payload,firstRow+i);
                store.markDelivered(event.id);store.saveHead(uploaded);latest.put(key(event.type,event.recordId),uploaded);result.pushed++;
                store.rebasePending(event.type,event.recordId,event.baseHash,event.payloadHash);
            }
        }
        result.pulled=result.incoming.size();return result;
    }

    private static void queueCurrent(M7SyncStore store,String type,String id,M7SyncStore.Record current,String baseHash) throws Exception {
        store.enqueue(type,id,current==null?M7SyncStore.ACTION_DELETE:M7SyncStore.ACTION_UPSERT,current==null?null:current.payload,baseHash);
    }
    private static boolean matches(M7SyncStore.Record local,M7SyncStore.RemoteEvent remote) {
        if(local==null)return M7SyncStore.ACTION_DELETE.equals(remote.action);
        return M7SyncStore.ACTION_UPSERT.equals(remote.action)&&local.hash.equals(remote.payloadHash);
    }
    private static boolean equal(String a,String b) { return a==null?b==null:a.equals(b); }
    private static String key(String type,String id) { return type+"\u001f"+id; }

    private static JSONArray getValues(String token,int start,int end) throws Exception {
        String range=Uri.encode(SHEET_TITLE+"!A"+start+":H"+end);
        JSONObject response=request("GET",API+SPREADSHEET_ID+"/values/"+range+"?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE",token,null);
        return response.optJSONArray("values")==null?new JSONArray():response.optJSONArray("values");
    }
    private static long appendValues(String token,JSONArray rows) throws Exception {
        String range=Uri.encode(SHEET_TITLE+"!A:H");
        JSONObject body=new JSONObject().put("majorDimension","ROWS").put("values",rows);
        JSONObject response=request("POST",API+SPREADSHEET_ID+"/values/"+range+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",token,body);
        String updated=response.optJSONObject("updates")==null?"":response.optJSONObject("updates").optString("updatedRange","");
        Matcher match=ROW_START.matcher(updated);if(match.find())return Long.parseLong(match.group(1));
        throw new SyncFailure("Google принял запрос, но не подтвердил диапазон добавленных строк. Повторная отправка будет идемпотентной.",502,System.currentTimeMillis()+30_000L);
    }

    private static JSONObject request(String method,String url,String token,JSONObject body) throws Exception {
        int lastStatus=0;long retryAt=0;String error="";
        for(int attempt=0;attempt<MAX_ATTEMPTS;attempt++) {
            HttpURLConnection connection=null;
            try {
                connection=(HttpURLConnection)new URL(url).openConnection();connection.setRequestMethod(method);connection.setConnectTimeout(15000);connection.setReadTimeout(20000);
                connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Accept","application/json");
                if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}}
                int status=connection.getResponseCode();
                if(status>=200&&status<300){String response=read(connection.getInputStream());return response.isEmpty()?new JSONObject():new JSONObject(response);}
                lastStatus=status;error=read(connection.getErrorStream());
                if(status!=429&&status<500)throw new SyncFailure(httpMessage(status,error),status,0);
                retryAt=retryAt(connection,attempt);
                if(status==429&&retryAt-System.currentTimeMillis()>5000L)
                    throw new SyncFailure("Google ограничил частоту запросов. Повторите после указанного времени.",429,retryAt);
            } catch(SyncFailure failure) {throw failure;}
            catch(java.io.IOException network) {
                if(attempt+1>=MAX_ATTEMPTS)throw new SyncFailure("Связь с Google недоступна. Очередь сохранена.",0,0);
                retryAt=System.currentTimeMillis()+Math.min(4000L,1000L<<attempt);
            } finally {if(connection!=null)connection.disconnect();}
            if(attempt+1<MAX_ATTEMPTS)Thread.sleep(Math.max(0,Math.min(5000L,retryAt-System.currentTimeMillis())));
        }
        throw new SyncFailure(lastStatus==429?"Google ограничил частоту запросов. Повторите позже.":"Google временно не отвечает. Очередь сохранена.",lastStatus,retryAt);
    }

    private static long retryAt(HttpURLConnection connection,int attempt) {
        String header=connection.getHeaderField("Retry-After");long delay=Math.min(5000L,1000L<<attempt);
        if(header!=null)try{delay=Math.max(0,Long.parseLong(header.trim())*1000L);}catch(Exception ignored){
            try{java.util.Date date=new java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz",Locale.US).parse(header);if(date!=null)delay=Math.max(0,date.getTime()-System.currentTimeMillis());}catch(Exception ignoredDate){}
        }
        return System.currentTimeMillis()+delay;
    }

    private static String read(InputStream input) throws Exception {
        if(input==null)return "";
        try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192];int count;
            while((count=in.read(buffer))!=-1){out.write(buffer,0,count);if(out.size()>MAX_BODY_BYTES)throw new SyncFailure("Ответ Google больше безопасного лимита.",413,0);}
            return new String(out.toByteArray(),StandardCharsets.UTF_8);
        }
    }
    private static String httpMessage(int status,String body) {
        if(status==401||status==403)return "Google отказал в доступе к таблице. Проверьте аккаунт и разрешения.";
        if(status==404)return "Таблица Courier Forecast не найдена или недоступна этому аккаунту.";
        if(status==429)return "Google ограничил частоту запросов.";
        return "Google Sheets вернул HTTP "+status+".";
    }

    public static final class Result {
        public final List<M7SyncStore.RemoteEvent> incoming=new ArrayList<>();
        public final Map<String,String> expectedLocalHashes=new HashMap<>();
        public int pushed,pulled,pending,conflicts;
    }
    public static final class SyncFailure extends Exception {
        public final int status;public final long retryAt;
        SyncFailure(String message,int status,long retryAt){super(message);this.status=status;this.retryAt=retryAt;}
    }
}
