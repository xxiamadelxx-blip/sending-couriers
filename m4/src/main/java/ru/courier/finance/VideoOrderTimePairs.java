package ru.courier.finance;

import java.time.LocalDateTime;
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
        public Frame(String hash,String text) { this.hash=hash;this.text=text; }
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
            for(YandexScreenParser.Candidate candidate:YandexScreenParser.parse(frame.text).candidates) {
                if(!"ORDER_DETAIL".equals(candidate.candidateType)
                        ||!"COMPLETED".equals(field(candidate,"status"))) continue;
                String start=field(candidate,"started_at"),end=field(candidate,"completed_at");
                if(start==null||end==null) continue;
                LocalDateTime accepted,completed;
                try { accepted=LocalDateTime.parse(start);completed=LocalDateTime.parse(end); }
                catch(Exception invalid) { continue; }
                if(!completed.isAfter(accepted)||!accepted.toLocalDate().equals(completed.toLocalDate())) continue;
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
            // Two interpretations of the same completion minute are ambiguous.
            if(entry.getValue().size()!=1) continue;
            Map.Entry<String,Support> one=entry.getValue().entrySet().iterator().next();
            Support support=one.getValue();
            if(support.frames.size()<2||support.amounts.size()>1) continue;
            pairs.add(new Pair(one.getKey(),entry.getKey(),support.orderNumbers,support.amounts,support.frames.size()));
        }
        return pairs;
    }
}
