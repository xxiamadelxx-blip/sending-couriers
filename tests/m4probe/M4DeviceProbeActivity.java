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
        if(getIntent().getBooleanExtra("m4.verifyRestart",false)) worker.execute(this::verifyForecastAfterRestart);
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
                numbers |= row.ocrText.contains("100") || row.ocrText.contains("12:34");
                orders |= row.screenType==YandexScreenParser.ScreenType.ORDERS;
            }
            boolean slotCandidate=result.uniqueCandidateCount("SLOT_DETAIL")>0;
            boolean orderRowCandidate=result.uniqueCandidateCount("ORDER_LIST_ROW")>0;
            if(!cyrillic || !numbers || !orders || !slotCandidate || !orderRowCandidate)
                throw new AssertionError("OCR/extraction mismatch: cyrillic="+cyrillic+", number="+numbers
                    +", orders="+orders+", slot="+slotCandidate+", orderRow="+orderRowCandidate);
            VideoImportDatabase database=new VideoImportDatabase(this);
            String probeImportId="m4v_"+result.sourceSha256.substring(0,32);
            database.deleteImport(probeImportId);
            VideoImportDatabase.PersistResult stored=database.persist(result,"video/mp4");
            if(stored.duplicate || stored.frameCount<1 || stored.insertedCandidateCount<1)
                throw new AssertionError("local evidence/candidate persistence failed");
            M4ForecastFactWriter.ImportResult forecast=M4ForecastFactWriter.importFacts(this,result);
            if(!forecast.accepted || forecast.duplicate || forecast.orderCount!=1 || forecast.forecastDay==null
                    || forecast.forecastDay.getInt("orders")!=1)
                throw new AssertionError("forecast writer did not accept the exact synthetic order: "+forecast.message);
            String date=forecast.forecastDay.getString("date");
            boolean saved=getSharedPreferences("m4-forecast-qa",MODE_PRIVATE).edit()
                .putString("source",forecast.source).putString("date",date).commit();
            if(!saved) throw new AssertionError("restart verification marker could not be saved");
            show("M4 FORECAST WRITE PASS\nSynthetic fixture only\n1 order · 10000 kopecks\nForecast facts saved; restart check pending.");
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
            if(orders[0]!=1||orders[1]!=10000||forecast[0]!=1||forecast[1]!=1||!"mirrored".equals(status))
                throw new AssertionError("persisted forecast mismatch: orderRows="+orders[0]+", reward="+orders[1]
                    +", forecastRows="+forecast[0]+", forecastOrders="+forecast[1]+", sourceStatus="+status);
            show("M4 FORECAST RESTART PASS\nSQLite survived force-stop\n1 order · ₽100 · forecast count 1\nSource status: mirrored");
        } catch(Throwable error) {
            show("M4 FORECAST RESTART FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally { if(store!=null) store.close(); }
    }

    private static long[] counts(SQLiteDatabase db,String sql,String... args) {
        try(Cursor cursor=db.rawQuery(sql,args)) {
            if(!cursor.moveToFirst()) return new long[]{-1,-1};
            return new long[]{cursor.getLong(0),cursor.getLong(1)};
        }
    }

    private void show(String text) { runOnUiThread(()->label.setText(text)); }
    @Override protected void onDestroy() { worker.shutdownNow();super.onDestroy(); }
}
