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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Extracts sparse frame evidence from a local MP4/MOV. It never writes order or payment facts. */
public final class VideoImportProcessor {
    public static final long MAX_VIDEO_BYTES = 2L * 1024L * 1024L * 1024L;
    public static final long MAX_DURATION_MS = 30L * 60L * 1000L;
    public static final int MAX_FRAMES = 320;
    // Preserve the source phone resolution so the bundled OCR can read the small order-list text.
    private static final int MAX_BITMAP_SIDE = 1608;
    // A 1.5 s cadence captures scrolling list rows while avoiding OCR on near-identical
    // adjacent positions. Identical decoded frames are still OCR'd only once.
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
        public final String frameSelectionMethod;
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
            this.timestampBasis="requested_nearest_sync"; // retained for v1/v2 database compatibility
            this.frameSelectionMethod="closest_frame";
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
        private static final class SupportedCandidate {
            YandexScreenParser.Candidate candidate;
            int frames;
            final Set<String> frameHashes=new HashSet<>();
            final Map<String,Integer> amountVotes=new HashMap<>();
            SupportedCandidate(YandexScreenParser.Candidate candidate,String frameHash) {
                this.candidate=candidate; frameHashes.add(frameHash); frames=1; recordAmount(candidate);
            }
            void add(YandexScreenParser.Candidate next,String frameHash) {
                if(!frameHashes.add(frameHash)) return;
                candidate=candidate.mergeMissingFields(next); frames++; recordAmount(next);
            }
            private void recordAmount(YandexScreenParser.Candidate value) {
                for(YandexScreenParser.Field field:value.fields) if("amount_kopecks".equals(field.name))
                    amountVotes.put(field.value,amountVotes.containsKey(field.value)?amountVotes.get(field.value)+1:1);
            }
            void resolveAmountConsensus() {
                if(amountVotes.size()<2) return;
                String winner=null; int best=0,ties=0;
                for(Map.Entry<String,Integer> vote:amountVotes.entrySet()) {
                    if(vote.getValue()>best) { winner=vote.getKey(); best=vote.getValue(); ties=1; }
                    else if(vote.getValue()==best) ties++;
                }
                if(ties!=1) return;
                List<YandexScreenParser.Field> fields=new ArrayList<>();
                for(YandexScreenParser.Field field:candidate.fields) fields.add(
                    "amount_kopecks".equals(field.name)?new YandexScreenParser.Field(field.name,field.valueType,winner):field);
                candidate=new YandexScreenParser.Candidate(candidate.candidateType,candidate.ruleScore,fields);
            }
        }

