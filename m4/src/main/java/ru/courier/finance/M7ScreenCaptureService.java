package ru.courier.finance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.ResultReceiver;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.time.ZoneId;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** User-visible, one-session MediaProjection capture with OCR kept in memory only. */
public final class M7ScreenCaptureService extends Service {
    public static final String ACTION_START="ru.courier.finance.m7.START";
    public static final String ACTION_STOP="ru.courier.finance.m7.STOP";
    public static final String ACTION_ATTACH="ru.courier.finance.m7.ATTACH";
    public static final String EXTRA_RESULT="m7.result";
    private static final String EXTRA_REPORT_DATE="m7.reportDate";
    private static final String EXTRA_RECEIVER="m7.receiver";
    private static final String CHANNEL="m7_screen_capture";
    private static final String ZERO_HASH="0000000000000000000000000000000000000000000000000000000000000000";
    private static final int NOTIFICATION_ID=4707;
    private static final int MAX_FRAMES=600;
    private static final int MAX_CAPTURE_SIDE=1608;
    private static final long MIN_SAMPLE_MS=900L;
    private static final long MAX_SESSION_MS=15L*60L*1000L;
    private static final int STATUS_ACTIVE=10;
    private static final int STATUS_FINAL=20;
    private static volatile Bundle lastResult;

    private final Handler mainHandler=new Handler(android.os.Looper.getMainLooper());
    private final List<VideoImportProcessor.Observation> observations=new ArrayList<>();
    private HandlerThread captureThread;
    private Handler captureHandler;
    private ImageReader imageReader;
    private VirtualDisplay virtualDisplay;
    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private TesseractOcrEngine ocr;
    private ResultReceiver resultReceiver;
    private String reportDate;
    private volatile boolean acceptingFrames;
    private boolean ending;
    private boolean interrupted;
    private String stopReason="Захват завершён пользователем.";
    private long sessionStartedAt;
    private long lastSampleAt;
    private Runnable maxSessionStop;

    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(intent==null) { stopSelf(startId); return START_NOT_STICKY; }
        if(ACTION_ATTACH.equals(intent.getAction())) {
            resultReceiver=receiver(intent);
            if(acceptingFrames) sendStatus("Захват активен. Откройте Яндекс Про и остановите сеанс после прокрутки отчёта.");
            else if(projection==null&&captureThread==null) deliverFailure(
                "Сеанс захвата уже завершён или был прерван. Запустите новый сеанс и подтвердите системное разрешение.");
            return START_NOT_STICKY;
        }
        if(ACTION_STOP.equals(intent.getAction())) {
            endCapture(true,false,"Захват остановлен пользователем.");
            return START_NOT_STICKY;
        }
        if(!ACTION_START.equals(intent.getAction())) { stopSelf(startId); return START_NOT_STICKY; }
        if(projection!=null||captureThread!=null) return START_NOT_STICKY;

