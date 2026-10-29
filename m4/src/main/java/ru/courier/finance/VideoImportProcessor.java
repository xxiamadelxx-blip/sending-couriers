package ru.courier.finance;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Extracts sparse frame evidence from a local MP4/MOV. It never writes order or payment facts. */
public final class VideoImportProcessor {
    public static final long MAX_VIDEO_BYTES = 2L * 1024L * 1024L * 1024L;
    public static final long MAX_DURATION_MS = 30L * 60L * 1000L;
    public static final int MAX_FRAMES = 300;
    private static final int MAX_BITMAP_SIDE = 960;
    private static final long MIN_SAMPLE_SPACING_MS = 1500L;

    public interface Ocr {
        TesseractOcrEngine.Recognition recognize(Bitmap bitmap) throws Exception;
    }
    public interface Progress {
        void onProgress(int completedFrames, int estimatedFrames);
    }

    public static final class Observation {
        public final int frameIndex;
        public final long timestampMs;
        public final String timestampBasis;
        public final String frameSha256;
        public final String ocrText;
        public final float ocrConfidence;
        public final YandexScreenParser.ScreenType screenType;
        public final String parseReason;
        public final boolean reviewRequired;
        public final String reviewImagePath;
        public final List<YandexScreenParser.Candidate> candidates;

        Observation(int frameIndex, long timestampMs, String frameSha256, String ocrText,
                    float ocrConfidence, YandexScreenParser.Result parsed, String reviewImagePath) {
            this.frameIndex=frameIndex; this.timestampMs=timestampMs; this.frameSha256=frameSha256;
            this.timestampBasis="requested_nearest_sync";
            this.ocrText=ocrText; this.ocrConfidence=ocrConfidence; this.screenType=parsed.screenType;
            this.parseReason=parsed.reason; this.reviewRequired=parsed.reviewRequired;
            this.reviewImagePath=reviewImagePath; this.candidates=parsed.candidates;
        }
    }

    public static final class Result {
        public final String sourceSha256;
        public final long byteSize;
        public final long durationMs;
        public final List<Observation> observations;
        public final int uniqueFramesOcr;

        Result(String sourceSha256, long byteSize, long durationMs, List<Observation> observations, int uniqueFramesOcr) {
            this.sourceSha256=sourceSha256; this.byteSize=byteSize; this.durationMs=durationMs;
            this.observations=observations; this.uniqueFramesOcr=uniqueFramesOcr;
        }
        public int unknownScreenCount() {
            int count=0; for(Observation row:observations) if(row.reviewRequired) count++; return count;
        }
        /** Deduplicates repeated OCR detections while retaining each frame's raw evidence rows. */
        public List<YandexScreenParser.Candidate> uniqueCandidates() {
            LinkedHashMap<String,YandexScreenParser.Candidate> unique=new LinkedHashMap<>();
            for(Observation observation:observations) for(YandexScreenParser.Candidate candidate:observation.candidates) {
                String key=candidate.mergeKey();
                YandexScreenParser.Candidate previous=unique.get(key);
                unique.put(key,previous==null?candidate:previous.mergeMissingFields(candidate));
            }
            return Collections.unmodifiableList(new ArrayList<>(unique.values()));
        }
        public int uniqueCandidateCount() { return uniqueCandidates().size(); }
        public int uniqueCandidateCount(String type) {
            int count=0;
            for(YandexScreenParser.Candidate candidate:uniqueCandidates())
                if(type.equals(candidate.candidateType)) count++;
            return count;
        }
    }

    private static final class CachedRecognition {
        final String text; final float confidence; final YandexScreenParser.Result parsed; final String reviewPath;
        CachedRecognition(String text,float confidence,YandexScreenParser.Result parsed,String reviewPath){
            this.text=text;this.confidence=confidence;this.parsed=parsed;this.reviewPath=reviewPath;
        }
    }

    private VideoImportProcessor() { }

