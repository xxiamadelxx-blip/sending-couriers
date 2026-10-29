package ru.courier.finance;

import android.app.Activity;
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
        worker.execute(this::runProbe);
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
                numbers |= row.ocrText.contains("900") || row.ocrText.contains("12:34");
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
            show("M4 OFFLINE VIDEO OCR QA PASS\nSynthetic fixture only\n"+stored.frameCount
                +" timed frames · "+stored.insertedCandidateCount+" parsed rows persisted\nNo order or payment fact created.");
        } catch(Throwable error) {
            show("M4 OFFLINE VIDEO OCR QA FAIL\n"+error.getClass().getSimpleName()+": "+String.valueOf(error.getMessage()));
        } finally { if(video!=null) video.delete(); }
    }

    private void show(String text) { runOnUiThread(()->label.setText(text)); }
    @Override protected void onDestroy() { worker.shutdownNow();super.onDestroy(); }
}