        reportDate=intent.getStringExtra(EXTRA_REPORT_DATE);
        lastResult=null;
        resultReceiver=receiver(intent);
        try {
            startForegroundCompat();
            int resultCode=intent.getIntExtra("m7.projectionResult",0);
            Intent consent=intent.getParcelableExtra("m7.projectionData");
            if(resultCode!=Activity.RESULT_OK||consent==null||reportDate==null||reportDate.trim().isEmpty())
                throw new IllegalArgumentException("Системное разрешение или дата отчёта отсутствуют.");
            MediaProjectionManager manager=(MediaProjectionManager)getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection=manager.getMediaProjection(resultCode,consent);
            if(projection==null) throw new IllegalStateException("Android не выдал разрешение на захват экрана.");
            startProjection();
        } catch(Exception failure) {
            String message=failure.getMessage()==null?"Не удалось начать захват экрана.":failure.getMessage();
            deliverFailure(message);
        }
        return START_NOT_STICKY;
    }

    private void startProjection() {
        WindowManager window=(WindowManager)getSystemService(WINDOW_SERVICE);
        DisplayMetrics metrics=new DisplayMetrics();
        window.getDefaultDisplay().getRealMetrics(metrics);
        int sourceWidth=Math.max(1,metrics.widthPixels),sourceHeight=Math.max(1,metrics.heightPixels);
        float scale=Math.min(1f,(float)MAX_CAPTURE_SIDE/Math.max(sourceWidth,sourceHeight));
        int width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
        int density=Math.max(1,Math.round(metrics.densityDpi*scale));
        imageReader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2);
        captureThread=new HandlerThread("m7-screen-ocr");
        captureThread.start();
        captureHandler=new Handler(captureThread.getLooper());
        projectionCallback=new MediaProjection.Callback() {
            @Override public void onStop() {
                if(ending) return;
                projection=null;
                interrupted=true;
                endCapture(false,true,"Android остановил захват. Для нового сеанса потребуется ещё одно системное разрешение.");
            }
        };
        projection.registerCallback(projectionCallback,mainHandler);
        virtualDisplay=projection.createVirtualDisplay("CourierForecastM7",width,height,density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,imageReader.getSurface(),null,mainHandler);
        if(virtualDisplay==null) throw new IllegalStateException("Не удалось создать поток кадров экрана.");
        sessionStartedAt=SystemClock.elapsedRealtime();
        captureHandler.post(()->{
            try {
                ocr=new TesseractOcrEngine(getApplicationContext());
                captureHandler.post(()->{
                    if(ending) { closeCaptureResources(); return; }
                    acceptingFrames=true;
                    imageReader.setOnImageAvailableListener(this::captureLatestFrame,captureHandler);
                    sendStatus("Захват активен. Кадры и текст распознавания остаются только в памяти до остановки.");
                    maxSessionStop=()->endCapture(true,false,"Достигнут предел 15 минут. Результаты уже захваченных экранов сверяются.");
                    mainHandler.postDelayed(maxSessionStop,MAX_SESSION_MS);
                    updateNotification("Откройте Яндекс Про, покажите отчёт и прокрутите список заказов.");
                });
            } catch(Exception failure) {
                String message=failure.getMessage()==null?"Не удалось подготовить локальный OCR.":failure.getMessage();
                mainHandler.post(()->endCapture(true,true,message));
            }
        });
    }

    private void captureLatestFrame(ImageReader reader) {
        Image image=null;
        Bitmap bitmap=null;
        try {
            image=reader.acquireLatestImage();
            if(image==null) return;
            long now=SystemClock.elapsedRealtime();
            if(!acceptingFrames||now-lastSampleAt<MIN_SAMPLE_MS) return;
            if(observations.size()>=MAX_FRAMES) {
                mainHandler.post(()->endCapture(true,false,"Достигнут предел 600 кадров. Результаты сверяются."));
                return;
            }
            lastSampleAt=now;
            bitmap=toBitmap(image);
            Bitmap scaled=scaleForOcr(bitmap);
            if(scaled!=bitmap) { bitmap.recycle(); bitmap=scaled; }
            TesseractOcrEngine.Recognition recognition=ocr.recognize(bitmap);
            YandexScreenParser.Result parsed=YandexScreenParser.parse(recognition.text,recognition.hocrText);
            String frameHash=sha256Text(recognition.text+"\n"+recognition.hocrText);
            int index=observations.size();
            observations.add(new VideoImportProcessor.Observation(index,now-sessionStartedAt,frameHash,
                recognition.text,recognition.confidence,parsed,null));
            if(observations.size()%30==0) mainHandler.post(()->updateNotification("Локально обработано экранов: "+observations.size()+"."));
        } catch(Exception ignored) {
            // A damaged or temporarily unavailable frame does not end the session.
        } finally {
            if(image!=null) image.close();
            if(bitmap!=null&&!bitmap.isRecycled()) bitmap.recycle();
        }
    }

    private static Bitmap toBitmap(Image image) {
        Image.Plane[] planes=image.getPlanes();
        if(planes.length==0) throw new IllegalStateException("Кадр не содержит изображение.");
        Image.Plane plane=planes[0];
        int width=image.getWidth(),height=image.getHeight(),pixelStride=plane.getPixelStride(),rowStride=plane.getRowStride();
        if(pixelStride<4||rowStride<width*pixelStride) throw new IllegalStateException("Формат кадра экрана не поддерживается.");
        ByteBuffer bytes=plane.getBuffer().duplicate();
        int base=bytes.position();
        int[] pixels=new int[width*height];
        for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
            int offset=base+y*rowStride+x*pixelStride;
            int r=bytes.get(offset)&0xff,g=bytes.get(offset+1)&0xff,b=bytes.get(offset+2)&0xff,a=bytes.get(offset+3)&0xff;
            pixels[y*width+x]=(a<<24)|(r<<16)|(g<<8)|b;
        }
        Bitmap bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
        bitmap.setPixels(pixels,0,width,0,0,width,height);
        return bitmap;
    }

    private static Bitmap scaleForOcr(Bitmap source) {
        int maxSide=1608;
        int side=Math.max(source.getWidth(),source.getHeight());
        if(side<=maxSide) return source;
        float scale=(float)maxSide/side;
        int width=Math.max(1,Math.round(source.getWidth()*scale));
        int height=Math.max(1,Math.round(source.getHeight()*scale));
        return Bitmap.createScaledBitmap(source,width,height,false);
    }

    private void endCapture(boolean stopProjection,boolean wasInterrupted,String reason) {
        if(ending) return;
        ending=true;
        acceptingFrames=false;
        interrupted|=wasInterrupted;
        stopReason=reason==null?stopReason:reason;
        if(maxSessionStop!=null) mainHandler.removeCallbacks(maxSessionStop);
        if(imageReader!=null) imageReader.setOnImageAvailableListener(null,captureHandler);
        if(virtualDisplay!=null) { virtualDisplay.release(); virtualDisplay=null; }
        MediaProjection active=projection;
        projection=null;
        if(active!=null) {
            if(projectionCallback!=null) active.unregisterCallback(projectionCallback);
            if(stopProjection) try { active.stop(); } catch(Exception ignored) { }
        }
        Handler worker=captureHandler;
        if(worker==null) { deliverFailure(stopReason); return; }
        worker.post(()->processAndDeliver());
    }

    private void processAndDeliver() {
        try {
            if(ocr!=null) { ocr.close(); ocr=null; }
            if(observations.isEmpty()) {
                deliverFailure(interrupted?"Android остановил захват до распознавания кадров. Запустите новый сеанс и снова подтвердите разрешение."
                    :"Не удалось получить кадры экрана. Проверьте системное разрешение и повторите захват.");
                return;
            }
            List<YandexScreenParser.Candidate> candidates=analysisCandidates();
            String sourceHash=sourceHash(candidates,reportDate);
            int uniqueFrames=(int)observations.stream().map(row->row.frameSha256).distinct().count();
            String metadata=OffsetDateTime.now(ZoneId.of("Europe/Moscow")).toString();
            VideoImportProcessor.Result analysis=new VideoImportProcessor.Result(sourceHash,0,
                Math.max(0,SystemClock.elapsedRealtime()-sessionStartedAt),new ArrayList<>(observations),uniqueFrames,metadata,reportDate);
            M4ForecastFactWriter.ImportResult facts=M4ForecastFactWriter.importFacts(this,analysis);
            JSONObject response=new JSONObject();
            response.put("ok",true).put("duplicate",facts.duplicate).put("frames",observations.size())
                .put("uniqueFrames",uniqueFrames).put("unknownScreens",analysis.unknownScreenCount())
                .put("durationMs",analysis.durationMs).put("sourceSha256",sourceHash)
                .put("forecastFactsAccepted",facts.accepted).put("forecastFactsDuplicate",facts.duplicate)
                .put("forecastFactsNeedsReview",facts.needsReview).put("duplicateOrderRowsSuppressed",facts.suppressedOrderRows)
                .put("forecastFactMessage",facts.message).put("captureInterrupted",interrupted)
                .put("captureStopReason",stopReason).put("rawCapturePersisted",false);
            if(facts.accepted) response.put("forecastSource",facts.source).put("forecastDays",facts.forecastDays)
                .put("importedOrderCount",facts.orderCount).put("visibleOrderRows",facts.visibleOrderRows)
                .put("matchedOrderDetails",facts.matchedOrderDetails).put("rawComplete",facts.rawComplete);
            if(facts.accepted&&facts.forecastDay!=null) response.put("forecastDay",facts.forecastDay);
            boolean evaluationQueued=true;
            if(facts.accepted) {
                try { ForecastAutomation.enqueueAfterVideo(this,sourceHash); }
                catch(Exception schedulingFailure) { evaluationQueued=false; }
            }
            response.put("forecastEvaluationQueued",evaluationQueued).put("handoffSaved",true);
            boolean handoffSaved=true;
            try { writeHandoff(sourceHash,response.toString(),facts.message); }
            catch(Exception handoffFailure) {
                handoffSaved=false;
                response.put("handoffSaved",false);
                response.put("handoffError","Не удалось сохранить страховочную запись результата.");
            }
            String prefix=interrupted?stopReason+" ":(stopReason.equals("Захват завершён пользователем.")?"":stopReason+" ");
            String deliveryMessage=prefix+"Распознано экранов: "+observations.size()+". "+facts.message;
            if(!evaluationQueued) deliveryMessage+=" Факты сохранены, но фоновую оценку прогноза не удалось поставить в очередь.";
            if(!handoffSaved) deliveryMessage+=" Факты сохранены, но страховочная запись результата не создана; дождитесь сообщения на экране приложения.";
            deliver(response.toString(),deliveryMessage);
        } catch(Exception failure) {
            String message=failure.getMessage()==null?"Не удалось сверить захваченный отчёт.":failure.getMessage();
            deliverFailure(message);
        } finally {
            closeCaptureResources();
        }
    }

    private List<YandexScreenParser.Candidate> analysisCandidates() {
        List<YandexScreenParser.Candidate> candidates=new ArrayList<>();
        VideoImportProcessor.Result snapshot=new VideoImportProcessor.Result(ZERO_HASH,0,0,
            new ArrayList<>(observations),observations.size());
        candidates.addAll(snapshot.uniqueCandidates());
        return candidates;
    }

    private static String sourceHash(List<YandexScreenParser.Candidate> candidates,String date) throws Exception {
        List<String> keys=new ArrayList<>();
        for(YandexScreenParser.Candidate candidate:candidates) keys.add(candidate.stableKey());
        Collections.sort(keys);
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        digest.update((date==null?"":date).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        for(String key:keys) {
            digest.update((byte)'\n');
            digest.update(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        StringBuilder value=new StringBuilder(64);
        for(byte b:digest.digest()) value.append(String.format(Locale.ROOT,"%02x",b&0xff));
        return value.toString();
    }

    private static String sha256Text(String value) throws Exception {
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder hash=new StringBuilder(64);
        for(byte b:bytes) hash.append(String.format(Locale.ROOT,"%02x",b&0xff));
        return hash.toString();
    }

    private void writeHandoff(String hash,String response,String message) throws Exception {
        if(hash==null||!hash.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Хэш сессии не прошёл проверку.");
        File directory=new File(getFilesDir(),"video-import-results");
        if(!directory.isDirectory()&&!directory.mkdirs()) throw new IllegalStateException("Не удалось сохранить результат локального импорта.");
        File target=new File(directory,hash+".json"),temporary=new File(directory,hash+".json.tmp");
        byte[] bytes=new JSONObject().put("response",response).put("message",message==null?"":message).toString()
            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try(FileOutputStream output=new FileOutputStream(temporary)) { output.write(bytes); output.getFD().sync(); }
        if(!temporary.renameTo(target)) { temporary.delete(); throw new IllegalStateException("Не удалось завершить локальную запись результата."); }
    }

    private void startForegroundCompat() {
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26) manager.createNotificationChannel(new NotificationChannel(
            CHANNEL,"Захват отчёта",NotificationManager.IMPORTANCE_LOW));
        Notification notification=buildNotification("Подготовка к захвату экрана.");
        if(Build.VERSION.SDK_INT>=29) startForeground(NOTIFICATION_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIFICATION_ID,notification);
    }

    private Notification buildNotification(String text) {
        Intent stop=new Intent(this,M7ScreenCaptureService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent=PendingIntent.getService(this,NOTIFICATION_ID,stop,
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Захват отчёта Яндекс Про")
            .setContentText(text).setOnlyAlertOnce(true).setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause,"Остановить",stopIntent).build();
    }

    private void updateNotification(String text) {
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID,buildNotification(text));
    }

    private void sendStatus(String message) {
        if(resultReceiver==null) return;
        Bundle data=new Bundle(); data.putString("status",message);
        resultReceiver.send(STATUS_ACTIVE,data);
    }

    private void deliverFailure(String message) {
        try { deliver(new JSONObject().put("ok",false).put("error",message).toString(),message); }
        catch(Exception ignored) { deliver("{\"ok\":false,\"error\":\"Не удалось обработать захват экрана.\"}","Не удалось обработать захват экрана."); }
    }

    private void deliver(String json,String message) {
        lastResult=new Bundle();
        lastResult.putString(EXTRA_RESULT,json);
        lastResult.putString("message",message);
        mainHandler.post(()->{
            if(resultReceiver!=null) resultReceiver.send(STATUS_FINAL,new Bundle(lastResult));
            stopForegroundCompat();
            stopSelf();
        });
    }

    static Bundle lastResult() { return lastResult==null?null:new Bundle(lastResult); }

    private void closeCaptureResources() {
        if(imageReader!=null) { try { imageReader.close(); } catch(Exception ignored) { } imageReader=null; }
        if(ocr!=null) { try { ocr.close(); } catch(Exception ignored) { } ocr=null; }
        if(captureThread!=null) { captureThread.quitSafely(); captureThread=null; captureHandler=null; }
    }

    private void stopForegroundCompat() {
        if(Build.VERSION.SDK_INT>=24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
    }

    private static ResultReceiver receiver(Intent intent) {
        if(Build.VERSION.SDK_INT>=33) return intent.getParcelableExtra(EXTRA_RECEIVER,ResultReceiver.class);
        //noinspection deprecation
        return intent.getParcelableExtra(EXTRA_RECEIVER);
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onDestroy() {
        acceptingFrames=false;
        if(projection!=null) {
            try { projection.stop(); } catch(Exception ignored) { }
            projection=null;
        }
        if(virtualDisplay!=null) { virtualDisplay.release(); virtualDisplay=null; }
        closeCaptureResources();
        super.onDestroy();
    }
}
