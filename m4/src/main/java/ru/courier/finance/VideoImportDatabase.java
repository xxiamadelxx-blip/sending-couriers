package ru.courier.finance;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteException;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Private local database for OCR evidence; it never writes finance or order facts. */
public final class VideoImportDatabase extends SQLiteOpenHelper {
    public static final String FILE_NAME="courier_video_imports_v1.db";
    public static final int VERSION=3;
    private final Context app;

    public VideoImportDatabase(Context context) {
        super(context.getApplicationContext(),FILE_NAME,null,VERSION);
        app=context.getApplicationContext();
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        try(InputStream input=app.getAssets().open("www/m4_schema_v3.sql");ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096];int count;
            while((count=input.read(buffer))!=-1) {output.write(buffer,0,count);if(output.size()>64_000)throw new SQLiteException("M4 schema too large");}
            String script=new String(output.toByteArray(),StandardCharsets.UTF_8).replaceAll("(?m)^\\s*--[^\\r\\n]*","");
            for(String statement:script.split(";\\s*(?=CREATE)")) if(!statement.trim().isEmpty()) db.execSQL(statement.trim());
        } catch(Exception error) { throw new SQLiteException("Failed to create local video evidence database: "+error.getClass().getSimpleName()); }
    }

    @Override public void onUpgrade(SQLiteDatabase db,int from,int to) {
        if(from<1||to!=3||from>3) throw new SQLiteException("Unreviewed video evidence migration from "+from+" to "+to);
        if(from==1) { executeAssetScript(db,"www/m4_migration_v1_to_v2.sql"); from=2; }
        if(from==2) executeAssetScript(db,"www/m4_migration_v2_to_v3.sql");
    }

    private void executeAssetScript(SQLiteDatabase db,String asset) {
        try(InputStream input=app.getAssets().open(asset);ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096];int count;
            while((count=input.read(buffer))!=-1) {output.write(buffer,0,count);if(output.size()>64_000)throw new SQLiteException("M4 migration too large");}
            String script=new String(output.toByteArray(),StandardCharsets.UTF_8).replaceAll("(?m)^\\s*--[^\\r\\n]*","");
            for(String statement:script.split(";\\s*(?=CREATE)")) if(!statement.trim().isEmpty()) db.execSQL(statement.trim());
        } catch(Exception error) { throw new SQLiteException("Failed to upgrade local video evidence database: "+error.getClass().getSimpleName()); }
    }

    public PersistResult persist(VideoImportProcessor.Result result,String mimeType) {
        SQLiteDatabase db=getWritableDatabase();
        String importId="m4v_"+result.sourceSha256.substring(0,32);
        boolean duplicate=false;
        int insertedCandidates=0;
        db.beginTransaction();
        try {
            try(Cursor found=db.query("m4_video_imports",new String[]{"id"},"source_sha256=?",new String[]{result.sourceSha256},null,null,null)) {
                if(found.moveToFirst()) duplicate=true;
            }
            if(!duplicate) {
                String now=nowUtc();
                ContentValues video=new ContentValues();
                video.put("id",importId); video.put("source_sha256",result.sourceSha256);
                video.put("mime_type",mimeType); video.put("byte_size",result.byteSize); video.put("duration_ms",result.durationMs);
                video.put("parser_version",YandexScreenParser.VERSION); video.put("ocr_engine_version",TesseractOcrEngine.VERSION);
                video.put("created_at_utc",now);
                db.insertOrThrow("m4_video_imports",null,video);
                for(VideoImportProcessor.Observation row:result.observations) {
                    String observationId=importId+"_"+row.frameIndex;
                    ContentValues observation=new ContentValues();
                    observation.put("id",observationId); observation.put("import_id",importId); observation.put("frame_index",row.frameIndex);
                    observation.put("timestamp_ms",row.timestampMs); observation.put("timestamp_basis",row.timestampBasis);
                    observation.put("frame_selection_method",row.frameSelectionMethod);
                    observation.put("frame_sha256",row.frameSha256);
                    observation.put("screen_type",row.screenType.name()); observation.put("parse_reason",row.parseReason);
                    observation.put("ocr_text",row.ocrText); observation.put("ocr_confidence",row.ocrConfidence);
                    observation.put("parser_version",YandexScreenParser.VERSION); observation.put("created_at_utc",now);
                    db.insertOrThrow("m4_screen_observations",null,observation);
                    if(row.reviewRequired && row.reviewImagePath!=null) {
                        ContentValues queue=new ContentValues(); queue.put("id","m4u_"+importId.substring(4)+"_"+row.frameIndex);
                        queue.put("observation_id",observationId); queue.put("screenshot_path",row.reviewImagePath);
                        queue.put("review_status","pending"); queue.put("created_at_utc",now); queue.put("updated_at_utc",now);
                        db.insertOrThrow("m4_unknown_screen_queue",null,queue);
                    }
                    for(int candidateIndex=0;candidateIndex<row.candidates.size();candidateIndex++) {
                        YandexScreenParser.Candidate candidate=row.candidates.get(candidateIndex);
                        ContentValues extracted=new ContentValues();
                        extracted.put("id",observationId+"_c"+candidateIndex);
                        extracted.put("observation_id",observationId);
                        extracted.put("candidate_type",candidate.candidateType);
                        extracted.put("candidate_json",candidate.toJson());
                        extracted.put("rule_score",candidate.ruleScore);
                        extracted.put("review_status","pending");
                        extracted.put("created_at_utc",now);
                        db.insertOrThrow("m4_extracted_candidates",null,extracted);
                        insertedCandidates++;
                    }
                }
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return new PersistResult(importId,duplicate,result.observations.size(),result.unknownScreenCount(),insertedCandidates);
    }

    /** Deletes only locally extracted evidence and its private preview files. */
    public boolean deleteImport(String importId) {
        if(importId==null || !importId.matches("m4v_[0-9a-f]{32}")) return false;
        SQLiteDatabase db=getWritableDatabase();
        List<String> paths=new ArrayList<>();
        try(Cursor cursor=db.rawQuery("SELECT q.screenshot_path FROM m4_unknown_screen_queue q "
            +"JOIN m4_screen_observations o ON o.id=q.observation_id WHERE o.import_id=?",new String[]{importId})) {
            while(cursor.moveToNext()) paths.add(cursor.getString(0));
        }
        db.beginTransaction();
        int removed;
        try {
            removed=db.delete("m4_video_imports","id=?",new String[]{importId});
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        if(removed==0) return false;
        File reviewRoot=new File(app.getFilesDir(),"m4-review");
        for(String path:paths) {
            if(path==null || !path.matches("m4-review/m4_[0-9a-f]{16}_[0-9]+\\.jpg")) continue;
            File image=new File(app.getFilesDir(),path);
            try { if(image.getCanonicalPath().startsWith(reviewRoot.getCanonicalPath()+File.separator)) image.delete(); }
            catch(Exception ignored) { }
        }
        return true;
    }

    private static String nowUtc() {
        SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date());
    }

    public static final class PersistResult {
        public final String importId; public final boolean duplicate; public final int frameCount; public final int unknownScreenCount;
        public final int insertedCandidateCount;
        PersistResult(String importId,boolean duplicate,int frameCount,int unknownScreenCount,int insertedCandidateCount) {
            this.importId=importId;this.duplicate=duplicate;this.frameCount=frameCount;
            this.unknownScreenCount=unknownScreenCount;this.insertedCandidateCount=insertedCandidateCount;
        }
    }
}
