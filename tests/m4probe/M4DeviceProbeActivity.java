package ru.courier.finance;

import android.app.Activity;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;
import android.media.MediaMetadataRetriever;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import androidx.work.Data;
import androidx.work.OneTimeWorkRequest;
import androidx.work.Operation;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Android-only probe for video frame extraction, local OCR, and structured review candidates. */
public final class M4DeviceProbeActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private TextView label;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        label=new TextView(this);label.setTextColor(Color.WHITE);label.setBackgroundColor(Color.rgb(18,24,29));
        label.setTextSize(22);label.setGravity(Gravity.CENTER);label.setPadding(32,32,32,32);
        setContentView(label);label.setText("M4 synthetic offline video probe…");
        if(getIntent().getBooleanExtra("m4.verifyReal",false)) worker.execute(this::verifyRealAfterRestart);
        else if(getIntent().getBooleanExtra("m4.verifyRestart",false)) worker.execute(this::verifyForecastAfterRestart);
        else if(getIntent().getBooleanExtra("m6.verifyWorker",false)) worker.execute(this::verifyM6Worker);
        else if(getIntent().getBooleanExtra("m6.verifyRestart",false)) worker.execute(this::verifyM6Restart);
        else if(getIntent().getBooleanExtra("m6.checkOffline",false)) worker.execute(this::checkM6Offline);
        else if(getIntent().getBooleanExtra("m6.queueReboot",false)) worker.execute(this::queueM6RebootWork);
        else if(getIntent().getBooleanExtra("m6.verifyReboot",false)) worker.execute(this::verifyM6Reboot);
        else worker.execute(this::runProbe);
    }

    private void runProbe() {
        File video=null;
        try {
            video=File.createTempFile("m4-probe-", ".mp4",getCacheDir());
            try(InputStream input=getAssets().open("m4-fixture/screen.mp4");FileOutputStream output=new FileOutputStream(video)) {
                byte[] buffer=new byte[32*1024];int count;
                while((count=input.read(buffer))!=-1) output.write(buffer,0,count);
            }
            MediaMetadataRetriever retriever=new MediaMetadataRetriever();
            retriever.setDataSource(video.getAbsolutePath());
            String duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            retriever.release();
            if(duration==null) throw new AssertionError("fixture video has no duration metadata");

            VideoImportProcessor.Result result;
            try(TesseractOcrEngine ocr=new TesseractOcrEngine(this)) {
                result=VideoImportProcessor.processFile(this,video,"video/mp4","screen.mp4",ocr::recognize,null);
            }
            boolean cyrillic=false,numbers=false,orders=false;
            for(VideoImportProcessor.Observation row:result.observations) {
                cyrillic |= row.ocrText.toLowerCase(java.util.Locale.ROOT).contains("заказ");
                numbers |= row.ocrText.contains("100") || row.ocrText.contains("12:01");
                orders |= row.screenType==YandexScreenParser.ScreenType.ORDERS;
            }
            boolean slotCandidate=result.uniqueCandidateCount("SLOT_DETAIL")>0;
            int orderRows=result.uniqueCandidateCount("ORDER_LIST_ROW");
            long rowTotal=0;int repeatedTimeRows=0;
            for(YandexScreenParser.Candidate candidate:result.uniqueCandidates())
                if("ORDER_LIST_ROW".equals(candidate.candidateType)) {
                    String amount=field(candidate,"amount_kopecks");
                    if(amount!=null) rowTotal+=Long.parseLong(amount);
                    if("12:19".equals(field(candidate,"order_time"))) repeatedTimeRows++;
                }
            String slotTotal=null,slotOrderCount=null;
            for(YandexScreenParser.Candidate candidate:result.uniqueCandidates())
                if("SLOT_DETAIL".equals(candidate.candidateType)) {
                    slotTotal=field(candidate,"slot_total_kopecks");
                    slotOrderCount=field(candidate,"slot_order_count");
                }
            boolean orderRowCandidate=orderRows==33&&rowTotal==330000&&repeatedTimeRows==2
                &&"330000".equals(slotTotal)&&"33".equals(slotOrderCount);
            if(!cyrillic || !numbers || !orders || !slotCandidate || !orderRowCandidate)
                throw new AssertionError("OCR/extraction mismatch: cyrillic="+cyrillic+", number="+numbers
                    +", orders="+orders+", slot="+slotCandidate+", rowCount="+orderRows
                    +", rowTotal="+rowTotal+", repeatedTimeRows="+repeatedTimeRows
                    +", slotTotal="+slotTotal+", slotOrderCount="+slotOrderCount);
            VideoImportDatabase database=new VideoImportDatabase(this);
            String probeImportId="m4v_"+result.sourceSha256.substring(0,32);
            database.deleteImport(probeImportId);
            VideoImportDatabase.PersistResult stored=database.persist(result,"video/mp4");
            if(stored.duplicate || stored.frameCount<1 || stored.insertedCandidateCount<1)
                throw new AssertionError("local evidence/candidate persistence failed");
            M4ForecastFactWriter.ImportResult forecast=M4ForecastFactWriter.importFacts(this,result);
            if(!forecast.accepted || forecast.duplicate || forecast.orderCount!=33 || forecast.forecastDay==null
                    || forecast.forecastDay.getInt("orders")!=33 || forecast.visibleOrderRows!=33
                    || !forecast.rawComplete || forecast.forecastDay.getBoolean("workConfirmed")
                    || forecast.forecastDay.getJSONArray("intervals").length()!=0)
                throw new AssertionError("forecast writer did not accept the exact synthetic order: "+forecast.message);
            verifyPartialAggregate();
            verifyM5CrossSourceDeduplication();
            String date=forecast.forecastDay.getString("date");
            boolean saved=getSharedPreferences("m4-forecast-qa",MODE_PRIVATE).edit()
                .putString("source",forecast.source).putString("date",date).commit();
            if(!saved) throw new AssertionError("restart verification marker could not be saved");
            show("M4 FORECAST WRITE PASS\nM5 CROSS-SOURCE RECONCILIATION PASS\n33/33 full list accepted\n29/12 partial aggregate accepted\nDelivery durations did not become work hours.");
        } catch(Throwable error) {
            show("M4 FORECAST QA FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally { if(video!=null) video.delete(); }
    }

    private void verifyForecastAfterRestart() {
        CourierDatabase store=null;
        try {
            String source=getSharedPreferences("m4-forecast-qa",MODE_PRIVATE).getString("source",null);
            String date=getSharedPreferences("m4-forecast-qa",MODE_PRIVATE).getString("date",null);
            if(source==null||date==null) throw new AssertionError("forecast restart marker is missing");
            store=new CourierDatabase(this);SQLiteDatabase db=store.getReadableDatabase();
            long[] orders=counts(db,"SELECT COUNT(*),COALESCE(SUM(reward_kopecks),0) FROM active_orders WHERE source_id=? AND date=? AND source_kind='video_import'",source,date);
            long[] forecast=counts(db,"SELECT COUNT(*),COALESCE(SUM(order_count),0) FROM active_aggregate_order_counts WHERE source_id=? AND date=? AND source_kind='video_import'",source,date);
            String status=null;
            try(Cursor cursor=db.rawQuery("SELECT status FROM import_sources WHERE id=?",new String[]{source})) {
                if(cursor.moveToFirst()) status=cursor.getString(0);
            }
            if(orders[0]!=33||orders[1]!=330000||forecast[0]!=1||forecast[1]!=33||!"mirrored".equals(status))
                throw new AssertionError("persisted forecast mismatch: orderRows="+orders[0]+", reward="+orders[1]
                    +", forecastRows="+forecast[0]+", forecastOrders="+forecast[1]+", sourceStatus="+status);
            long[] work=counts(db,"SELECT COUNT(*),COALESCE(SUM(active_minutes),0) FROM work_intervals WHERE source_id=? AND date=? AND state='WORK'",source,date);
            if(work[0]!=0) throw new AssertionError("delivery intervals leaked into working exposure: "+work[0]);
            show("M4 FORECAST RESTART PASS\nSQLite survived force-stop\n33 orders · ₽3,300 · forecast count 33\nSource status: mirrored");
        } catch(Throwable error) {
            show("M4 FORECAST RESTART FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally { if(store!=null) store.close(); }
    }

    private void verifyPartialAggregate() throws Exception {
        String slot="Слот: 2900,00 ₽\n339533360\n29 заказов · 10 км\n"
            +"Начало\n2026.10.17 07:30\nЗавершение\n2026.10.17 22:00";
        StringBuilder rows=new StringBuilder("Яндекс Про\nЗаказы\n");
        for(int i=0;i<12;i++) rows.append(String.format(java.util.Locale.ROOT,"%02d:%02d 100,00 ₽ >\n",10+i,10));
        YandexScreenParser.Result slotParsed=YandexScreenParser.parse(slot);
        YandexScreenParser.Result rowsParsed=YandexScreenParser.parse(rows.toString());
        java.util.List<VideoImportProcessor.Observation> observations=java.util.Arrays.asList(
            new VideoImportProcessor.Observation(0,0,"partial-slot",slot,1f,slotParsed,null),
            new VideoImportProcessor.Observation(1,1000,"partial-rows",rows.toString(),1f,rowsParsed,null));
        String hash=java.util.UUID.randomUUID().toString().replace("-","")+"00000000000000000000000000000000";
        VideoImportProcessor.Result partial=new VideoImportProcessor.Result(hash,1000,2000,observations,2);
        M4ForecastFactWriter.ImportResult saved=M4ForecastFactWriter.importFacts(this,partial);
        if(!saved.accepted||saved.duplicate||saved.orderCount!=29||saved.visibleOrderRows!=12||saved.rawComplete
                ||saved.forecastDay.getInt("orders")!=29||saved.forecastDay.getJSONArray("orderEvidence").length()!=12
                ||saved.forecastDay.getBoolean("workConfirmed")||saved.forecastDay.getJSONArray("intervals").length()!=0)
            throw new AssertionError("partial aggregate contract failed: "+saved.message);
        CourierDatabase store=new CourierDatabase(this);
        SQLiteDatabase db=store.getReadableDatabase();
        try {
            String source="video:"+hash;
            long[] raw=counts(db,"SELECT COUNT(*),COALESCE(SUM(reward_kopecks),0) FROM orders WHERE source_id=?",source);
            long[] aggregate=counts(db,"SELECT COUNT(*),COALESCE(SUM(order_count),0) FROM aggregate_order_counts WHERE source_id=?",source);
            long[] work=counts(db,"SELECT COUNT(*),COALESCE(SUM(active_minutes),0) FROM work_intervals WHERE source_id=? AND state='WORK'",source);
            if(raw[0]!=12||raw[1]!=120000||aggregate[0]!=1||aggregate[1]!=29||work[0]!=0)
                throw new AssertionError("partial SQLite rows mismatch: RAW="+raw[0]+", aggregate="+aggregate[1]+", work="+work[0]);
        } finally { db.close(); store.close(); }
    }

    private void verifyM5CrossSourceDeduplication() throws Exception {
        CourierDatabase store=new CourierDatabase(this);
        SQLiteDatabase db=store.getWritableDatabase();
        try {
            String xlsx28="m5-xlsx-20261028",dailyHash=repeatHex('e');
            seedSource(db,xlsx28,dailyHash,"xlsx");
            String[] times28={"12:46","12:57","13:26","13:48","17:57","18:41",
                "19:53","20:09","20:38","21:24","23:09"};
            seedDailyAggregate(db,"m5-day-20261028",xlsx28,"2026-10-28",11);
            seedRawRows(db,xlsx28,"2026-10-28",times28,10000);

            VideoImportProcessor.Result first=syntheticVideo(repeatHex('a'),"2026-10-28","341234567",
                "09:59","23:15",times28,10000);
            M4ForecastFactWriter.ImportResult imported=M4ForecastFactWriter.importFacts(this,first);
            if(!imported.accepted||imported.needsReview||imported.suppressedOrderRows!=11)
                throw new AssertionError("complete 11/1100 RAW day was not reconciled: "+imported.message);
            VideoImportProcessor.Result second=syntheticVideo(repeatHex('b'),"2026-10-28","341234567",
                "09:59","23:15",times28,10000);
            M4ForecastFactWriter.ImportResult repeated=M4ForecastFactWriter.importFacts(this,second);
            if(!repeated.accepted||repeated.needsReview||repeated.suppressedOrderRows!=11)
                throw new AssertionError("second video source duplicated the same 11/1100 day: "+repeated.message);
            long[] raw28=counts(db,"SELECT COUNT(*),COALESCE(SUM(reward_kopecks),0) FROM active_orders "
                +"WHERE date='2026-10-28'");
            long[] aggregate28=counts(db,"SELECT COUNT(*),COALESCE(SUM(order_count),0) "
                +"FROM active_aggregate_order_counts WHERE date='2026-10-28'");
            long baseAggregates=counts(db,"SELECT COUNT(*),0 FROM aggregate_order_counts WHERE date='2026-10-28'")[0];
            if(raw28[0]!=11||raw28[1]!=110000||aggregate28[0]!=1||aggregate28[1]!=11||baseAggregates!=3)
                throw new AssertionError("M5 11/1100 reconciliation mismatch: RAW="+raw28[0]+"/"+raw28[1]
                    +", activeAggregate="+aggregate28[0]+"/"+aggregate28[1]+", retainedSources="+baseAggregates);

            String xlsx18="m5-xlsx-20261018";
            seedSource(db,xlsx18,repeatHex('c'),"xlsx");
            seedDailyAggregate(db,"m5-day-20261018",xlsx18,"2026-10-18",2);
            seedRawRows(db,xlsx18,"2026-10-18",new String[]{"18:57","18:57"},10000);
            VideoImportProcessor.Result sameMinute=syntheticVideo(repeatHex('d'),"2026-10-18","778899001",
                "09:00","23:00",new String[]{"18:57","18:57"},10000);
            M4ForecastFactWriter.ImportResult two=M4ForecastFactWriter.importFacts(this,sameMinute);
            long rawSameMinute=counts(db,"SELECT COUNT(*),COALESCE(SUM(reward_kopecks),0) FROM active_orders "
                +"WHERE date='2026-10-18' AND source_id=?",xlsx18)[0];
            if(!two.accepted||two.suppressedOrderRows!=2||rawSameMinute!=2)
                throw new AssertionError("two distinct 18:57 orders were collapsed or copied");
        } finally { db.close(); store.close(); }
    }

    private static void seedSource(SQLiteDatabase db,String id,String hash,String kind) {
        ContentValues source=new ContentValues(); source.put("id",id); source.put("sha256",hash);
        source.put("source_kind",kind); source.put("parser_version","m5-fixture");
        source.put("status","mirrored"); source.put("created_at","2026-10-31T00:00:00Z");
        source.put("updated_at","2026-10-31T00:00:00Z"); db.insertOrThrow("import_sources",null,source);
    }

    private static void seedDailyAggregate(SQLiteDatabase db,String id,String source,String date,int count) {
        ContentValues value=new ContentValues(); value.put("id",id); value.put("date",date);
        value.putNull("slot_id"); value.put("order_count",count); value.put("source_id",source);
        value.put("source_kind","xlsx"); value.put("confidence","reported_sheet");
        value.put("created_at","2026-10-31T00:00:00Z"); value.put("updated_at","2026-10-31T00:00:00Z");
        db.insertOrThrow("aggregate_order_counts",null,value);
    }

    private static void seedRawRows(SQLiteDatabase db,String source,String date,String[] times,long amount) {
        for(int i=0;i<times.length;i++) {
            ContentValues row=new ContentValues(); row.put("id",source+":raw:"+i); row.put("date",date);
            row.put("completed_at",date+"T"+times[i]+":00+03:00"); row.put("reward_kopecks",amount);
            row.put("source_id",source); row.put("source_kind","xlsx"); row.put("confidence","reported_high");
            row.put("precision","reported_times_partial"); row.put("created_at","2026-10-31T00:00:00Z");
            row.put("updated_at","2026-10-31T00:00:00Z"); db.insertOrThrow("orders",null,row);
        }
    }

    private static VideoImportProcessor.Result syntheticVideo(String hash,String date,String slotId,
            String start,String end,String[] times,long amount) {
        long total=amount*times.length;
        String noun=times.length==2?"заказа":"заказов";
        String slot="Слот: "+(total/100)+",00 ₽\n"+slotId+"\n"+times.length+" "+noun+" · 0 км\n"
            +"Начало\n"+date.replace('-','.')+" "+start+"\nЗавершение\n"+date.replace('-','.')+" "+end;
        StringBuilder list=new StringBuilder("Яндекс Про\nЗаказы\n");
        for(String time:times) list.append(time).append(" 100,00 ₽ >\n");
        YandexScreenParser.Result parsedSlot=YandexScreenParser.parse(slot);
        YandexScreenParser.Result parsedRows=YandexScreenParser.parse(list.toString());
        java.util.List<VideoImportProcessor.Observation> observations=java.util.Arrays.asList(
            new VideoImportProcessor.Observation(0,0,"m5-slot",slot,1f,parsedSlot,null),
            new VideoImportProcessor.Observation(1,1000,"m5-rows",list.toString(),1f,parsedRows,null));
        return new VideoImportProcessor.Result(hash,1000,2000,observations,2);
    }

    private static String repeatHex(char ch) {
        StringBuilder value=new StringBuilder(64); for(int i=0;i<64;i++) value.append(ch); return value.toString();
    }

    private void verifyM6Worker() {
        try {
            String zone="Europe/Moscow";
            LocalDate target=LocalDate.now(ZoneId.of(zone));
            JSONArray intervals=new JSONArray().put(new JSONObject().put("start",600).put("end",1080).put("state","WORK"));
            JSONObject days=new JSONObject();
            for(int offset=1;offset<=42;offset++) {
                String date=target.minusDays(offset).toString();
                int orders=18+(offset%7);
                JSONObject day=new JSONObject().put("date",date).put("timezone",zone)
                    .put("orders",orders).put("ordersConfirmed",true).put("completed",true)
                    .put("workConfirmed",true).put("precision","intervals")
                    .put("intervals",new JSONArray().put(new JSONObject().put("start",600).put("end",1080).put("state","WORK")));
                days.put(date,day);
            }
            JSONObject forecast=new JSONObject().put("version",1).put("location",new JSONObject().put("timezone",zone))
                .put("typicalPlan",new JSONObject().put("timezone",zone).put("intervals",intervals).put("precision","intervals"))
                .put("days",days);
            JSONObject state=new JSONObject().put("schemaVersion",6).put("entries",new JSONArray()).put("forecast",forecast);
            if(!getSharedPreferences("courier_finance",MODE_PRIVATE).edit().putString("state",state.toString())
                    .putBoolean("m2_sqlite_primary",false).commit())
                throw new AssertionError("forecast test history was not committed");

            OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(ForecastAutomationWorker.class)
                .setInputData(new Data.Builder().putString(ForecastAutomationWorker.KEY_MODE,
                    ForecastAutomationWorker.MODE_DAILY).build())
                // Leave enough time for the harness to close and kill this process first.
                .setInitialDelay(15,TimeUnit.SECONDS)
                .build();
            UUID id=request.getId();
            WorkManager manager=WorkManager.getInstance(getApplicationContext());
            Operation operation=manager.enqueue(request);
            operation.getResult().get(15,TimeUnit.SECONDS);
            if(!getSharedPreferences("m6-forecast-qa",MODE_PRIVATE).edit()
                    .putString("target",target.toString()).putString("workId",id.toString()).commit())
                throw new AssertionError("queued forecast marker was not committed");
            show("M6 ENQUEUED\nDelayed offline forecast queued before process kill.");
        } catch(Throwable error) {
            show("M6 WORKER FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        }
    }

    private void verifyM6Restart() {
        CourierDatabase store=null;
        try {
            android.content.SharedPreferences marker=getSharedPreferences("m6-forecast-qa",MODE_PRIVATE);
            String target=marker.getString("target",null);
            String workId=marker.getString("workId",null);
            if(target==null||workId==null)throw new AssertionError("queued WorkManager forecast marker is missing");
            UUID id=UUID.fromString(workId);
            WorkManager manager=WorkManager.getInstance(getApplicationContext());
            WorkInfo finished=null;
            for(int attempt=0;attempt<120;attempt++) {
                WorkInfo current=manager.getWorkInfoById(id).get(10,TimeUnit.SECONDS);
                if(current!=null&&current.getState().isFinished()) { finished=current;break; }
                Thread.sleep(500);
            }
            if(finished==null||finished.getState()!=WorkInfo.State.SUCCEEDED)
                throw new AssertionError("queued daily WorkManager forecast did not succeed after process recovery: "
                    +(finished==null?"no WorkInfo":finished.getState()));
            store=new CourierDatabase(this);
            SQLiteDatabase db=store.getReadableDatabase();
            String createdAt;
            try(Cursor cursor=db.rawQuery("SELECT COUNT(*),MIN(training_cutoff),MIN(center_orders),MIN(created_at) FROM forecast_snapshots WHERE id=?",
                    new String[]{"native-MORNING-"+target})) {
                if(!cursor.moveToFirst()||cursor.getInt(0)!=1||cursor.isNull(1)
                        ||cursor.getString(1).compareTo(target)>=0||cursor.isNull(2)||cursor.isNull(3))
                    throw new AssertionError("published forecast did not survive scheduled process recovery");
                createdAt=cursor.getString(3);
            }
            if(!marker.edit().putString("nativeCreatedAt",createdAt).commit())
                throw new AssertionError("native forecast creation marker was not committed");
            show("M6 RESTART PASS\nQueued forecast ran after process death and survived app restoration.");
        } catch(Throwable error) {
            show("M6 RESTART FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally { if(store!=null)store.close(); }
    }

    private boolean hasValidatedNetwork() {
        ConnectivityManager manager=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        if(manager==null)return false;
        for(Network network:manager.getAllNetworks()) {
            NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);
            if(capabilities!=null&&capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))return true;
        }
        return false;
    }

    private void checkM6Offline() {
        try {
            if(hasValidatedNetwork())throw new AssertionError("Android still reports a validated network after offline setup");
            show("M6 OFFLINE PASS\nNo validated network is available to the app.");
        } catch(Throwable error) {
            show("M6 OFFLINE FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        }
    }

    private void queueM6RebootWork() {
        try {
            if(hasValidatedNetwork())throw new AssertionError("reboot recovery must be queued while offline");
            android.content.SharedPreferences marker=getSharedPreferences("m6-forecast-qa",MODE_PRIVATE);
            String target=marker.getString("target",null);
            String createdAt=marker.getString("nativeCreatedAt",null);
            if(target==null||createdAt==null)throw new AssertionError("pre-reboot native snapshot proof is missing");
            OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(ForecastAutomationWorker.class)
                .setInputData(new Data.Builder().putString(ForecastAutomationWorker.KEY_MODE,
                    ForecastAutomationWorker.MODE_DAILY).build())
                .setInitialDelay(120,TimeUnit.SECONDS)
                .build();
            UUID id=request.getId();
            WorkManager manager=WorkManager.getInstance(getApplicationContext());
            manager.enqueue(request).getResult().get(15,TimeUnit.SECONDS);
            if(!marker.edit().putString("rebootWorkId",id.toString()).commit())
                throw new AssertionError("pre-reboot WorkManager ID was not committed");
            show("M6 REBOOT ENQUEUED\nOffline forecast queued before device reboot.");
        } catch(Throwable error) {
            show("M6 REBOOT QUEUE FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        }
    }

    private void verifyM6Reboot() {
        CourierDatabase store=null;
        try {
            if(hasValidatedNetwork())throw new AssertionError("device is online during reboot recovery verification");
            android.content.SharedPreferences marker=getSharedPreferences("m6-forecast-qa",MODE_PRIVATE);
            String target=marker.getString("target",null);
            String workId=marker.getString("rebootWorkId",null);
            String expectedCreatedAt=marker.getString("nativeCreatedAt",null);
            if(target==null||workId==null||expectedCreatedAt==null)
                throw new AssertionError("persisted reboot work markers are missing");
            UUID id=UUID.fromString(workId);
            WorkManager manager=WorkManager.getInstance(getApplicationContext());
            WorkInfo current=manager.getWorkInfoById(id).get(15,TimeUnit.SECONDS);
            if(current==null||current.getState()==WorkInfo.State.FAILED||current.getState()==WorkInfo.State.CANCELLED)
                throw new AssertionError("queued work did not survive device reboot: "+(current==null?"no WorkInfo":current.getState()));
            WorkInfo finished=null;
            for(int attempt=0;attempt<240;attempt++) {
                current=manager.getWorkInfoById(id).get(10,TimeUnit.SECONDS);
                if(current!=null&&current.getState().isFinished()) { finished=current;break; }
                Thread.sleep(500);
            }
            if(finished==null||finished.getState()!=WorkInfo.State.SUCCEEDED)
                throw new AssertionError("queued forecast did not succeed after reboot: "+(finished==null?"no WorkInfo":finished.getState()));
            if(hasValidatedNetwork())throw new AssertionError("validated network appeared during offline worker run");
            store=new CourierDatabase(this);
            try(Cursor cursor=store.getReadableDatabase().rawQuery(
                    "SELECT COUNT(*),MIN(created_at) FROM forecast_snapshots WHERE id=?",
                    new String[]{"native-MORNING-"+target})) {
                if(!cursor.moveToFirst()||cursor.getInt(0)!=1||cursor.isNull(1)
                        ||!expectedCreatedAt.equals(cursor.getString(1)))
                    throw new AssertionError("reboot retry changed or duplicated the immutable morning snapshot");
            }
            show("M6 REBOOT PASS\nOffline WorkManager job survived reboot; morning snapshot stayed immutable.");
        } catch(Throwable error) {
            show("M6 REBOOT FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally { if(store!=null)store.close(); }
    }

    private void verifyRealAfterRestart() {
        CourierDatabase store=null;
        VideoImportDatabase evidence=null;
        try {
            String first=getIntent().getStringExtra("m4.sourceOne");
            String second=getIntent().getStringExtra("m4.sourceTwo");
            if(first==null||second==null||!first.matches("[0-9a-f]{64}")||!second.matches("[0-9a-f]{64}"))
                throw new AssertionError("real video source ids are missing");
            store=new CourierDatabase(this);
            evidence=new VideoImportDatabase(this);
            verifyRealSource(store.getReadableDatabase(),evidence.getReadableDatabase(),first,28,280000);
            verifyRealSource(store.getReadableDatabase(),evidence.getReadableDatabase(),second,9,90000);
            show("M4 REAL VIDEO RESTART PASS\n28 orders · 280000 kopecks\n9 orders · 90000 kopecks\nForecast facts survived force-stop and restart.");
        } catch(Throwable error) {
            show("M4 REAL VIDEO RESTART FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally {
            if(evidence!=null) evidence.close();
            if(store!=null) store.close();
        }
    }

    private static void verifyRealSource(SQLiteDatabase facts,SQLiteDatabase evidence,String hash,int expectedCount,long expectedTotal) {
        String source="video:"+hash;
        long[] orders=counts(facts,"SELECT COUNT(*),COALESCE(SUM(reward_kopecks),0) FROM active_orders "
            +"WHERE source_id=? AND source_kind='video_import'",source);
        long[] aggregates=counts(facts,"SELECT COUNT(*),COALESCE(SUM(order_count),0) FROM active_aggregate_order_counts "
            +"WHERE source_id=? AND source_kind='video_import'",source);
        long[] imported=counts(evidence,"SELECT COUNT(*),COALESCE(SUM(duration_ms),0) FROM m4_video_imports "
            +"WHERE source_sha256=? AND parser_version=?",hash,YandexScreenParser.VERSION);
        String status=null;
        try(Cursor cursor=facts.rawQuery("SELECT status FROM import_sources WHERE id=?",new String[]{source})) {
            if(cursor.moveToFirst()) status=cursor.getString(0);
        }
        if(orders[0]!=expectedCount||orders[1]!=expectedTotal||aggregates[0]!=1
                ||aggregates[1]!=expectedCount||imported[0]!=1||imported[1]<=0||!"mirrored".equals(status))
            throw new AssertionError("persisted source mismatch: orders="+orders[0]+", reward="+orders[1]
                +", aggregates="+aggregates[0]+", aggregateCount="+aggregates[1]
                +", evidence="+imported[0]+", sourceStatus="+status);
    }

    private static long[] counts(SQLiteDatabase db,String sql,String... args) {
        try(Cursor cursor=db.rawQuery(sql,args)) {
            if(!cursor.moveToFirst()) return new long[]{-1,-1};
            return new long[]{cursor.getLong(0),cursor.getLong(1)};
        }
    }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }

    private void show(String text) { runOnUiThread(()->label.setText(text)); }
    @Override protected void onDestroy() { worker.shutdownNow();super.onDestroy(); }
}
