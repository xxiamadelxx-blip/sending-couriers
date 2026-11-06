package ru.courier.finance;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;

/** Test-only loader. Personal files are inserted locally after the build, never in source control. */
public final class M4QaInputActivity extends Activity {
    private TextView status;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        int pad=(int)(24*getResources().getDisplayMetrics().density);
        root.setPadding(pad,pad,pad,pad);
        status=new TextView(this); status.setText("Тестовые данные на устройстве");
        root.addView(status);
        Button load=new Button(this); load.setText("Подготовить файлы");
        load.setOnClickListener(v -> {
            load.setEnabled(false); status.setText("Подготовка файлов…");
            new Thread(() -> {
                try {
                    for(int i=1;i<=4;i++) copy("qa-input/report"+i+".mp4","qa-video-"+i+".mp4","video/mp4",true);
                    copy("qa-input/backup.json","qa-backup.json","application/json",false);
                    runOnUiThread(() -> {status.setText("Файлы подготовлены");load.setEnabled(true);});
                } catch(Exception e) {
                    runOnUiThread(() -> {status.setText("Ошибка подготовки: "+e.getClass().getSimpleName());load.setEnabled(true);});
                }
            }).start();
        });
        root.addView(load);
        Button open=new Button(this);open.setText("Открыть приложение");
        open.setOnClickListener(v -> startActivity(new Intent(this,MainActivity.class)));
        root.addView(open);setContentView(root);
    }
    private void copy(String asset,String name,String mime,boolean video) throws Exception {
        ContentValues values=new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME,name);
        values.put(MediaStore.MediaColumns.MIME_TYPE,mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH,video?Environment.DIRECTORY_MOVIES:Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING,1);
        Uri uri=getContentResolver().insert(video?MediaStore.Video.Media.EXTERNAL_CONTENT_URI:MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
        if(uri==null) throw new IllegalStateException("Unable to create test file");
        try(InputStream in=getAssets().open(asset);OutputStream out=getContentResolver().openOutputStream(uri)) {
            if(out==null) throw new IllegalStateException("Unable to open test file");
            byte[] buf=new byte[65536]; int n;
            while((n=in.read(buf))!=-1) out.write(buf,0,n);
            values.clear();values.put(MediaStore.MediaColumns.IS_PENDING,0);
            getContentResolver().update(uri,values,null,null);
        } catch(Exception e) {getContentResolver().delete(uri,null,null);throw e;}
    }
}
