package ru.courier.finance;

import java.time.LocalDateTime;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Cross-check time pairs in immutable OCR frames without inventing an order from a slot count. */
public final class VideoOrderTimePairs {
    private VideoOrderTimePairs() {}

    public static final class Frame {
        public final String hash,text;
        public final List<YandexScreenParser.Candidate> savedCandidates;
        public Frame(String hash,String text) { this(hash,text,new ArrayList<>()); }
        public Frame(String hash,String text,List<YandexScreenParser.Candidate> savedCandidates) {
            this.hash=hash;this.text=text;this.savedCandidates=savedCandidates;
        }
    }

    public static final class Pair {
        public final String accepted,completed;
        public final Set<String> orderNumbers,amounts;
        public final int frames;
        private Pair(String accepted,String completed,Set<String> orderNumbers,Set<String> amounts,int frames) {
            this.accepted=accepted;this.completed=completed;
            this.orderNumbers=orderNumbers;this.amounts=amounts;this.frames=frames;
        }
    }

    private static final class Support {
        final Set<String> frames=new HashSet<>(),orderNumbers=new HashSet<>(),amounts=new HashSet<>();
    }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }

    public static List<Pair> extract(List<Frame> frames) {
        Map<String,Map<String,Support>> byCompletion=new HashMap<>();
        for(Frame frame:frames) {
            if(frame.hash==null||frame.text==null||frame.text.length()>20000) continue;
            List<YandexScreenParser.Candidate> candidates=new ArrayList<>(frame.savedCandidates);
            candidates.addAll(YandexScreenParser.parse(frame.text).candidates);
            for(YandexScreenParser.Candidate candidate:candidates) {
                if(!"ORDER_DETAIL".equals(candidate.candidateType)
                        ||!"COMPLETED".equals(field(candidate,"status"))) continue;
                String start=field(candidate,"started_at"),end=field(candidate,"completed_at");
                if(start==null||end==null) continue;
                LocalDateTime accepted,completed;
                try { accepted=LocalDateTime.parse(start);completed=LocalDateTime.parse(end); }
                catch(Exception invalid) { continue; }
                Duration duration=Duration.between(accepted,completed);
                if(duration.isNegative()||duration.isZero()||duration.compareTo(Duration.ofHours(12))>0) continue;
                Support support=byCompletion.computeIfAbsent(end,k->new HashMap<>())
                    .computeIfAbsent(start,k->new Support());
                support.frames.add(frame.hash);
                String number=field(candidate,"order_number"),amount=field(candidate,"total_kopecks");
                if(number!=null&&number.matches("[0-9]{6}-[0-9]{4,}")) support.orderNumbers.add(number);
                if(amount!=null&&amount.matches("[0-9]+")) support.amounts.add(amount);
            }
        }
        List<Pair> pairs=new ArrayList<>();
        for(Map.Entry<String,Map<String,Support>> entry:byCompletion.entrySet()) {
            Map.Entry<String,Support> winner=null;
            boolean tied=false;
            for(Map.Entry<String,Support> candidate:entry.getValue().entrySet()) {
                if(winner==null||candidate.getValue().frames.size()>winner.getValue().frames.size()) {
                    winner=candidate;tied=false;
                } else if(candidate.getValue().frames.size()==winner.getValue().frames.size()) tied=true;
            }
            if(winner==null||tied) continue;
            Support support=winner.getValue();
            // One clear frame is acceptable only when its order ID and amount
            // give the later list-row reconciliation two independent anchors.
            if(support.frames.size()<2&&(support.orderNumbers.size()!=1||support.amounts.size()!=1)) continue;
            pairs.add(new Pair(winner.getKey(),entry.getKey(),support.orderNumbers,support.amounts,support.frames.size()));
        }
        return pairs;
    }
}