        /**
         * Deduplicates repeated OCR detections, keeping raw per-frame observations intact.
         * Scrolling order lists are chronological; a one-frame time reversal and a
         * low-support near-duplicate are treated as OCR variants, never as new orders.
         */
        public List<YandexScreenParser.Candidate> uniqueCandidates() {
            Set<String> observedSlotIds=new HashSet<>();
            for(Observation observation:observations) for(YandexScreenParser.Candidate candidate:observation.candidates)
                if("SLOT_DETAIL".equals(candidate.candidateType)) {
                    String id=value(candidate,"slot_id"); if(id!=null) observedSlotIds.add(id);
                }
            String slotHint=observedSlotIds.size()==1?observedSlotIds.iterator().next():null;

            LinkedHashMap<String,SupportedCandidate> unique=new LinkedHashMap<>();
            for(Observation observation:observations) for(YandexScreenParser.Candidate candidate:observation.candidates) {
                String key=mergeKey(candidate,slotHint);
                String frameHash=observation.frameSha256==null?"frame-index:"+observation.frameIndex:observation.frameSha256;
                SupportedCandidate previous=unique.get(key);
                if(previous==null) unique.put(key,new SupportedCandidate(candidate,frameHash));
                else previous.add(candidate,frameHash);
            }
            for(SupportedCandidate supported:unique.values()) supported.resolveAmountConsensus();

            Set<String> slotIds=new HashSet<>();
            YandexScreenParser.Candidate slot=null;
            for(SupportedCandidate supported:unique.values()) if("SLOT_DETAIL".equals(supported.candidate.candidateType)) {
                String id=value(supported.candidate,"slot_id");
                if(id!=null) { slotIds.add(id); slot=supported.candidate; }
            }
            String singleSlot=slotIds.size()==1?slotIds.iterator().next():null;
            int slotStart=singleSlot==null?-1:minuteOfDateTime(value(slot,"started_at"));
            int slotEnd=singleSlot==null?-1:minuteOfDateTime(value(slot,"completed_at"));
            boolean hasSlotRange=slotStart>=0&&slotEnd>slotStart;

            // A single OCR frame can turn 11:57 into 14:57. Do not let that
            // weak local peak make a real, twice-seen following row look like
            // the reversal; leave the suspect for the slot count/total check.
            Set<String> oneFrameSequenceOutliers=new HashSet<>();
            for(Map.Entry<String,SupportedCandidate> entry:unique.entrySet())
                if("ORDER_LIST_ROW".equals(entry.getValue().candidate.candidateType)
                        &&entry.getValue().frames==1
                        &&isOneFrameTimeReversal(entry.getValue().candidate,singleSlot,unique))
                    oneFrameSequenceOutliers.add(entry.getKey());

            int forward=0,backward=0;
            for(Observation observation:observations) {
                int previous=-1;
                for(YandexScreenParser.Candidate candidate:observation.candidates) {
                    if(!eligibleRow(candidate,singleSlot,slotStart,slotEnd,hasSlotRange)) continue;
                    if(oneFrameSequenceOutliers.contains(mergeKey(candidate,slotHint))) continue;
                    int minute=orderMinute(candidate);
                    if(previous>=0) {
                        int delta=minute-previous;
                        if(delta>5) forward++; else if(delta< -5) backward++;
                    }
                    previous=minute;
                }
            }
            boolean ascending=hasSlotRange&&forward>=2&&forward>=backward*2;
            boolean descending=hasSlotRange&&backward>=2&&backward>=forward*2;

            Set<String> discard=new HashSet<>();
            if(ascending||descending) for(Observation observation:observations) {
                int extreme=-1;
                for(YandexScreenParser.Candidate candidate:observation.candidates) {
                    if(!eligibleRow(candidate,singleSlot,slotStart,slotEnd,hasSlotRange)) continue;
                    int minute=orderMinute(candidate);
                    String key=mergeKey(candidate,slotHint);
                    if(oneFrameSequenceOutliers.contains(key)) continue;
                    SupportedCandidate supported=unique.get(key);
                    if(extreme>=0 && supported!=null && supported.frames<=2
                            && (ascending?minute<extreme-5:minute>extreme+5)) {
                        discard.add(key);
                        continue;
                    }
                    extreme=extreme<0?minute:(ascending?Math.max(extreme,minute):Math.min(extreme,minute));
                }
            }

            // A single blurry frame can shift an order time by one or two minutes.
            // Collapse that reading only when the same amount and occurrence have
            // substantially stronger support at the neighboring time. Two real
            // orders with close times remain separate when both are observed.
            List<Map.Entry<String,SupportedCandidate>> rows=new ArrayList<>();
            Map<String,Set<String>> coObserved=new HashMap<>();
            for(Observation observation:observations) {
                Set<String> frameRows=new HashSet<>();
                for(YandexScreenParser.Candidate candidate:observation.candidates)
                    if(eligibleRow(candidate,singleSlot,slotStart,slotEnd,hasSlotRange))
                        frameRows.add(mergeKey(candidate,slotHint));
                for(String a:frameRows) for(String b:frameRows) if(!a.equals(b))
                    coObserved.computeIfAbsent(a,k->new HashSet<>()).add(b);
            }
            for(Map.Entry<String,SupportedCandidate> entry:unique.entrySet())
                if("ORDER_LIST_ROW".equals(entry.getValue().candidate.candidateType)
                        &&!discard.contains(entry.getKey())
                        &&eligibleRow(entry.getValue().candidate,singleSlot,slotStart,slotEnd,hasSlotRange)) rows.add(entry);
            for(int i=0;i<rows.size();i++) for(int j=i+1;j<rows.size();j++) {
                Map.Entry<String,SupportedCandidate> a=rows.get(i),b=rows.get(j);
                YandexScreenParser.Candidate ca=a.getValue().candidate,cb=b.getValue().candidate;
                if(!same(value(ca,"slot_id"),value(cb,"slot_id"))) continue;
                if(!same(value(ca,"occurrence"),value(cb,"occurrence"))) continue;
                if(!same(value(ca,"amount_kopecks"),value(cb,"amount_kopecks"))) continue;
                int delta=Math.abs(orderMinute(ca)-orderMinute(cb));
                if(delta==0||delta>2) continue;
                if(coObserved.getOrDefault(a.getKey(),Collections.<String>emptySet()).contains(b.getKey())) continue;
                SupportedCandidate low=a.getValue().frames<=b.getValue().frames?a.getValue():b.getValue();
                SupportedCandidate high=low==a.getValue()?b.getValue():a.getValue();
                String lowKey=low==a.getValue()?a.getKey():b.getKey();
                if(low.frames<=2&&high.frames>=4&&high.frames>=low.frames*3) discard.add(lowKey);
            }

            List<YandexScreenParser.Candidate> result=new ArrayList<>();
            for(Map.Entry<String,SupportedCandidate> entry:unique.entrySet()) {
                YandexScreenParser.Candidate candidate=entry.getValue().candidate;
                if(discard.contains(entry.getKey())) continue;
                if("ORDER_LIST_ROW".equals(candidate.candidateType)
                        &&!eligibleRow(candidate,singleSlot,slotStart,slotEnd,hasSlotRange)) continue;
                result.add(candidate);
            }
            reconcileSingleWeakOrderOutlier(result,unique);
            return Collections.unmodifiableList(result);
        }

