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
import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started local MP4/MOV import. Shared videos and document-picker URIs follow the same path. */
public final class M4VideoImportActivity extends Activity {
    private static final int PICK_VIDEO=410;
    private static final int MAX_RETURNED_CANDIDATES=100;
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
                        (done,total)->runOnUiThread(()->{if(status!=null)status.setText("Кадров обработано: "+done+" из "+total+"…");}));
                }
                VideoImportDatabase.PersistResult saved=new VideoImportDatabase(this).persist(analysis,mime);
                JSONObject response=new JSONObject(); response.put("ok",true); response.put("duplicate",saved.duplicate);
                response.put("frames",saved.frameCount); response.put("uniqueFrames",analysis.uniqueFramesOcr);
                response.put("unknownScreens",saved.unknownScreenCount); response.put("durationMs",analysis.durationMs);
                response.put("persistedCandidateRows",saved.insertedCandidateCount);
                response.put("sourceSha256",analysis.sourceSha256);
                JSONArray extractions=new JSONArray();
                java.util.List<YandexScreenParser.Candidate> uniqueCandidates=analysis.uniqueCandidates();
                for(int i=0;i<uniqueCandidates.size()&&i<MAX_RETURNED_CANDIDATES;i++)
                    extractions.put(new JSONObject(uniqueCandidates.get(i).toJson()));
                response.put("extractedCandidateCount",analysis.uniqueCandidateCount());
                response.put("extractionsTruncated",uniqueCandidates.size()>MAX_RETURNED_CANDIDATES);
                response.put("extractions",extractions);
                String message=saved.duplicate
                    ?"Видео уже импортировалось. Ниже показан повторный анализ новой версии парсера; ранее сохранённые результаты не перезаписаны.\n\n"+extractionSummary(analysis,false)
                    :extractionSummary(analysis,true);
                finishWith(response.toString(),message);
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
        if(candidatesSaved)
            summary.append("\n\nКандидаты сохранены локально для проверки; факты в историю заказов и доходов не записаны.");
        else summary.append("\n\nКандидаты повторного анализа показаны только здесь; ранее сохранённые результаты не перезаписаны.");
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

    @Override protected void onDestroy() { executor.shutdownNow(); super.onDestroy(); }
}
