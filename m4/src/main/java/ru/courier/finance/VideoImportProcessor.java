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
    public static final int MAX_FRAMES = 600;
    // Preserve the source phone resolution so the bundled OCR can read the small order-list text.
    private static final int MAX_BITMAP_SIDE = 1608;
    // Short clips are sampled every 250 ms so briefly opened order cards are
    // still likely to appear in the OCR evidence. Long clips remain bounded.
    private static final long MIN_SAMPLE_SPACING_MS = 250L;

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
        /** Original MP4 creation-time metadata, retained for date resolution only. */
        public final String recordingDateMetadata;
        /** User-confirmed report date for live capture when a slot card omits its date. */
        public final String confirmedReportDate;

        Result(String sourceSha256, long byteSize, long durationMs, List<Observation> observations, int uniqueFramesOcr) {
            this(sourceSha256,byteSize,durationMs,observations,uniqueFramesOcr,null,null);
        }
        Result(String sourceSha256, long byteSize, long durationMs, List<Observation> observations,
               int uniqueFramesOcr,String recordingDateMetadata) {
            this(sourceSha256,byteSize,durationMs,observations,uniqueFramesOcr,recordingDateMetadata,null);
        }
        Result(String sourceSha256, long byteSize, long durationMs, List<Observation> observations,
               int uniqueFramesOcr,String recordingDateMetadata,String confirmedReportDate) {
            this.sourceSha256=sourceSha256; this.byteSize=byteSize; this.durationMs=durationMs;
            this.observations=observations; this.uniqueFramesOcr=uniqueFramesOcr;
            this.recordingDateMetadata=recordingDateMetadata;
            this.confirmedReportDate=confirmedReportDate;
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
            Map<String,YandexScreenParser.Candidate> slotCards=new LinkedHashMap<>();
            for(Observation observation:observations) for(YandexScreenParser.Candidate candidate:observation.candidates)
                if("SLOT_DETAIL".equals(candidate.candidateType)) {
                    String id=value(candidate,"slot_id"); if(id==null) continue;
                    YandexScreenParser.Candidate prior=slotCards.get(id);
                    slotCards.put(id,prior==null?candidate:prior.mergeMissingFields(candidate));
                }

            // Keep the active slot as the recording moves between cards. Some
            // list frames omit the ID even though the video is still showing
            // the same slot; a visible time range takes precedence when it
            // uniquely identifies a different slot.
            String activeSlotId=null;
            Map<Integer,List<YandexScreenParser.Candidate>> frameCandidates=new HashMap<>();
            LinkedHashMap<String,SupportedCandidate> unique=new LinkedHashMap<>();
            for(Observation observation:observations) {
                Set<String> frameSlotIds=new HashSet<>();
                for(YandexScreenParser.Candidate candidate:observation.candidates)
                    if("SLOT_DETAIL".equals(candidate.candidateType)&&value(candidate,"slot_id")!=null)
                        frameSlotIds.add(value(candidate,"slot_id"));
                if(frameSlotIds.size()==1) activeSlotId=frameSlotIds.iterator().next();

                String frameHash=observation.frameSha256==null?"frame-index:"+observation.frameIndex:observation.frameSha256;
                List<YandexScreenParser.Candidate> normalized=new ArrayList<>();
                for(YandexScreenParser.Candidate candidate:observation.candidates) {
                    YandexScreenParser.Candidate associated=candidate;
                    if("ORDER_LIST_ROW".equals(candidate.candidateType)) {
                        String rowSlot=value(candidate,"slot_id");
                        if(rowSlot!=null) activeSlotId=rowSlot;
                        else {
                            int minute=orderMinute(candidate);
                            String inferred=slotForTime(slotCards,minute);
                            String context=frameSlotIds.size()==1?frameSlotIds.iterator().next():activeSlotId;
                            if(inferred!=null) rowSlot=inferred;
                            else if(context!=null&&slotMatchesTime(slotCards.get(context),minute)) rowSlot=context;
                            else if(slotCards.size()==1) rowSlot=slotCards.keySet().iterator().next();
                        }
                        if(rowSlot!=null) associated=withSlotId(candidate,rowSlot);
                    }
                    normalized.add(associated);
                    String key=associated.mergeKey();
                    SupportedCandidate previous=unique.get(key);
                    if(previous==null) unique.put(key,new SupportedCandidate(associated,frameHash));
                    else previous.add(associated,frameHash);
                }
                frameCandidates.put(observation.frameIndex,normalized);
            }
            for(SupportedCandidate supported:unique.values()) supported.resolveAmountConsensus();

            // A single OCR frame can turn 11:57 into 14:57. Do not let that
            // weak local peak make a real, twice-seen following row look like
            // the reversal; leave the suspect for the slot count/total check.
            Set<String> oneFrameSequenceOutliers=new HashSet<>();
            for(Map.Entry<String,SupportedCandidate> entry:unique.entrySet())
                if("ORDER_LIST_ROW".equals(entry.getValue().candidate.candidateType)
                        &&entry.getValue().frames==1
                        &&isOneFrameTimeReversal(entry.getValue().candidate,unique,frameCandidates))
                    oneFrameSequenceOutliers.add(entry.getKey());

            Map<String,int[]> directionVotes=new HashMap<>();
            for(Observation observation:observations) {
                Map<String,Integer> previousBySlot=new HashMap<>();
                for(YandexScreenParser.Candidate candidate:frameCandidates.get(observation.frameIndex)) {
                    if(!eligibleRow(candidate,slotCards)) continue;
                    String slotId=value(candidate,"slot_id"); if(slotId==null) continue;
                    if(oneFrameSequenceOutliers.contains(candidate.mergeKey())) continue;
                    int minute=orderMinute(candidate);
                    Integer previous=previousBySlot.put(slotId,minute);
                    if(previous!=null) {
                        int delta=minute-previous.intValue();
                        int[] votes=directionVotes.computeIfAbsent(slotId,k->new int[2]);
                        if(delta>5) votes[0]++; else if(delta< -5) votes[1]++;
                    }
                }
            }
            Set<String> ascendingSlots=new HashSet<>(),descendingSlots=new HashSet<>();
            for(Map.Entry<String,int[]> entry:directionVotes.entrySet()) {
                YandexScreenParser.Candidate slot=slotCards.get(entry.getKey());
                int start=slotStart(slot),end=slotEnd(slot);
                if(start<0||end<=start) continue;
                int forward=entry.getValue()[0],backward=entry.getValue()[1];
                if(forward>=2&&forward>=backward*2) ascendingSlots.add(entry.getKey());
                if(backward>=2&&backward>=forward*2) descendingSlots.add(entry.getKey());
            }

            Set<String> discard=new HashSet<>();
            if(!ascendingSlots.isEmpty()||!descendingSlots.isEmpty()) for(Observation observation:observations) {
                Map<String,Integer> extremeBySlot=new HashMap<>();
                for(YandexScreenParser.Candidate candidate:frameCandidates.get(observation.frameIndex)) {
                    if(!eligibleRow(candidate,slotCards)) continue;
                    String slotId=value(candidate,"slot_id"); if(slotId==null) continue;
                    boolean ascending=ascendingSlots.contains(slotId),descending=descendingSlots.contains(slotId);
                    if(!ascending&&!descending) continue;
                    int minute=orderMinute(candidate);
                    String key=candidate.mergeKey();
                    if(oneFrameSequenceOutliers.contains(key)) continue;
                    SupportedCandidate supported=unique.get(key);
                    Integer extreme=extremeBySlot.get(slotId);
                    if(extreme!=null && supported!=null && supported.frames<=2
                            && (ascending?minute<extreme.intValue()-5:minute>extreme.intValue()+5)) {
                        discard.add(key);
                        continue;
                    }
                    extremeBySlot.put(slotId,extreme==null?minute:(ascending
                        ?Math.max(extreme.intValue(),minute):Math.min(extreme.intValue(),minute)));
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
                for(YandexScreenParser.Candidate candidate:frameCandidates.get(observation.frameIndex))
                    if(eligibleRow(candidate,slotCards)) frameRows.add(candidate.mergeKey());
                for(String a:frameRows) for(String b:frameRows) if(!a.equals(b))
                    coObserved.computeIfAbsent(a,k->new HashSet<>()).add(b);
            }
            for(Map.Entry<String,SupportedCandidate> entry:unique.entrySet())
                if("ORDER_LIST_ROW".equals(entry.getValue().candidate.candidateType)
                        &&!discard.contains(entry.getKey())
                        &&eligibleRow(entry.getValue().candidate,slotCards)) rows.add(entry);
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
                        &&!eligibleRow(candidate,slotCards)) continue;
                result.add(candidate);
            }
            reconcileWeakOrderOutliers(result,unique,frameCandidates,slotCards);
            return Collections.unmodifiableList(result);
        }

        /**
         * A one-frame OCR variant may add a false row even when all other rows
         * are stable. Drop it only when the other rows independently repeat and
         * removing exactly that candidate makes both the slot count and total match.
         */
        private void reconcileWeakOrderOutliers(List<YandexScreenParser.Candidate> candidates,
                Map<String,SupportedCandidate> evidence,Map<Integer,List<YandexScreenParser.Candidate>> frames,
                Map<String,YandexScreenParser.Candidate> slots) {
            for(Map.Entry<String,YandexScreenParser.Candidate> slotEntry:slots.entrySet()) {
                String slotId=slotEntry.getKey(); YandexScreenParser.Candidate slot=slotEntry.getValue();
                Integer declared=parseInteger(value(slot,"slot_order_count"));
                Long total=parseLong(value(slot,"slot_total_kopecks"));
                if(declared==null||declared<1||total==null||total<0) continue;
                List<YandexScreenParser.Candidate> rows=new ArrayList<>(); long sum=0; boolean valid=true;
                for(YandexScreenParser.Candidate candidate:candidates)
                    if("ORDER_LIST_ROW".equals(candidate.candidateType)&&slotId.equals(value(candidate,"slot_id"))) {
                        Long amount=parseLong(value(candidate,"amount_kopecks"));
                        if(amount==null||amount<0) { valid=false; break; }
                        rows.add(candidate); sum+=amount;
                    }
                if(!valid||rows.size()!=declared+1) continue;

                YandexScreenParser.Candidate removable=null;int matches=0;
                for(int i=0;i<rows.size();i++) {
                    YandexScreenParser.Candidate row=rows.get(i);
                    SupportedCandidate support=evidence.get(row.mergeKey());
                    if(support==null||support.frames>1) continue;
                    boolean allOtherRowsRepeat=true,allOtherRowsSeenTwice=true;
                    long amount=parseLong(value(row,"amount_kopecks"));
                    for(int j=0;j<rows.size();j++) if(j!=i) {
                        SupportedCandidate otherSupport=evidence.get(rows.get(j).mergeKey());
                        if(otherSupport==null||otherSupport.frames<3) allOtherRowsRepeat=false;
                        if(otherSupport==null||otherSupport.frames<2) { allOtherRowsSeenTwice=false; break; }
                    }
                    if((allOtherRowsRepeat||allOtherRowsSeenTwice
                            &&isOneFrameTimeReversal(row,evidence,frames))
                            &&rows.size()-1==declared&&sum-amount==total) { removable=row; matches++; }
                }
                if(matches==1) candidates.remove(removable);
            }
        }

        private boolean isOneFrameTimeReversal(YandexScreenParser.Candidate row,
                Map<String,SupportedCandidate> evidence,Map<Integer,List<YandexScreenParser.Candidate>> frames) {
            String slotId=value(row,"slot_id"),key=row.mergeKey();
            int minute=orderMinute(row);
            for(Observation observation:observations) {
                List<YandexScreenParser.Candidate> frameRows=new ArrayList<>();
                for(YandexScreenParser.Candidate candidate:frames.get(observation.frameIndex))
                    if("ORDER_LIST_ROW".equals(candidate.candidateType)&&orderMinute(candidate)>=0
                            &&same(slotId,value(candidate,"slot_id")))
                        frameRows.add(candidate);
                for(int i=1;i+1<frameRows.size();i++) {
                    if(!key.equals(frameRows.get(i).mergeKey())) continue;
                    YandexScreenParser.Candidate before=frameRows.get(i-1),after=frameRows.get(i+1);
                    SupportedCandidate beforeSupport=evidence.get(before.mergeKey());
                    SupportedCandidate afterSupport=evidence.get(after.mergeKey());
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

        private static boolean eligibleRow(YandexScreenParser.Candidate candidate,
                                           Map<String,YandexScreenParser.Candidate> slots) {
            if(!"ORDER_LIST_ROW".equals(candidate.candidateType)) return false;
            int minute=orderMinute(candidate);
            if(minute<0) return false;
            YandexScreenParser.Candidate slot=slots.get(value(candidate,"slot_id"));
            int start=slotStart(slot),end=slotEnd(slot);
            return start<0||end<=start||minute>=start&&minute<=end;
        }
        private static YandexScreenParser.Candidate withSlotId(YandexScreenParser.Candidate candidate,String slotId) {
            List<YandexScreenParser.Field> fields=new ArrayList<>(candidate.fields);
            fields.add(new YandexScreenParser.Field("slot_id","text",slotId));
            return new YandexScreenParser.Candidate(candidate.candidateType,candidate.ruleScore,fields);
        }
        private static String slotForTime(Map<String,YandexScreenParser.Candidate> slots,int minute) {
            if(minute<0) return null;
            String match=null;
            for(Map.Entry<String,YandexScreenParser.Candidate> entry:slots.entrySet())
                if(slotMatchesTime(entry.getValue(),minute)) {
                    if(match!=null) return null;
                    match=entry.getKey();
                }
            return match;
        }
        private static boolean slotMatchesTime(YandexScreenParser.Candidate slot,int minute) {
            if(slot==null||minute<0) return false;
            int start=slotStart(slot),end=slotEnd(slot);
            return start>=0&&end>start&&minute>=start&&minute<=end;
        }
        private static int slotStart(YandexScreenParser.Candidate slot) {
            int value=minuteOfDateTime(value(slot,"started_at"));
            return value>=0?value:orderMinuteValue(value(slot,"slot_start_time"));
        }
        private static int slotEnd(YandexScreenParser.Candidate slot) {
            int value=minuteOfDateTime(value(slot,"completed_at"));
            return value>=0?value:orderMinuteValue(value(slot,"slot_end_time"));
        }
        private static int orderMinuteValue(String value) {
            if(value==null||!value.matches("\\d{2}:\\d{2}")) return -1;
            try { int hour=Integer.parseInt(value.substring(0,2)),minute=Integer.parseInt(value.substring(3,5));
                return hour<24&&minute<60?hour*60+minute:-1;
            } catch(Exception ignored) { return -1; }
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

    static long samplingSpacingMs(long durationMs) {
        if(durationMs<=0) throw new IllegalArgumentException("durationMs must be positive");
        return Math.max(MIN_SAMPLE_SPACING_MS,(durationMs+MAX_FRAMES-1)/MAX_FRAMES);
    }

    static int estimatedFrameCount(long durationMs) {
        long spacing=samplingSpacingMs(durationMs);
        return (int)Math.min(MAX_FRAMES,(durationMs+spacing-1)/spacing);
    }

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
            String recordingDateMetadata=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE);
            long spacing=samplingSpacingMs(duration);
            int estimated=estimatedFrameCount(duration);
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
            Result result=new Result(sourceHash,size,duration,rows,ocrCount,recordingDateMetadata);
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
