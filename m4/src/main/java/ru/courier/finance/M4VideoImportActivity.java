package ru.courier.finance;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started local MP4/MOV import. Shared videos and document-picker URIs follow the same path. */
public final class M4VideoImportActivity extends Activity {
    private static final int PICK_VIDEO=410;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private TextView status;
    private ProgressBar progress;
    private boolean launchedForResult;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        launchedForResult=getIntent().getBooleanExtra("m4.returnResult",false) || getCallingActivity()!=null;
        showProgress("Подготовка локального OCR…");
        Uri shared=sharedVideo(getIntent());
        if(shared!=null) process(shared);
        else if(Intent.ACTION_SEND.equals(getIntent().getAction())) finishError("Отправьте одно видео MP4 или MOV.");
        else openPicker();
    }

    private void showProgress(String text) {
        LinearLayout layout=new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER); layout.setPadding(40,40,40,40);
        progress=new ProgressBar(this); progress.setIndeterminate(true);
        status=new TextView(this); status.setText(text); status.setTextSize(18); status.setGravity(Gravity.CENTER);
        layout.addView(progress,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams textParams=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);
        textParams.topMargin=28; layout.addView(status,textParams); setContentView(layout);
    }

    private void openPicker() {
        try {
            Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT); picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("video/*"); picker.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"video/mp4","video/quicktime"});
            startActivityForResult(picker,PICK_VIDEO);
        } catch(Exception error) { finishError("Не удалось открыть выбор видео."); }
    }

    private Uri sharedVideo(Intent intent) {
        if(intent==null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        Object value=intent.getParcelableExtra(Intent.EXTRA_STREAM);
        return value instanceof Uri?(Uri)value:intent.getData();
    }

    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request!=PICK_VIDEO) return;
        if(result!=RESULT_OK || data==null || data.getData()==null) { setResult(RESULT_CANCELED); finish(); return; }
        process(data.getData());
    }

    private void process(Uri uri) {
        status.setText("Извлекаю кадры и распознаю текст на устройстве…");
        executor.execute(() -> {
            File temporary=null;
            try {
                String name=displayName(uri); String mime=VideoImportProcessor.normalizedMime(getContentResolver().getType(uri),name);
                temporary=copyToPrivateCache(uri);
                VideoImportProcessor.Result analysis;
                try(TesseractOcrEngine ocr=new TesseractOcrEngine(this)) {
                    analysis=VideoImportProcessor.processFile(this,temporary,mime,name,ocr::recognize,
                        (done,total)->runOnUiThread(()->{if(status!=null)status.setText("Распознано кадров: "+done+" из "+total+"…");}));
                }
                VideoImportDatabase.PersistResult saved=new VideoImportDatabase(this).persist(analysis,mime);
                JSONObject response=new JSONObject(); response.put("ok",true); response.put("duplicate",saved.duplicate);
                response.put("frames",saved.frameCount); response.put("uniqueFrames",analysis.uniqueFramesOcr);
                response.put("unknownScreens",saved.unknownScreenCount); response.put("durationMs",analysis.durationMs);
                response.put("sourceSha256",analysis.sourceSha256);
                finishWith(response.toString(),saved.duplicate?"Это видео уже обработано.":"Видео разобрано локально. Факты заказов и выплат не изменены.");
            } catch(Exception error) {
                String message=error.getMessage()==null?"Проверьте файл и повторите импорт.":error.getMessage();
                try { JSONObject response=new JSONObject();response.put("ok",false);response.put("error",message);finishWith(response.toString(),message); }
                catch(Exception ignored) { finishError("Не удалось обработать видео."); }
            } finally {
                if(temporary!=null) temporary.delete();
            }
        });
    }

    private File copyToPrivateCache(Uri uri) throws Exception {
        File temp=File.createTempFile("m4-video-", ".tmp",getCacheDir());
        long total=0;
        try(InputStream input=getContentResolver().openInputStream(uri);FileOutputStream output=new FileOutputStream(temp)) {
            if(input==null) throw new IllegalArgumentException("Не удалось открыть видео");
            byte[] buffer=new byte[64*1024];int count;
            while((count=input.read(buffer))!=-1) {
                total+=count; if(total>VideoImportProcessor.MAX_VIDEO_BYTES) throw new IllegalArgumentException("Видео больше 2 ГБ");
                output.write(buffer,0,count);
            }
            output.getFD().sync();
        } catch(Exception failure) { temp.delete(); throw failure; }
        return temp;
    }

    private String displayName(Uri uri) {
        try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
            if(cursor!=null && cursor.moveToFirst()) return cursor.getString(0);
        } catch(Exception ignored) { }
        return uri.getLastPathSegment()==null?"video.mp4":uri.getLastPathSegment();
    }

    private void finishWith(String json,String message) {
        runOnUiThread(()->{
            if(launchedForResult) {
                Intent result=new Intent(); result.putExtra("m4.video.result",json); setResult(RESULT_OK,result); finish();
            } else {
                new AlertDialog.Builder(this).setTitle("Импорт видео")
                    .setMessage(message+"\n\nНеизвестные экраны сохранены локально для следующего этапа проверки.")
                    .setPositiveButton("Закрыть",(dialog,which)->finish()).setOnCancelListener(dialog->finish()).show();
            }
        });
    }

    private void finishError(String message) {
        try { JSONObject response=new JSONObject();response.put("ok",false);response.put("error",message);finishWith(response.toString(),message); }
        catch(Exception ignored) { setResult(RESULT_CANCELED);finish(); }
    }

    @Override protected void onDestroy() { executor.shutdownNow(); super.onDestroy(); }
}
