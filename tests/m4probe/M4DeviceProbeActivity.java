package ru.courier.finance;

import android.app.Activity;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;
import android.media.MediaMetadataRetriever;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
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
            String date=forecast.forecastDay.getString("date");
            boolean saved=getSharedPreferences("m4-forecast-qa",MODE_PRIVATE).edit()
                .putString("source",forecast.source).putString("date",date).commit();
            if(!saved) throw new AssertionError("restart verification marker could not be saved");
            show("M4 FACT WRITER PASS\n33/33 full list accepted\n29/12 partial aggregate accepted\nDelivery durations did not become work hours.");
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
