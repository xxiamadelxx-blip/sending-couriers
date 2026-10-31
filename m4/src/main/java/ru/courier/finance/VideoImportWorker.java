package ru.courier.finance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;

import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Restartable, on-device OCR and import. The input video is a private app file. */
public final class VideoImportWorker extends Worker {
    public static final String KEY_FILE="video_file";
    public static final String KEY_SHA256="video_sha256";
    public static final String KEY_MIME="video_mime";
    public static final String KEY_NAME="video_name";
    public static final String KEY_RESULT_FILE="result_file";
    public static final String KEY_ERROR="error";
    public static final String KEY_DONE="frames_done";
    public static final String KEY_TOTAL="frames_total";
    private static final String CHANNEL="video_import";
    private static final int NOTIFICATION_ID=4107;

    public VideoImportWorker(Context context,WorkerParameters parameters) { super(context,parameters); }

    @Override public Result doWork() {
        Context context=getApplicationContext();
        File source=null;
        boolean factsCommitted=false;
        try {
            source=checkedInputFile(getInputData().getString(KEY_FILE));
            String expected=getInputData().getString(KEY_SHA256);
            if(expected==null||!expected.matches("[0-9a-f]{64}")||!expected.equals(sha256(source)))
                return Result.failure(errorData("Хэш локального видео не совпал; импорт остановлен."));
            setForegroundAsync(foreground(context)).get(15,TimeUnit.SECONDS);
            String mime=VideoImportProcessor.normalizedMime(getInputData().getString(KEY_MIME),
                getInputData().getString(KEY_NAME));
            VideoImportProcessor.Result analysis;
            try(TesseractOcrEngine ocr=new TesseractOcrEngine(context)) {
                analysis=VideoImportProcessor.processFile(context,source,mime,getInputData().getString(KEY_NAME),
                    ocr::recognize,(done,total)->setProgressAsync(new Data.Builder()
                        .putInt(KEY_DONE,done).putInt(KEY_TOTAL,total).build()));
            }
            if(!expected.equals(analysis.sourceSha256))
                return Result.failure(errorData("Хэш обработанного видео изменился; импорт остановлен."));

            VideoImportDatabase.PersistResult evidence=new VideoImportDatabase(context).persist(analysis,mime);
            M4ForecastFactWriter.ImportResult facts=M4ForecastFactWriter.importFacts(context,analysis);
            factsCommitted=true;
            JSONObject response=new JSONObject();
            response.put("ok",true).put("duplicate",evidence.duplicate).put("frames",evidence.frameCount)
                .put("uniqueFrames",analysis.uniqueFramesOcr).put("unknownScreens",evidence.unknownScreenCount)
                .put("durationMs",analysis.durationMs).put("persistedCandidateRows",evidence.insertedCandidateCount)
                .put("sourceSha256",analysis.sourceSha256);
            JSONArray extractions=new JSONArray();
            List<YandexScreenParser.Candidate> candidates=analysis.uniqueCandidates();
            for(int i=0;i<candidates.size()&&i<100;i++) extractions.put(new JSONObject(candidates.get(i).toJson()));
            response.put("extractedCandidateCount",analysis.uniqueCandidateCount())
                .put("extractionsTruncated",candidates.size()>100).put("extractions",extractions)
                .put("forecastFactsAccepted",facts.accepted).put("forecastFactsDuplicate",facts.duplicate)
                .put("forecastFactMessage",facts.message);
            if(facts.accepted) response.put("forecastSource",facts.source).put("forecastDay",facts.forecastDay)
                .put("importedOrderCount",facts.orderCount).put("visibleOrderRows",facts.visibleOrderRows)
                .put("matchedOrderDetails",facts.matchedOrderDetails).put("rawComplete",facts.rawComplete);

            String message=(evidence.duplicate
                ?"Видео уже импортировалось. Ниже показан повторный анализ; ранее сохранённые результаты не перезаписывались.\n\n"
                :"")+extractionSummary(analysis,evidence.duplicate)+"\n\n"+facts.message;
            File output=writeResult(context,analysis.sourceSha256,response.toString(),message);
            if(source!=null) source.delete();
            ForecastAutomation.enqueueAfterVideo(context,analysis.sourceSha256);
            return Result.success(new Data.Builder().putString(KEY_RESULT_FILE,output.getAbsolutePath()).build());
        } catch(InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return Result.retry();
        } catch(Throwable failure) {
            // A crash after the SQLite fact commit must not turn the Work into
            // a terminal failure and discard its only recoverable input. All
            // database writes are idempotent, so a retry can safely recreate
            // the durable handoff JSON and let the WebView acknowledge it.
            if(isStopped()||factsCommitted) return Result.retry();
            if(source!=null) source.delete();
            String message=failure.getMessage()==null?failure.getClass().getSimpleName():failure.getMessage();
            return Result.failure(errorData(message));
        }
    }