        /**
         * A one-frame OCR variant may add a false row even when all other rows
         * are stable. Drop it only when the other rows independently repeat and
         * removing exactly that candidate makes both the slot count and total match.
         */
        private void reconcileSingleWeakOrderOutlier(List<YandexScreenParser.Candidate> candidates,
                                                       Map<String,SupportedCandidate> evidence) {
            YandexScreenParser.Candidate slot=null;
            Set<String> slotIds=new HashSet<>();
            for(SupportedCandidate supported:evidence.values()) {
                YandexScreenParser.Candidate candidate=supported.candidate;
                if(!"SLOT_DETAIL".equals(candidate.candidateType)||value(candidate,"slot_id")==null) continue;
                slotIds.add(value(candidate,"slot_id")); slot=candidate;
            }
            if(slotIds.size()!=1||slot==null) return;
            Integer declared=parseInteger(value(slot,"slot_order_count"));
            Long total=parseLong(value(slot,"slot_total_kopecks"));
            if(declared==null||declared<1||total==null||total<0) return;

            List<YandexScreenParser.Candidate> rows=new ArrayList<>();
            long sum=0;
            for(YandexScreenParser.Candidate candidate:candidates) if("ORDER_LIST_ROW".equals(candidate.candidateType)) {
                Long amount=parseLong(value(candidate,"amount_kopecks"));
                if(amount==null||amount<0) return;
                rows.add(candidate); sum+=amount;
            }
            if(rows.size()!=declared+1) return;

            YandexScreenParser.Candidate removable=null;int matches=0;
            for(int i=0;i<rows.size();i++) {
                YandexScreenParser.Candidate row=rows.get(i);
                SupportedCandidate support=null;
                for(SupportedCandidate possible:evidence.values()) if(possible.candidate==row) { support=possible; break; }
                if(support==null||support.frames>1) continue;
                boolean allOtherRowsRepeat=true,allOtherRowsSeenTwice=true;
                long amount=parseLong(value(row,"amount_kopecks"));
                for(int j=0;j<rows.size();j++) if(j!=i) {
                    YandexScreenParser.Candidate other=rows.get(j); SupportedCandidate otherSupport=null;
                    for(SupportedCandidate possible:evidence.values()) if(possible.candidate==other) { otherSupport=possible; break; }
                    if(otherSupport==null||otherSupport.frames<3) allOtherRowsRepeat=false;
                    if(otherSupport==null||otherSupport.frames<2) { allOtherRowsSeenTwice=false; break; }
                }
                if((allOtherRowsRepeat||allOtherRowsSeenTwice&&isOneFrameTimeReversal(row,value(slot,"slot_id"),evidence))
                        &&rows.size()-1==declared&&sum-amount==total) { removable=row; matches++; }
            }
            if(matches==1) candidates.remove(removable);
        }