    public static Result processFile(Context context, File video, String mimeType, String displayName,
                                     Ocr ocr, Progress progress) throws Exception {
        if (context==null || video==null || ocr==null || !video.isFile()) throw new IllegalArgumentException("Видео недоступно");
        long size=video.length();
        if(size<=0 || size>MAX_VIDEO_BYTES) throw new IllegalArgumentException("Размер видео должен быть от 1 байта до 2 ГБ");
        normalizedMime(mimeType,displayName);
        String sourceHash=sha256File(video);
        MediaMetadataRetriever retriever=new MediaMetadataRetriever();
        List<Observation> rows=new ArrayList<>();
        List<File> previewFiles=new ArrayList<>();
        Map<String,CachedRecognition> uniqueFrames=new HashMap<>();
        int ocrCount=0;
        boolean complete=false;
        try {
            retriever.setDataSource(video.getAbsolutePath());
            String rawDuration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            long duration=rawDuration==null?0:Long.parseLong(rawDuration);
            if(duration<=0 || duration>MAX_DURATION_MS) throw new IllegalArgumentException("Поддерживаются видео длительностью до 30 минут");
            long spacing=Math.max(MIN_SAMPLE_SPACING_MS,(duration+MAX_FRAMES-1)/MAX_FRAMES);
            int estimated=(int)Math.min(MAX_FRAMES,(duration+spacing-1)/spacing);
            int index=0;
            for(long timestamp=0;timestamp<duration && index<MAX_FRAMES;timestamp+=spacing,index++) {
                Bitmap original=retriever.getFrameAtTime(timestamp*1000L,MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if(original==null) continue;
                Bitmap frame=scale(original,MAX_BITMAP_SIDE);
                if(frame!=original) original.recycle();
                try {
                    String frameHash=sha256Bitmap(frame);
                    CachedRecognition cached=uniqueFrames.get(frameHash);
                    if(cached==null) {
                        TesseractOcrEngine.Recognition recognized=ocr.recognize(frame);
                        YandexScreenParser.Result parsed=YandexScreenParser.parse(recognized.text);
                        String reviewPath=parsed.reviewRequired?saveUnknownFrame(context,sourceHash,timestamp,frame):null;
                        if(reviewPath!=null) previewFiles.add(new File(context.getFilesDir(),reviewPath));
                        cached=new CachedRecognition(recognized.text,recognized.confidence,parsed,reviewPath);
                        uniqueFrames.put(frameHash,cached);
                        ocrCount++;
                    }
                    rows.add(new Observation(index,timestamp,frameHash,cached.text,cached.confidence,cached.parsed,cached.reviewPath));
                } finally { frame.recycle(); }
                if(progress!=null) progress.onProgress(index+1,estimated);
            }
            if(rows.isEmpty()) throw new IllegalArgumentException("Из видео не удалось извлечь кадры");
            Result result=new Result(sourceHash,size,duration,rows,ocrCount);
            complete=true;
            return result;
        } finally {
            retriever.release();
            if(!complete) for(File image:previewFiles) image.delete();
        }
    }

    public static String normalizedMime(String mimeType,String displayName) {
        String mime=mimeType==null?"":mimeType.toLowerCase(Locale.ROOT);
        String name=displayName==null?"":displayName.toLowerCase(Locale.ROOT);
        if("video/mp4".equals(mime) || name.endsWith(".mp4")) return "video/mp4";
        if("video/quicktime".equals(mime) || name.endsWith(".mov")) return "video/quicktime";
        throw new IllegalArgumentException("Выберите видео MP4 или MOV");
    }

    private static Bitmap scale(Bitmap bitmap,int maxSide) {
        int max=Math.max(bitmap.getWidth(),bitmap.getHeight());
        if(max<=maxSide) return bitmap;
        float ratio=maxSide/(float)max;
        return Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*ratio)),
            Math.max(1,Math.round(bitmap.getHeight()*ratio)),true);
    }

    private static String saveUnknownFrame(Context context,String videoHash,long timestamp,Bitmap bitmap) throws Exception {
        File directory=new File(context.getFilesDir(),"m4-review");
        if(!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot save unknown screen for review");
        String name="m4_"+videoHash.substring(0,16)+"_"+timestamp+".jpg";
        File target=new File(directory,name);
        try(FileOutputStream out=new FileOutputStream(target)) {
            if(!bitmap.compress(Bitmap.CompressFormat.JPEG,85,out)) throw new IllegalStateException("Frame image encoding failed");
            out.getFD().sync();
        }
        return "m4-review/"+name;
    }

    private static String sha256File(File file) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(java.io.FileInputStream input=new java.io.FileInputStream(file)) {
            byte[] buffer=new byte[64*1024]; int count;
            while((count=input.read(buffer))!=-1) digest.update(buffer,0,count);
        }
        return hex(digest.digest());
    }

    private static String sha256Bitmap(Bitmap bitmap) throws Exception {
        int[] pixels=new int[bitmap.getWidth()*bitmap.getHeight()];
        bitmap.getPixels(pixels,0,bitmap.getWidth(),0,0,bitmap.getWidth(),bitmap.getHeight());
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        ByteBuffer buffer=ByteBuffer.allocate(4*1024);
        for(int pixel:pixels) {
            if(buffer.remaining()<4) { digest.update(buffer.array(),0,buffer.position()); buffer.clear(); }
            buffer.putInt(pixel);
        }
        if(buffer.position()>0) digest.update(buffer.array(),0,buffer.position());
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder result=new StringBuilder(bytes.length*2);
        for(byte value:bytes) result.append(String.format(Locale.ROOT,"%02x",value&0xff));
        return result.toString();
    }
}