    private File checkedInputFile(String raw) throws Exception {
        if(raw==null||raw.isEmpty()) throw new IllegalArgumentException("Не найден локальный файл видео.");
        File root=new File(getApplicationContext().getFilesDir(),"video-import-queue").getCanonicalFile();
        File file=new File(raw).getCanonicalFile();
        if(!file.getPath().startsWith(root.getPath()+File.separator)||!file.isFile()||file.length()<=0
                ||file.length()>VideoImportProcessor.MAX_VIDEO_BYTES)
            throw new IllegalArgumentException("Локальный файл видео недоступен или не прошёл проверку размера.");
        return file;
    }

    private ForegroundInfo foreground(Context context) {
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26) manager.createNotificationChannel(new NotificationChannel(
            CHANNEL,"Импорт видео",NotificationManager.IMPORTANCE_LOW));
        Notification.Builder builder=Build.VERSION.SDK_INT>=26
            ?new Notification.Builder(context,CHANNEL):new Notification.Builder(context);
        Notification notification=builder.setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Доход курьера")
            .setContentText("Локально распознаю видео Яндекс Про")
            .setOnlyAlertOnce(true).setOngoing(true).build();
        if(Build.VERSION.SDK_INT>=29) return new ForegroundInfo(NOTIFICATION_ID,notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(NOTIFICATION_ID,notification);
    }

    private static Data errorData(String message) {
        return new Data.Builder().putString(KEY_ERROR,message==null?"Не удалось обработать видео.":message).build();
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256"); byte[] buffer=new byte[64*1024]; int count;
        try(InputStream input=Files.newInputStream(file.toPath())) {
            while((count=input.read(buffer))!=-1) digest.update(buffer,0,count);
        }
        StringBuilder out=new StringBuilder(64);
        for(byte value:digest.digest()) out.append(String.format(Locale.ROOT,"%02x",value&0xff));
        return out.toString();
    }

    private static File writeResult(Context context,String hash,String json,String message) throws Exception {
        File directory=new File(context.getFilesDir(),"video-import-results");
        if(!directory.isDirectory()&&!directory.mkdirs()) throw new IllegalStateException("Не удалось сохранить локальный отчёт импорта.");
        File destination=new File(directory,hash+".json"),temporary=new File(directory,hash+".json.tmp");
        JSONObject result=new JSONObject().put("response",json).put("message",message);
        byte[] bytes=result.toString().getBytes(StandardCharsets.UTF_8);
        try(FileOutputStream output=new FileOutputStream(temporary)) { output.write(bytes); output.getFD().sync(); }
        if(!temporary.renameTo(destination)) { temporary.delete(); throw new IllegalStateException("Не удалось сохранить локальный отчёт импорта."); }
        return destination;
    }

    private static String extractionSummary(VideoImportProcessor.Result result,boolean repeated) {
        String slotCount="";
        for(YandexScreenParser.Candidate candidate:result.uniqueCandidates()) if("SLOT_DETAIL".equals(candidate.candidateType))
            for(YandexScreenParser.Field field:candidate.fields) if("slot_order_count".equals(field.name)) slotCount=field.value;
        StringBuilder summary=new StringBuilder("Видео разобрано локально.\nКадров обработано: ")
            .append(result.observations.size()).append(" (это кадры видео, не количество заказов).\nНеизвестных кадров: ")
            .append(result.unknownScreenCount()).append(".");
        if(!slotCount.isEmpty()) summary.append("\nНа карточке слота указано заказов: ").append(slotCount)
            .append(" (общий счётчик, не извлечённые записи).");
        summary.append("\nРаспознано отдельно: карточек заказов — ").append(result.uniqueCandidateCount("ORDER_DETAIL"))
            .append(", строк списка — ").append(result.uniqueCandidateCount("ORDER_LIST_ROW"))
            .append(". Одна доставка может присутствовать и в карточке, и в списке.")
            .append("\nСводок слотов — ").append(result.uniqueCandidateCount("SLOT_DETAIL"))
            .append(", сводок дохода — ").append(result.uniqueCandidateCount("INCOME_SUMMARY"))
            .append(", строк начислений — ").append(result.uniqueCandidateCount("INCOME_LINE"))
            .append(".\n\nИсходные OCR-кадры и кандидаты ").append(repeated?"уже есть":"сохранены")
            .append(" в локальной базе.");
        return summary.toString();
    }

}