        private boolean isOneFrameTimeReversal(YandexScreenParser.Candidate row,String slotId,
                                               Map<String,SupportedCandidate> evidence) {
            String key=mergeKey(row,slotId);
            int minute=orderMinute(row);
            for(Observation observation:observations) {
                List<YandexScreenParser.Candidate> frameRows=new ArrayList<>();
                for(YandexScreenParser.Candidate candidate:observation.candidates)
                    if("ORDER_LIST_ROW".equals(candidate.candidateType)&&orderMinute(candidate)>=0)
                        frameRows.add(candidate);
                for(int i=1;i+1<frameRows.size();i++) {
                    if(!key.equals(mergeKey(frameRows.get(i),slotId))) continue;
                    YandexScreenParser.Candidate before=frameRows.get(i-1),after=frameRows.get(i+1);
                    SupportedCandidate beforeSupport=evidence.get(mergeKey(before,slotId));
                    SupportedCandidate afterSupport=evidence.get(mergeKey(after,slotId));
                    if(beforeSupport==null||beforeSupport.frames<2||afterSupport==null||afterSupport.frames<2) continue;
                    int left=orderMinute(before),right=orderMinute(after);
                    if(left<minute-5&&right<minute-5 || left>minute+5&&right>minute+5) return true;
                }
            }
            return false;
        }

        private static Integer parseInteger(String value) {
            try { return value==null?null:Integer.valueOf(value); } catch(Exception invalid) { return null; }
        }
        private static Long parseLong(String value) {
            try { return value==null?null:Long.valueOf(value); } catch(Exception invalid) { return null; }
        }

        private static boolean eligibleRow(YandexScreenParser.Candidate candidate,String slotId,
                                           int start,int end,boolean hasRange) {
            if(!"ORDER_LIST_ROW".equals(candidate.candidateType)) return false;
            String rowSlot=value(candidate,"slot_id");
            if(slotId!=null&&rowSlot!=null&&!slotId.equals(rowSlot)) return false;
            int minute=orderMinute(candidate);
            return minute>=0&&(!hasRange||minute>=start&&minute<=end);
        }
        private static String mergeKey(YandexScreenParser.Candidate candidate,String slotHint) {
            if("ORDER_LIST_ROW".equals(candidate.candidateType)&&slotHint!=null
                    &&value(candidate,"slot_id")==null) {
                String occurrence=value(candidate,"occurrence");
                return "ORDER_LIST_ROW\n"+slotHint+"\n"+value(candidate,"order_time")+"\n"
                    +(occurrence==null?"1":occurrence);
            }
            return candidate.mergeKey();
        }
        private static int orderMinute(YandexScreenParser.Candidate candidate) {
            String time=value(candidate,"order_time");
            if(time==null||!time.matches("\\d{2}:\\d{2}")) return -1;
            try { int hour=Integer.parseInt(time.substring(0,2)),minute=Integer.parseInt(time.substring(3,5));
                return hour<24&&minute<60?hour*60+minute:-1;
            } catch(Exception ignored) { return -1; }
        }
        private static int minuteOfDateTime(String value) {
            if(value==null||value.length()<16||value.charAt(10)!='T') return -1;
            try { int hour=Integer.parseInt(value.substring(11,13)),minute=Integer.parseInt(value.substring(14,16));
                return hour<24&&minute<60?hour*60+minute:-1;
            } catch(Exception ignored) { return -1; }
        }
        private static String value(YandexScreenParser.Candidate candidate,String name) {
            if(candidate==null) return null;
            for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
            return null;
        }
        private static boolean same(String a,String b) { return a==null?b==null:a.equals(b); }
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
                Bitmap original=retriever.getFrameAtTime(timestamp*1000L,MediaMetadataRetriever.OPTION_CLOSEST);
                if(original==null) continue;
                Bitmap frame=scale(original,MAX_BITMAP_SIDE);
                if(frame!=original) original.recycle();
                try {
                    String frameHash=sha256Bitmap(frame);
                    CachedRecognition cached=uniqueFrames.get(frameHash);
                    if(cached==null) {
                        TesseractOcrEngine.Recognition recognized=ocr.recognize(frame);
                        YandexScreenParser.Result parsed=YandexScreenParser.parse(recognized.text,recognized.hocrText);
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
        Bitmap source=bitmap;
        if(bitmap.getConfig()!=Bitmap.Config.ARGB_8888) {
            source=bitmap.copy(Bitmap.Config.ARGB_8888,false);
            if(source==null) throw new IllegalStateException("Video frame could not be converted to ARGB_8888");
        }
        int max=Math.max(source.getWidth(),source.getHeight());
        if(max<=maxSide) return source;
        float ratio=maxSide/(float)max;
        Bitmap scaled=Bitmap.createScaledBitmap(source,Math.max(1,Math.round(source.getWidth()*ratio)),
            Math.max(1,Math.round(source.getHeight()*ratio)),true);
        if(source!=bitmap) source.recycle();
        return scaled;
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
