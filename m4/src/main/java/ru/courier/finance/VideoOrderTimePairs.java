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

    /** Return shared times only when every same-minute row has its own observed card. */
    static Pair commonTimesForDistinctOrders(List<Pair> pairs,int rowCount) {
        if(pairs==null||rowCount<2||pairs.size()!=rowCount) return null;
        Pair first=pairs.get(0);
        Set<String> ids=new HashSet<>();
        for(Pair pair:pairs) {
            if(pair.frames<2||pair.orderNumber==null||!ids.add(pair.orderNumber)
                    ||!first.accepted.equals(pair.accepted)||!first.completed.equals(pair.completed)) return null;
        }
        return first;
    }

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
        /** Unique per-frame consensus when OCR saw this identity/value. */
        public final String orderNumber,amount;
        public final int timeConfidence;
        public final Set<String> orderNumbers,amounts;
        public final int frames;
        private Pair(String accepted,String completed,String orderNumber,String amount,int timeConfidence,
                     Set<String> orderNumbers,Set<String> amounts,int frames) {
            this.accepted=accepted;this.completed=completed;
            this.orderNumber=orderNumber;this.amount=amount;this.timeConfidence=timeConfidence;
            this.orderNumbers=orderNumbers;this.amounts=amounts;this.frames=frames;
        }
    }

    private static final class Support {
        final Set<String> frames=new HashSet<>(),orderNumbers=new HashSet<>(),amounts=new HashSet<>();
        final Map<String,Set<String>> orderNumbersByFrame=new HashMap<>(),amountsByFrame=new HashMap<>();
        final Map<String,Integer> confidenceByFrame=new HashMap<>();
        final Map<String,Integer> cardEventByFrame=new HashMap<>();

        void add(String frame,String number,String amount,Integer confidence,int event) {
            frames.add(frame);
            cardEventByFrame.put(frame,event);
            if(number!=null) {
                orderNumbers.add(number);
                orderNumbersByFrame.computeIfAbsent(frame,k->new HashSet<>()).add(number);
            }
            if(amount!=null) {
                amounts.add(amount);
                amountsByFrame.computeIfAbsent(frame,k->new HashSet<>()).add(amount);
            }
            if(confidence!=null&&confidence>0) {
                Integer previous=confidenceByFrame.get(frame);
                if(previous==null||confidence.intValue()>previous.intValue()) confidenceByFrame.put(frame,confidence);
            }
        }

    }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }

    public static List<Pair> extract(List<Frame> frames) {
        // Group by completion and start first, then vote on noisy IDs within
        // the same time pair. This prevents a one-digit OCR mistake from
        // turning one real order into two separate time pairs.
        Map<String,Map<String,Support>> byCompletion=new HashMap<>();
        int cardEvent=0; boolean listSeen=false,cardSeen=false;
        for(Frame frame:frames) {
            if(frame.hash==null||frame.text==null||frame.text.length()>20000) continue;
            List<YandexScreenParser.Candidate> candidates=new ArrayList<>(frame.savedCandidates);
            candidates.addAll(YandexScreenParser.parse(frame.text).candidates);
            boolean hasCard=false,hasList=false;
            for(YandexScreenParser.Candidate candidate:candidates) {
                hasCard |= "ORDER_DETAIL".equals(candidate.candidateType);
                hasList |= "ORDER_LIST_ROW".equals(candidate.candidateType) || "SLOT_DETAIL".equals(candidate.candidateType);
            }
            // Only a recognised list screen separates card visits; an OCR
            // failure on the current card does not prove another visit.
            if(!hasCard&&hasList&&cardSeen) listSeen=true;
            if(hasCard) { if(listSeen) cardEvent++; listSeen=false; cardSeen=true; }
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
                String number=field(candidate,"order_number"),amount=field(candidate,"total_kopecks");
                if(number!=null&&!number.matches("[0-9]{6}-[0-9]{4,}")) number=null;
                if(amount!=null&&!amount.matches("[0-9]+")) amount=null;
                Support support=byCompletion.computeIfAbsent(end,k->new HashMap<>())
                    .computeIfAbsent(start,k->new Support());
                Integer confidence=null;
                try {
                    String rawConfidence=field(candidate,"time_pair_confidence");
                    if(rawConfidence!=null) confidence=Integer.valueOf(rawConfidence);
                } catch(NumberFormatException ignored) { }
                support.add(frame.hash,number,amount,confidence,cardEvent);
            }
        }
        List<Pair> pairs=new ArrayList<>();
        for(Map.Entry<String,Map<String,Support>> entry:byCompletion.entrySet()) {
            Map<String,Map.Entry<String,Support>> bestByOrderId=new HashMap<>();
            Set<String> tiedOrderIds=new HashSet<>();
            List<Map.Entry<String,Support>> candidates=new ArrayList<>(entry.getValue().entrySet());
            for(Map.Entry<String,Support> candidate:candidates) {
                Support support=candidate.getValue();
                String number=consensus(support.orderNumbersByFrame);
                if(support.frames.size()<2||number==null) continue;
                Map.Entry<String,Support> prior=bestByOrderId.get(number);
                if(prior==null||support.frames.size()>prior.getValue().frames.size()) {
                    bestByOrderId.put(number,candidate);
                    tiedOrderIds.remove(number);
                } else if(support.frames.size()==prior.getValue().frames.size()) {
                    tiedOrderIds.add(number);
                }
            }
            for(String tied:tiedOrderIds) bestByOrderId.remove(tied);
            List<Map.Entry<String,Support>> selected=new ArrayList<>(bestByOrderId.values());
            Set<String> selectedIds=new HashSet<>();
            for(Map.Entry<String,Support> candidate:selected) {
                String number=consensus(candidate.getValue().orderNumbersByFrame);
                if(number!=null) selectedIds.add(number);
            }
            Map<String,List<Map.Entry<String,Support>>> singleFramesById=new HashMap<>();
            for(Map.Entry<String,Support> candidate:candidates) {
                Support support=candidate.getValue();
                if(support.frames.size()!=1) continue;
                String number=consensus(support.orderNumbersByFrame),amount=consensus(support.amountsByFrame);
                if(number!=null&&amount!=null&&averageConfidence(support.confidenceByFrame)>=80
                        &&!selectedIds.contains(number))
                    singleFramesById.computeIfAbsent(number,k->new ArrayList<>()).add(candidate);
            }
            for(Map.Entry<String,List<Map.Entry<String,Support>>> single:singleFramesById.entrySet()) {
                // A single clear card may recover its own time. If the same ID
                // has competing one-frame readings for this completion minute,
                // leave it ambiguous instead of choosing by HashMap order.
                if(single.getValue().size()==1&&selectedIds.add(single.getKey()))
                    selected.add(single.getValue().get(0));
            }
            if(selected.isEmpty()) {
                Map.Entry<String,Support> winner=null;boolean tied=false;
                for(Map.Entry<String,Support> candidate:candidates) {
                    if(winner==null||candidate.getValue().frames.size()>winner.getValue().frames.size()) {
                        winner=candidate;tied=false;
                    } else if(candidate.getValue().frames.size()==winner.getValue().frames.size()) tied=true;
                }
                if(winner!=null&&!tied) selected.add(winner);
            }
            for(Map.Entry<String,Support> candidate:selected) {
                Support support=candidate.getValue();
                Map<String,Set<String>> framesById=new HashMap<>();
                Map<String,Set<Integer>> eventsById=new HashMap<>();
                for(Map.Entry<String,Set<String>> observation:support.orderNumbersByFrame.entrySet()) {
                    if(observation.getValue().size()!=1) continue;
                    String id=observation.getValue().iterator().next(),hash=observation.getKey();
                    framesById.computeIfAbsent(id,k->new HashSet<>()).add(hash);
                    eventsById.computeIfAbsent(id,k->new HashSet<>()).add(support.cardEventByFrame.get(hash));
                }
                List<String> separate=new ArrayList<>();
                for(String id:framesById.keySet()) if(framesById.get(id).size()>=2) separate.add(id);
                boolean eventsDistinct=separate.size()>=2;
                Set<Integer> seenEvents=new HashSet<>();
                for(String id:separate) for(Integer event:eventsById.get(id))
                    if(!seenEvents.add(event)) eventsDistinct=false;
                if(eventsDistinct) {
                    for(String id:separate) {
                        Set<String> hashes=framesById.get(id),amounts=new HashSet<>();
                        Map<String,Set<String>> moneyByFrame=new HashMap<>();
                        Map<String,Integer> confidences=new HashMap<>();
                        for(String hash:hashes) {
                            if(support.amountsByFrame.containsKey(hash)) {
                                moneyByFrame.put(hash,support.amountsByFrame.get(hash));
                                amounts.addAll(support.amountsByFrame.get(hash));
                            }
                            if(support.confidenceByFrame.containsKey(hash)) confidences.put(hash,support.confidenceByFrame.get(hash));
                        }
                        pairs.add(new Pair(candidate.getKey(),entry.getKey(),id,consensus(moneyByFrame),
                            averageConfidence(confidences),new HashSet<>(java.util.Collections.singleton(id)),amounts,hashes.size()));
                    }
                    continue;
                }
                String number=consensus(support.orderNumbersByFrame);
                String amount=consensus(support.amountsByFrame);
                int confidence=averageConfidence(support.confidenceByFrame);
                // A single frame needs both independent anchors. Repeated
                // cards use the majority OCR reading for each optional field.
                if(support.frames.size()<2&&(number==null||amount==null||confidence<80)) continue;
                Set<String> acceptedNumbers=number==null?new HashSet<>():new HashSet<>(java.util.Collections.singleton(number));
                pairs.add(new Pair(candidate.getKey(),entry.getKey(),number,amount,confidence,
                    acceptedNumbers,new HashSet<>(support.amounts),support.frames.size()));
            }
        }
        return pairs;
    }

    private static String consensus(Map<String,Set<String>> valuesByFrame) {
        Map<String,Integer> votes=new HashMap<>();
        for(Set<String> values:valuesByFrame.values()) if(values.size()==1) {
            String value=values.iterator().next();
            votes.put(value,votes.containsKey(value)?votes.get(value)+1:1);
        }
        String winner=null;int best=0,ties=0;
        for(Map.Entry<String,Integer> vote:votes.entrySet()) {
            if(vote.getValue()>best) { winner=vote.getKey();best=vote.getValue();ties=1; }
            else if(vote.getValue()==best) ties++;
        }
        return ties==1?winner:null;
    }

    private static int averageConfidence(Map<String,Integer> confidenceByFrame) {
        if(confidenceByFrame.isEmpty()) return 0;
        long total=0;
        for(Integer confidence:confidenceByFrame.values()) total+=confidence.intValue();
        return (int)(total/confidenceByFrame.size());
    }
}
