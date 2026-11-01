package ru.courier.finance;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.NotificationManager;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ResultReceiver;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.time.LocalDate;
import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/** User-directed screen capture consent and start/stop screen for M7. */
public final class M7CaptureActivity extends Activity {
    private static final int REQUEST_CAPTURE=7401;
    private static final int REQUEST_NOTIFICATIONS=7402;
    private String reportDate;
    private boolean active;
    private boolean stopping;
    private TextView status;
    private Button stopButton;
    private final ResultReceiver receiver=new ResultReceiver(new Handler(Looper.getMainLooper())) {
        @Override protected void onReceiveResult(int resultCode,Bundle data) {
            if(resultCode==10) {
                active=true;
                if(status!=null) status.setText(data==null?"Захват активен.":data.getString("status","Захват активен."));
                return;
            }
            if(resultCode==20&&data!=null) {
                active=false;
                showResult(data.getString(M7ScreenCaptureService.EXTRA_RESULT),data.getString("message"));
            }
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if(state!=null) {
            reportDate=state.getString("m7.reportDate");
            active=state.getBoolean("m7.active",false);
        }
        if(active) {
            Bundle completed=M7ScreenCaptureService.lastResult();
            if(completed!=null) { showResult(completed.getString(M7ScreenCaptureService.EXTRA_RESULT),completed.getString("message")); return; }
            showCaptureScreen();
            startService(new Intent(this,M7ScreenCaptureService.class).setAction(M7ScreenCaptureService.ACTION_ATTACH)
                .putExtra("m7.receiver",receiver));
        } else chooseReportDate();
    }

    private void chooseReportDate() {
        Calendar calendar=Calendar.getInstance(TimeZone.getTimeZone("Europe/Moscow"),Locale.ROOT);
        Calendar maxDate=Calendar.getInstance();
        maxDate.clear();
        maxDate.set(calendar.get(Calendar.YEAR),calendar.get(Calendar.MONTH),calendar.get(Calendar.DAY_OF_MONTH),23,59,59);
        maxDate.set(Calendar.MILLISECOND,999);
        DatePickerDialog picker=new DatePickerDialog(this,(view,year,month,day)->{
            reportDate=LocalDate.of(year,month+1,day).toString();
            explainAndRequestConsent();
        },calendar.get(Calendar.YEAR),calendar.get(Calendar.MONTH),calendar.get(Calendar.DAY_OF_MONTH));
        picker.getDatePicker().setMaxDate(maxDate.getTimeInMillis());
        picker.setTitle("Дата отчёта");
        picker.setOnCancelListener(dialog->finishCancelled());
        picker.show();
    }

    private void explainAndRequestConsent() {
        new AlertDialog.Builder(this).setTitle("Захват отчёта")
            .setMessage("Выбрана дата "+reportDate+". Она применяется только к слотам, где Яндекс Про не показал дату. Даты на карточках слотов имеют приоритет. Если разные дни не подписаны на карточках, захватывайте их отдельными сеансами.\n\nВо время сеанса Android покажет системное уведомление с кнопкой остановки. Экран распознаётся локально; исходные кадры и текст OCR не сохраняются. Покажите карточки слотов и прокрутите список заказов, затем вернитесь сюда и остановите захват.")
            .setNegativeButton("Отмена",(dialog,which)->finishCancelled())
            .setPositiveButton("Разрешить захват",(dialog,which)->requestProjectionConsent())
            .setOnCancelListener(dialog->finishCancelled()).show();
    }

    private void requestProjectionConsent() {
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},REQUEST_NOTIFICATIONS);
            return;
        }
        if(!notificationsEnabled()) return;
        launchProjectionConsent();
    }

    private boolean notificationsEnabled() {
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(manager!=null&&manager.areNotificationsEnabled()) return true;
        new AlertDialog.Builder(this).setTitle("Нужно системное уведомление")
            .setMessage("Для безопасного захвата Android должен показывать уведомление с кнопкой остановки. Включите уведомления приложения и запустите захват снова.")
            .setNegativeButton("Закрыть",(dialog,which)->finishCancelled())
            .setPositiveButton("Настройки",(dialog,which)->{
                try {
                    Intent settings=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());
                    startActivity(settings);
                    finishCancelled();
                } catch(Exception failure) { finishFailure("Не удалось открыть настройки уведомлений приложения."); }
            }).show();
        return false;
    }

    private void launchProjectionConsent() {
        try {
            MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
            startActivityForResult(manager.createScreenCaptureIntent(),REQUEST_CAPTURE);
        } catch(Exception failure) { finishFailure("Не удалось запросить разрешение Android на захват экрана."); }
    }

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        if(requestCode!=REQUEST_NOTIFICATIONS) return;
        if(grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED) {
            if(notificationsEnabled()) launchProjectionConsent();
        } else if(!notificationsEnabled()) return;
        else finishFailure("Захват не начат: разрешите уведомление, чтобы Android показывал активный сеанс и кнопку остановки.");
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=REQUEST_CAPTURE) return;
        if(resultCode!=RESULT_OK||data==null) { finishCancelled(); return; }
        try {
            Intent service=new Intent(this,M7ScreenCaptureService.class).setAction(M7ScreenCaptureService.ACTION_START)
                .putExtra("m7.projectionResult",resultCode).putExtra("m7.projectionData",data)
                .putExtra("m7.reportDate",reportDate).putExtra("m7.receiver",receiver);
            if(Build.VERSION.SDK_INT>=26) startForegroundService(service); else startService(service);
            active=true;
            showCaptureScreen();
        } catch(Exception failure) { finishFailure("Не удалось запустить захват экрана."); }
    }

    private void showCaptureScreen() {
        LinearLayout layout=new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL); layout.setGravity(Gravity.CENTER_VERTICAL);
        int pad=(int)(24*getResources().getDisplayMetrics().density);
        layout.setPadding(pad,pad,pad,pad);
        layout.setBackgroundColor(0xff12181d);
        TextView title=new TextView(this); title.setText("Захват отчёта Яндекс Про");
        title.setTextColor(0xffffa23a); title.setTextSize(22); title.setGravity(Gravity.CENTER);
        layout.addView(title,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));
        status=new TextView(this); status.setText(active?"Сеанс активен. Откройте Яндекс Про, покажите сводку и прокрутите список заказов.":"Подготовка захвата…");
        status.setTextColor(0xfff1f3f4); status.setTextSize(17); status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textParams=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);
        textParams.topMargin=pad; layout.addView(status,textParams);
        Button open=new Button(this); open.setText("Открыть Яндекс Про"); open.setOnClickListener(view->openYandexPro());
        addButton(layout,open,pad);
        stopButton=new Button(this); stopButton.setText("Остановить и обработать"); stopButton.setOnClickListener(view->stopCapture());
        addButton(layout,stopButton,pad);
        setContentView(layout);
    }

    private static void addButton(LinearLayout layout,Button button,int margin) {
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin=margin/2; layout.addView(button,params);
    }

    private void openYandexPro() {
        try {
            Intent launch=getPackageManager().getLaunchIntentForPackage("ru.yandex.taximeter");
            if(launch==null) { Toast.makeText(this,"Яндекс Про не найден. Откройте приложение вручную.",Toast.LENGTH_LONG).show(); return; }
            startActivity(launch);
        } catch(Exception failure) { Toast.makeText(this,"Не удалось открыть Яндекс Про. Переключитесь на него вручную.",Toast.LENGTH_LONG).show(); }
    }

    private void stopCapture() {
        if(!active||stopping) return;
        stopping=true;
        stopButton.setEnabled(false);
        status.setText("Останавливаю захват и сверяю распознанные факты…");
        startService(new Intent(this,M7ScreenCaptureService.class).setAction(M7ScreenCaptureService.ACTION_STOP));
    }

    private void showResult(String json,String message) {
        if(json==null) { finishFailure("Захват завершился без результата."); return; }
        String text=message==null?"Результат локального захвата готов.":message;
        new AlertDialog.Builder(this).setTitle("Результат захвата").setMessage(text)
            .setPositiveButton("Готово",(dialog,which)->returnResult(json))
            .setOnCancelListener(dialog->returnResult(json)).show();
    }

    private void returnResult(String json) {
        Intent result=new Intent(); result.putExtra("m4.video.result",json); setResult(RESULT_OK,result); finish();
    }

    private void finishFailure(String message) {
        try {
            String json=new JSONObject().put("ok",false).put("error",message).toString();
            showResult(json,message);
        } catch(Exception ignored) { finishCancelled(); }
    }

    private void finishCancelled() { setResult(RESULT_CANCELED); finish(); }

    @Override public void onBackPressed() {
        if(!active) { super.onBackPressed(); return; }
        new AlertDialog.Builder(this).setTitle("Захват активен")
            .setMessage("Остановить сеанс и обработать уже распознанные экраны?")
            .setNegativeButton("Продолжить",null)
            .setPositiveButton("Остановить",(dialog,which)->stopCapture()).show();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out); out.putString("m7.reportDate",reportDate); out.putBoolean("m7.active",active);
    }
}
