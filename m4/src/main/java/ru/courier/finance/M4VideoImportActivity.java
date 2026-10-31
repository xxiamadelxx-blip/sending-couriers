package ru.courier.finance;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.content.pm.ApplicationInfo;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.Operation;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started local MP4/MOV import. Shared videos and document-picker URIs follow the same path. */
public final class M4VideoImportActivity extends Activity {
    private static final int PICK_VIDEO=410;
    private static final int MAX_RETURNED_CANDIDATES=100;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final Handler mainHandler=new Handler(Looper.getMainLooper());
    private TextView status;
    private ProgressBar progress;
    private boolean launchedForResult;
    private UUID activeWorkId;
    private Runnable workPoll;
    private boolean resultDelivered;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        launchedForResult=getIntent().getBooleanExtra("m4.returnResult",false) || getCallingActivity()!=null;
        showProgress("Подготовка локального OCR…");
        if(state!=null&&state.containsKey("m4.workId")) {
            try { observeWork(UUID.fromString(state.getString("m4.workId"))); return; }
            catch(Exception ignored) { }
        }
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
        try {
            int grant=data.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if(grant!=0) getContentResolver().takePersistableUriPermission(data.getData(),grant);
        } catch(Exception ignored) { }
        process(data.getData());
    }

    private void process(Uri uri) {
        status.setText("Извлекаю кадры и распознаю текст на устройстве…");
        executor.execute(() -> {
            File pending=null;
            try {
                String name=displayName(uri); String mime=VideoImportProcessor.normalizedMime(getContentResolver().getType(uri),name);
                pending=copyToPrivateQueue(uri);
                String hash=sha256(pending);
                Data input=new Data.Builder().putString(VideoImportWorker.KEY_FILE,pending.getAbsolutePath())
                    .putString(VideoImportWorker.KEY_SHA256,hash).putString(VideoImportWorker.KEY_MIME,mime)
                    .putString(VideoImportWorker.KEY_NAME,name).build();
                OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(VideoImportWorker.class)
                    .addTag("m4-video-import").setInputData(input).build();
                String uniqueName="m4-video-import-"+hash;
                WorkManager manager=WorkManager.getInstance(getApplicationContext());
                List<WorkInfo> prior=manager.getWorkInfosForUniqueWork(uniqueName).get();
                UUID observe=null;
                for(WorkInfo info:prior) if(info.getState()==WorkInfo.State.ENQUEUED
                        ||info.getState()==WorkInfo.State.RUNNING||info.getState()==WorkInfo.State.BLOCKED) {
                    observe=info.getId(); break;
                }
                if(observe!=null) pending.delete();
                else {
                    Operation operation=manager.enqueueUniqueWork(uniqueName,ExistingWorkPolicy.KEEP,request);
                    operation.getResult().get();
                    List<WorkInfo> current=manager.getWorkInfosForUniqueWork(uniqueName).get();
                    for(WorkInfo info:current) if(info.getId().equals(request.getId())) { observe=info.getId(); break; }
                    if(observe==null&&!current.isEmpty()) observe=current.get(0).getId();
                    if(observe==null) throw new IllegalStateException("Не удалось запланировать обработку видео.");
                    if(!observe.equals(request.getId())) pending.delete();
                }
                final UUID id=observe;
                runOnUiThread(()->observeWork(id));
            } catch(Exception error) {
                if(pending!=null) pending.delete();
                String message=error.getMessage()==null?"Проверьте файл и повторите импорт.":error.getMessage();
                try { JSONObject response=new JSONObject();response.put("ok",false);response.put("error",message);finishWith(response.toString(),message); }
                catch(Exception ignored) { finishError("Не удалось обработать видео."); }
            }
        });
    }

    private void observeWork(UUID id) {
        if(isFinishing()||isDestroyed()) return;
        activeWorkId=id;
        if(workPoll!=null) mainHandler.removeCallbacks(workPoll);
        workPoll=()->pollWork(id);
        pollWork(id);
    }

    private void pollWork(UUID id) {
        if(activeWorkId==null||!activeWorkId.equals(id)||isFinishing()||isDestroyed()||resultDelivered)return;
        executor.execute(()->{
            WorkInfo info=null;
            try { info=WorkManager.getInstance(getApplicationContext()).getWorkInfoById(id).get(); }
            catch(Exception ignored) { }
            WorkInfo observed=info;
            runOnUiThread(()->{
                if(activeWorkId==null||!activeWorkId.equals(id)||status==null||isFinishing()||isDestroyed()||resultDelivered)return;
                if(observed==null) {
                    mainHandler.postDelayed(workPoll,1000);
                    return;
                }
                WorkInfo.State state=observed.getState();
                if(state==WorkInfo.State.RUNNING) {
                    int done=observed.getProgress().getInt(VideoImportWorker.KEY_DONE,0);
                    int total=observed.getProgress().getInt(VideoImportWorker.KEY_TOTAL,0);
                    if(total>0) { progress.setIndeterminate(false); progress.setMax(total); progress.setProgress(done); }
                    status.setText(total>0?"Кадров обработано: "+done+" из "+total+"…":"Извлекаю кадры и распознаю текст на устройстве…");
                } else if(state==WorkInfo.State.SUCCEEDED) {
                    resultDelivered=true;
                    String path=observed.getOutputData().getString(VideoImportWorker.KEY_RESULT_FILE);
                    executor.execute(()->deliverResult(path));
                    return;
                } else if(state==WorkInfo.State.FAILED) {
                    resultDelivered=true;
                    String message=observed.getOutputData().getString(VideoImportWorker.KEY_ERROR);
                    String error=message==null?"Не удалось обработать видео.":message;
                    try { finishWith(new JSONObject().put("ok",false).put("error",error).toString(),error); }
                    catch(Exception ignored) { finishError(error); }
                    return;
                } else if(state==WorkInfo.State.CANCELLED) {
                    resultDelivered=true;finishError("Обработка видео отменена.");return;
                }
                if(state==WorkInfo.State.ENQUEUED||state==WorkInfo.State.BLOCKED||state==WorkInfo.State.RUNNING)
                    mainHandler.postDelayed(workPoll,1000);
            });
        });
    }

    @Override protected void onDestroy() {
        if(workPoll!=null) mainHandler.removeCallbacks(workPoll);
        executor.shutdown();
        super.onDestroy();
    }

    private void deliverResult(String path) {
        try {
            if(path==null) throw new IllegalStateException("Не найден сохранённый отчёт импорта.");
            File file=new File(path).getCanonicalFile();
            File root=new File(getFilesDir(),"video-import-results").getCanonicalFile();
            if(!file.getPath().startsWith(root.getPath()+File.separator)||!file.isFile())
                throw new IllegalStateException("Сохранённый отчёт импорта недоступен.");
            byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());
            JSONObject result=new JSONObject(new String(bytes,java.nio.charset.StandardCharsets.UTF_8));
            finishWith(result.getString("response"),result.getString("message"));
        } catch(Exception failure) {
            String message=failure.getMessage()==null?"Не удалось прочитать отчёт импорта.":failure.getMessage();
            try { finishWith(new JSONObject().put("ok",false).put("error",message).toString(),message); }
            catch(Exception ignored) { finishError(message); }
        }
    }

    private File copyToPrivateQueue(Uri uri) throws Exception {
        File directory=new File(getFilesDir(),"video-import-queue");
        if(!directory.isDirectory()&&!directory.mkdirs()) throw new IllegalStateException("Не удалось подготовить локальное хранилище видео.");
        File temp=File.createTempFile("video-", ".mp4",directory);
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

    private static String sha256(File file) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[64*1024];int count;
        try(InputStream input=java.nio.file.Files.newInputStream(file.toPath())) { while((count=input.read(buffer))!=-1) digest.update(buffer,0,count); }
        StringBuilder out=new StringBuilder(64);
        for(byte value:digest.digest()) out.append(String.format(Locale.ROOT,"%02x",value&0xff));
        return out.toString();
    }

    private String displayName(Uri uri) {
        try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
            if(cursor!=null && cursor.moveToFirst()) return cursor.getString(0);
        } catch(Exception ignored) { }
        return uri.getLastPathSegment()==null?"video.mp4":uri.getLastPathSegment();
    }

    private void logDebugCounts(VideoImportProcessor.Result analysis,M4ForecastFactWriter.ImportResult forecast) {
        if((getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)==0) return;
        int rowCount=0;long rowTotal=0;YandexScreenParser.Candidate slot=null;
        List<YandexScreenParser.Candidate> partialSlots=new ArrayList<>();
        for(YandexScreenParser.Candidate candidate:analysis.uniqueCandidates()) {
            if("ORDER_LIST_ROW".equals(candidate.candidateType)) {
                rowCount++;
                try { rowTotal+=Long.parseLong(candidateField(candidate,"amount_kopecks")); }
                catch(Exception ignored) { }
            } else if("SLOT_DETAIL".equals(candidate.candidateType)) {
                if(candidateField(candidate,"slot_id")!=null) slot=slot==null?candidate:slot.mergeMissingFields(candidate);
                else partialSlots.add(candidate);
            }
        }
        for(YandexScreenParser.Candidate partial:partialSlots) if(slot!=null) slot=slot.mergeMissingFields(partial);
        String reason=forecast.accepted?"accepted":debugReason(forecast.message);
        Log.i("M4VideoQa","rows="+rowCount+",rowKopecks="+rowTotal
            +",slotIdPresent="+(candidateField(slot,"slot_id")!=null)
            +",slotCount="+candidateField(slot,"slot_order_count")
            +",slotKopecks="+candidateField(slot,"slot_total_kopecks")
            +",slotStartPresent="+(candidateField(slot,"started_at")!=null)
            +",slotEndPresent="+(candidateField(slot,"completed_at")!=null)
            +",writer="+reason);
    }

    private static String candidateField(YandexScreenParser.Candidate candidate,String name) {
        if(candidate==null) return null;
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }

    private static String debugReason(String message) {
        if(message==null) return "unknown";
        if(message.startsWith("Данные карточки слота неполны")) return "slot_incomplete";
        if(message.startsWith("Не распознана карточка слота")) return "slot_missing";
        if(message.startsWith("Дата или время слота")) return "slot_time_invalid";
        if(message.startsWith("Извлечено строк заказов")) return "count_mismatch";
        if(message.startsWith("Сумма строк списка")) return "total_mismatch";
        if(message.startsWith("В видео найдено несколько")) return "multiple_slots";
        return "other";
    }

    private String extractionSummary(VideoImportProcessor.Result result,boolean candidatesSaved) {
        String slotOrderCount=slotOrderCount(result);
        StringBuilder summary=new StringBuilder("Видео разобрано локально.\nКадров обработано: ")
            .append(result.observations.size())
            .append(" (это кадры видео, не количество заказов).\nНеизвестных кадров: ")
            .append(result.unknownScreenCount())
            .append(".");
        if(!slotOrderCount.isEmpty()) summary.append("\nНа карточке слота указано заказов: ").append(slotOrderCount)
            .append(" (общий счётчик слота, не извлечённые записи).");
        summary.append("\nРаспознано отдельно: карточек заказов — ").append(result.uniqueCandidateCount("ORDER_DETAIL"))
            .append(", строк списка — ").append(result.uniqueCandidateCount("ORDER_LIST_ROW"))
            .append(". Одна доставка может присутствовать и в карточке, и в списке.")
            .append("\nДополнительно: сводок слотов — ").append(result.uniqueCandidateCount("SLOT_DETAIL"))
            .append(", сводок дохода — ").append(result.uniqueCandidateCount("INCOME_SUMMARY"))
            .append(", строк начислений — ").append(result.uniqueCandidateCount("INCOME_LINE"))
            .append(".\n\nИзвлечено:");
        List<YandexScreenParser.Candidate> candidates=orderedCandidates(result);
        int shown=Math.min(8,candidates.size());
        for(int i=0;i<shown;i++) summary.append("\n• ").append(formatCandidate(candidates.get(i)));
        if(candidates.isEmpty()) summary.append("\nПоля не распознаны; кадры доступны для локальной проверки.");
        else if(candidates.size()>shown) summary.append("\n… ещё ").append(candidates.size()-shown).append(" кандидатов сохранено.");
        if(candidatesSaved) summary.append("\n\nИсходные OCR-кадры и кандидаты сохранены локально.");
        else summary.append("\n\nИсходные OCR-кадры и кандидаты уже есть в локальной базе.");
        return summary.toString();
    }

    private String slotOrderCount(VideoImportProcessor.Result result) {
        for(YandexScreenParser.Candidate candidate:result.uniqueCandidates()) {
            if(!"SLOT_DETAIL".equals(candidate.candidateType)) continue;
            for(YandexScreenParser.Field field:candidate.fields)
                if("slot_order_count".equals(field.name)) return field.value;
        }
        return "";
    }

    private List<YandexScreenParser.Candidate> orderedCandidates(VideoImportProcessor.Result result) {
        List<YandexScreenParser.Candidate> all=result.uniqueCandidates();
        List<YandexScreenParser.Candidate> ordered=new ArrayList<>(all.size());
        String[] priority={"ORDER_DETAIL","ORDER_LIST_ROW","INCOME_SUMMARY","INCOME_LINE","SLOT_DETAIL"};
        for(String type:priority) for(YandexScreenParser.Candidate candidate:all)
            if(type.equals(candidate.candidateType)) ordered.add(candidate);
        for(YandexScreenParser.Candidate candidate:all) if(!ordered.contains(candidate)) ordered.add(candidate);
        return ordered;
    }

    private String formatCandidate(YandexScreenParser.Candidate candidate) {
        StringBuilder line=new StringBuilder();
        if("ORDER_DETAIL".equals(candidate.candidateType)) {
            line.append("Карточка заказа"); appendField(line,candidate,"order_number","номер",false);
            appendField(line,candidate,"total_kopecks","сумма",true);
            appendField(line,candidate,"status","статус",false);
            appendField(line,candidate,"started_at","начало",false);
            appendField(line,candidate,"completed_at","завершение",false);
        } else if("ORDER_LIST_ROW".equals(candidate.candidateType)) {
            line.append("Строка заказа"); appendField(line,candidate,"order_time","время",false);
            appendField(line,candidate,"amount_kopecks","сумма",true);
            appendField(line,candidate,"demand_coefficient","коэффициент",false);
        } else if("SLOT_DETAIL".equals(candidate.candidateType)) {
            line.append("Сводка слота"); appendField(line,candidate,"slot_total_kopecks","сумма слота",true);
            appendField(line,candidate,"slot_order_count","заказов указано в слоте",false);
            appendField(line,candidate,"distance_km","км",false);
            appendField(line,candidate,"slot_type","тип",false);
            appendField(line,candidate,"started_at","начало",false);
            appendField(line,candidate,"completed_at","завершение",false);
        } else if("INCOME_SUMMARY".equals(candidate.candidateType)) {
            line.append("Доход"); appendField(line,candidate,"total_kopecks","итого",true);
            appendField(line,candidate,"reward_kopecks","вознаграждение",true);
            appendField(line,candidate,"partner_commission_kopecks","комиссия",true);
            appendField(line,candidate,"tax_kopecks","налог",true);
        } else {
            line.append("Строка дохода"); appendField(line,candidate,"entry_time","время",false);
            appendField(line,candidate,"amount_kopecks","сумма",true);
        }
        return line.toString();
    }

    private void appendField(StringBuilder line,YandexScreenParser.Candidate candidate,String key,String label,boolean money) {
        for(YandexScreenParser.Field field:candidate.fields) if(key.equals(field.name)) {
            line.append(" · ").append(label).append(": ");
            if(money) {
                try { line.append(new BigDecimal(field.value).movePointLeft(2).stripTrailingZeros().toPlainString()).append(" ₽"); }
                catch(Exception ignored) { line.append(field.value).append(" коп."); }
            } else line.append(field.value);
            return;
        }
    }

    private void finishWith(String json,String message) {
        runOnUiThread(()->{
            if(launchedForResult) {
                new AlertDialog.Builder(this).setTitle("Результат импорта видео")
                    .setMessage(message)
                    .setPositiveButton("Готово",(dialog,which)->returnResult(json))
                    .setOnCancelListener(dialog->returnResult(json)).show();
            } else {
                new AlertDialog.Builder(this).setTitle("Импорт видео")
                    .setMessage(message+"\n\nНеизвестные экраны сохранены локально для следующего этапа проверки.")
                    .setPositiveButton("Закрыть",(dialog,which)->finish()).setOnCancelListener(dialog->finish()).show();
            }
        });
    }

    private void returnResult(String json) {
        Intent result=new Intent(); result.putExtra("m4.video.result",json); setResult(RESULT_OK,result); finish();
    }

    private void finishError(String message) {
        try { JSONObject response=new JSONObject();response.put("ok",false);response.put("error",message);finishWith(response.toString(),message); }
        catch(Exception ignored) { setResult(RESULT_CANCELED);finish(); }
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out); if(activeWorkId!=null) out.putString("m4.workId",activeWorkId.toString());
    }

    @Override protected void onDestroy() { executor.shutdown(); super.onDestroy(); }
}
