package ru.courier.finance;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.text.SimpleDateFormat;
import java.util.Date;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Turns a fully cross-checked video extraction into forecast facts. It does not
 * use an LLM, infer payments, or turn a scheduled slot into working time.
 */
public final class M4ForecastFactWriter {
    private static final String TIME_ZONE="Europe/Moscow";
    private static final DateTimeFormatter LOCAL=DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm",Locale.ROOT);

    private M4ForecastFactWriter() {}

    private static final class OrderFact {
        String id, time;
        int visibleMinute, occurrence;
        long amountKopecks;
        String orderNumber, startedAt, completedAt;
        int acceptedMinute=-1, deliveredMinute=-1;
        boolean confirmedDelivery;
        boolean reconstructedFromDetail;
    }

    private static final class Facts {
        String sourceHash, sourceId, slotId, date, startedAt, completedAt;
        String dateBasis, dateEvidence;
        Integer declaredCount;
        int slotStartMinute, slotEndMinute;
        Long slotAmountKopecks, slotOrderAmountKopecks, slotTipsKopecks;
        long rowAmountKopecks;
        int recoveredOrderRows;
        final List<OrderFact> orders=new ArrayList<>();
        final List<OrderFact> deliveries=new ArrayList<>();
    }

    public static final class ImportResult {
        public final boolean accepted;
        public final boolean duplicate;
        public final String message;
        public final int orderCount;
        public final int visibleOrderRows;
        public final int matchedOrderDetails;
        public final boolean rawComplete;
        public final JSONObject forecastDay;
        public final String source;

        private ImportResult(boolean accepted,boolean duplicate,String message,int orderCount,
                             int visibleOrderRows,int matchedOrderDetails,boolean rawComplete,
                             JSONObject forecastDay,String source) {
            this.accepted=accepted; this.duplicate=duplicate; this.message=message;
            this.orderCount=orderCount; this.visibleOrderRows=visibleOrderRows;
            this.matchedOrderDetails=matchedOrderDetails; this.rawComplete=rawComplete;
            this.forecastDay=forecastDay; this.source=source;
        }
    }

    public static ImportResult importFacts(Context context,VideoImportProcessor.Result analysis) throws Exception {
        Facts facts;
        try { facts=extract(analysis); }
        catch(IllegalArgumentException invalid) {
            return new ImportResult(false,false,invalid.getMessage(),0,0,0,false,null,null);
        }
        boolean duplicate=writeNativeFacts(context,facts);
        boolean rawComplete=facts.orders.size()==facts.declaredCount;
        String detail=facts.recoveredOrderRows==0?"":(" Дополнительно сохранены отдельные карточки завершённых заказов: "
            +facts.recoveredOrderRows+".");
        String reconciliation=rawComplete
            ?" Распознано и сверено строк заказов: "+facts.orders.size()+" из "+facts.declaredCount+"."
            :" Перечень RAW частичный.";
        return new ImportResult(true,duplicate,
            "Подтверждён агрегат слота: "+facts.declaredCount+" заказов; отдельных строк распознано "
            +facts.orders.size()+" из "+facts.declaredCount+"."+(rawComplete?" Сумма полного списка сверена.":"")
            +reconciliation
            +detail+" Рабочее время осталось неизвестным.",
            facts.declaredCount,facts.orders.size(),facts.deliveries.size(),rawComplete,toForecastDay(facts),facts.sourceId);
    }

    private static Facts extract(VideoImportProcessor.Result analysis) {
        if(analysis==null||analysis.sourceSha256==null||!analysis.sourceSha256.matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("Не удалось подтвердить источник видео.");
        Facts facts=new Facts(); facts.sourceHash=analysis.sourceSha256; facts.sourceId="video:"+analysis.sourceSha256;
        YandexScreenParser.Candidate slot=null;
        List<YandexScreenParser.Candidate> identifiedSlots=new ArrayList<>(),partialSlots=new ArrayList<>();
        List<YandexScreenParser.Candidate> rows=new ArrayList<>(),details=new ArrayList<>();
        for(YandexScreenParser.Candidate candidate:analysis.uniqueCandidates()) {
            if("SLOT_DETAIL".equals(candidate.candidateType)) {
                if(field(candidate,"slot_id")==null) partialSlots.add(candidate);
                else identifiedSlots.add(candidate);
            } else if("ORDER_LIST_ROW".equals(candidate.candidateType)) rows.add(candidate);
            else if("ORDER_DETAIL".equals(candidate.candidateType)) details.add(candidate);
        }
        for(YandexScreenParser.Candidate candidate:identifiedSlots) {
            if(slot==null) slot=candidate;
            else if(!same(field(slot,"slot_id"),field(candidate,"slot_id")))
                throw new IllegalArgumentException("В видео найдено несколько разных слотов; факты не записаны.");
            else slot=slot.mergeMissingFields(candidate);
        }
        if(slot==null) throw new IllegalArgumentException("Не распознана карточка слота с числом заказов; факты не записаны.");
        for(YandexScreenParser.Candidate candidate:partialSlots) slot=slot.mergeMissingFields(candidate);
        facts.slotId=field(slot,"slot_id");
        facts.declaredCount=parseInt(field(slot,"slot_order_count"));
        facts.slotAmountKopecks=parseLong(field(slot,"slot_total_kopecks"));
        facts.slotOrderAmountKopecks=parseLong(field(slot,"slot_order_total_kopecks"));
        facts.slotTipsKopecks=parseLong(field(slot,"slot_tips_kopecks"));
        facts.startedAt=field(slot,"started_at"); facts.completedAt=field(slot,"completed_at");
        if(facts.slotId==null||!facts.slotId.matches("[0-9]{6,12}")||facts.declaredCount==null||facts.declaredCount<1
                ||facts.slotAmountKopecks==null)
            throw new IllegalArgumentException("Данные карточки слота неполны; факты не записаны.");
        LocalDateTime slotStart=parseLocal(facts.startedAt),slotEnd=parseLocal(facts.completedAt);
        int rangeStart=parseMinute(field(slot,"slot_start_time"));
        int rangeEnd=parseMinute(field(slot,"slot_end_time"));
        if(slotStart!=null&&slotEnd!=null) {
            if(!slotStart.toLocalDate().equals(slotEnd.toLocalDate())||!slotEnd.isAfter(slotStart))
                throw new IllegalArgumentException("Дата или время слота не прошли проверку; факты не записаны.");
            facts.date=slotStart.toLocalDate().toString();
            facts.slotStartMinute=slotStart.getHour()*60+slotStart.getMinute();
            facts.slotEndMinute=slotEnd.getHour()*60+slotEnd.getMinute();
            facts.dateBasis="slot_card";
            facts.dateEvidence="Дата и время взяты с карточки слота.";
        } else {
            if(rangeStart<0||rangeEnd<=rangeStart)
                throw new IllegalArgumentException("Данные карточки слота неполны; факты не записаны.");
            LocalDate resolvedDate=null;
            String resolvedBasis=null,resolvedEvidence=null;
            if(slotStart!=null||slotEnd!=null) {
                LocalDate explicitDate=slotStart!=null?slotStart.toLocalDate():slotEnd.toLocalDate();
                if((slotStart!=null&&slotStart.getHour()*60+slotStart.getMinute()!=rangeStart)
                        ||(slotEnd!=null&&slotEnd.getHour()*60+slotEnd.getMinute()!=rangeEnd))
                    throw new IllegalArgumentException("Время карточки слота противоречиво; факты не записаны.");
                resolvedDate=explicitDate;
                resolvedBasis="partial_slot_card";
                resolvedEvidence="Дата взята с карточки слота; недостающее время — из видимого диапазона.";
            } else {
                java.util.Set<String> detailDates=orderDetailDates(details,rangeStart,rangeEnd);
                if(detailDates.size()>1)
                    throw new IllegalArgumentException("Карточки заказов указывают на разные даты; факты не записаны.");
                if(detailDates.size()==1) {
                    resolvedDate=LocalDate.parse(detailDates.iterator().next());
                    resolvedBasis="order_detail_date";
                    resolvedEvidence="Дата подтверждена датой завершённых карточек заказов.";
                } else {
                    List<String> orderTimes=new ArrayList<>();
                    for(YandexScreenParser.Candidate row:rows) {
                        String rowSlot=field(row,"slot_id");
                        if(rowSlot==null||facts.slotId.equals(rowSlot)) orderTimes.add(field(row,"order_time"));
                    }
                    M4VideoDateResolver.Resolution resolution=M4VideoDateResolver.resolve(
                        analysis.recordingDateMetadata,field(slot,"slot_start_time"),field(slot,"slot_end_time"),orderTimes);
                    if(resolution==null)
                        throw new IllegalArgumentException("В карточке нет даты, а время создания видео не позволяет однозначно определить день; факты не записаны.");
                    resolvedDate=resolution.date;
                    resolvedBasis=resolution.previousDay?"video_metadata_previous_day":"video_metadata_same_day";
                    resolvedEvidence="Дата определена по метке создания видео "
                        +LOCAL.format(resolution.recordingLocal)+" и времени строк списка.";
                }
            }
            facts.date=resolvedDate.toString();
            facts.slotStartMinute=rangeStart; facts.slotEndMinute=rangeEnd;
            facts.startedAt=localDateTime(resolvedDate,rangeStart);
            facts.completedAt=localDateTime(resolvedDate,rangeEnd);
            facts.dateBasis=resolvedBasis; facts.dateEvidence=resolvedEvidence;
            slotStart=parseLocal(facts.startedAt); slotEnd=parseLocal(facts.completedAt);
        }
        if(slotStart==null||slotEnd==null||!slotStart.toLocalDate().equals(slotEnd.toLocalDate())||!slotEnd.isAfter(slotStart))
            throw new IllegalArgumentException("Дата или время слота не прошли проверку; факты не записаны.");
        if(facts.slotOrderAmountKopecks!=null&&facts.slotTipsKopecks!=null) {
            long subtotal;
            try { subtotal=Math.addExact(facts.slotOrderAmountKopecks,facts.slotTipsKopecks); }
            catch(ArithmeticException overflow) { throw new IllegalArgumentException("Сумма карточки слота не прошла проверку; факты не записаны."); }
            if(subtotal!=facts.slotAmountKopecks)
                throw new IllegalArgumentException("Сумма заказов и чаевых не совпала с итогом карточки слота; факты не записаны.");
        }

        Long orderTotal=facts.slotOrderAmountKopecks;
        if(orderTotal==null) {
            if(facts.slotTipsKopecks!=null) {
                try { orderTotal=Math.subtractExact(facts.slotAmountKopecks,facts.slotTipsKopecks); }
                catch(ArithmeticException overflow) { throw new IllegalArgumentException("Сумма заказа и чаевых не прошла проверку; факты не записаны."); }
                if(orderTotal<0) throw new IllegalArgumentException("Чаевые превышают итог карточки слота; факты не записаны.");
            } else orderTotal=facts.slotAmountKopecks;
        }
        reconcileCompleteOrderDetails(facts,details,orderTotal);

        for(YandexScreenParser.Candidate row:rows) {
            String rowSlot=field(row,"slot_id");
            if(rowSlot!=null&&!facts.slotId.equals(rowSlot)) continue;
            String time=field(row,"order_time"); int minute=parseMinute(time);
            Long amount=parseLong(field(row,"amount_kopecks"));
            Integer occurrence=parseInt(field(row,"occurrence"));
            if(minute<facts.slotStartMinute||minute>facts.slotEndMinute||amount==null||amount<0||occurrence==null||occurrence<1) continue;
            OrderFact item=new OrderFact(); item.time=time; item.visibleMinute=minute; item.amountKopecks=amount;
            item.occurrence=occurrence; facts.orders.add(item);
            try { facts.rowAmountKopecks=Math.addExact(facts.rowAmountKopecks,amount); }
            catch(ArithmeticException overflow) { throw new IllegalArgumentException("Сумма строк списка не прошла проверку."); }
        }
        Collections.sort(facts.orders,Comparator.comparingInt((OrderFact o)->o.visibleMinute).thenComparingInt(o->o.occurrence));
        if(facts.orders.size()>facts.declaredCount)
            throw new IllegalArgumentException("Извлечено уникальных строк заказов: "+facts.orders.size()+"; в слоте указано "+facts.declaredCount+". Проверьте повторы или карточку слота.");
        if(facts.orders.size()<facts.declaredCount) recoverObservedDetailRows(facts,details,orderTotal);
        if(facts.orders.size()>facts.declaredCount)
            throw new IllegalArgumentException("Строки списка и карточки заказов превышают подтверждённый итог слота.");
        if(facts.orders.size()==facts.declaredCount&&facts.rowAmountKopecks!=orderTotal)
            throw new IllegalArgumentException("Полный перечень заказов не совпал по сумме с карточкой слота; факты не записаны.");
        if(facts.orders.size()<facts.declaredCount&&facts.rowAmountKopecks>orderTotal)
            throw new IllegalArgumentException("Сумма наблюдаемых заказов больше подтверждённого итога слота; факты не записаны.");

        for(int i=0;i<facts.orders.size();i++) facts.orders.get(i).id="video-"+facts.sourceHash.substring(0,24)+"-"+facts.slotId+"-"+(i+1);
        attachOrderDetails(facts,details);
        return facts;
    }

    /**
     * When the video contains one complete, uniquely identified card for every
     * order in the slot, reconcile those observed payouts even if one card could
     * not be joined to the scrolling list by its OCR amount. A complete set of
     * cards with a conflicting subtotal is an import error, not a partial RAW list.
     */
    private static void reconcileCompleteOrderDetails(Facts facts,List<YandexScreenParser.Candidate> details,
                                                       Long expectedOrderTotal) {
        if(expectedOrderTotal==null) return;
        Map<String,Long> totals=new HashMap<>();
        java.util.Set<String> cardsWithUnknownAmount=new java.util.HashSet<>();
        for(YandexScreenParser.Candidate detail:details) {
            if(!"COMPLETED".equals(field(detail,"status"))) continue;
            String number=field(detail,"order_number");
            LocalDateTime start=parseLocal(field(detail,"started_at")),end=parseLocal(field(detail,"completed_at"));
            if(number==null||start==null||end==null||!end.isAfter(start)
                    ||!facts.date.equals(start.toLocalDate().toString())
                    ||!facts.date.equals(end.toLocalDate().toString())) continue;
            int startMinute=start.getHour()*60+start.getMinute(),endMinute=end.getHour()*60+end.getMinute();
            if(startMinute<facts.slotStartMinute||endMinute>facts.slotEndMinute) continue;
            Long amount=parseLong(field(detail,"total_kopecks"));
            if(amount==null||amount<0) cardsWithUnknownAmount.add(number);
            else totals.put(number,amount);
        }
        java.util.Set<String> completeIds=new java.util.HashSet<>(totals.keySet());
        completeIds.addAll(cardsWithUnknownAmount);
        if(completeIds.size()!=facts.declaredCount) return;
        if(!cardsWithUnknownAmount.isEmpty())
            throw new IllegalArgumentException("Карточки подтверждают все заказы слота, но сумма одной или нескольких карточек не распознана; факты не записаны.");
        long subtotal=0;
        try { for(Long amount:totals.values()) subtotal=Math.addExact(subtotal,amount); }
        catch(ArithmeticException overflow) { throw new IllegalArgumentException("Итог карточек заказов не прошёл проверку; факты не записаны."); }
        if(subtotal!=expectedOrderTotal)
            throw new IllegalArgumentException("Сумма карточек завершённых заказов не совпала с итогом карточки слота; факты не записаны.");
    }

    /**
     * Adds only complete, uniquely identified order cards that are genuinely
     * visible in the source video. The slot total itself never creates RAW rows.
     */
    private static void recoverObservedDetailRows(Facts facts,List<YandexScreenParser.Candidate> details,
                                                   Long expectedOrderTotal) {
        if(expectedOrderTotal==null||facts.orders.size()>=facts.declaredCount) return;
        java.util.Set<String> orderIds=new java.util.HashSet<>();
        for(OrderFact row:facts.orders) if(row.orderNumber!=null) orderIds.add(row.orderNumber);
        Map<Integer,List<OrderFact>> byMinute=new HashMap<>();
        for(OrderFact row:facts.orders) byMinute.computeIfAbsent(row.visibleMinute,k->new ArrayList<>()).add(row);
        for(YandexScreenParser.Candidate detail:details) {
            if(!"COMPLETED".equals(field(detail,"status"))) continue;
            String number=field(detail,"order_number"),startText=field(detail,"started_at"),endText=field(detail,"completed_at");
            LocalDateTime start=parseLocal(startText),end=parseLocal(endText);
            Long amount=parseLong(field(detail,"total_kopecks"));
            if(number==null||start==null||end==null||amount==null||amount<0) continue;
            if(!facts.date.equals(start.toLocalDate().toString())||!facts.date.equals(end.toLocalDate().toString())
                    ||!end.isAfter(start)) continue;
            int startMinute=start.getHour()*60+start.getMinute(),endMinute=end.getHour()*60+end.getMinute();
            if(startMinute<facts.slotStartMinute||endMinute>facts.slotEndMinute) continue;
            if(!orderIds.add(number)) continue;

            List<OrderFact> atMinute=byMinute.get(endMinute); OrderFact match=null;
            if(atMinute!=null) for(OrderFact row:atMinute) {
                if(!row.confirmedDelivery&&row.amountKopecks==amount) { match=row; break; }
            }
            if(match!=null) {
                applyDetail(match,detail);
                facts.deliveries.add(match);
                continue;
            }
            if(facts.orders.size()>=facts.declaredCount) continue;
            int occurrence=1;
            if(atMinute!=null) for(OrderFact prior:atMinute) occurrence=Math.max(occurrence,prior.occurrence+1);
            OrderFact row=new OrderFact(); row.visibleMinute=endMinute;
            row.time=String.format(Locale.ROOT,"%02d:%02d",end.getHour(),end.getMinute());
            row.amountKopecks=amount; row.occurrence=occurrence; row.reconstructedFromDetail=true;
            applyDetail(row,detail);
            try { facts.rowAmountKopecks=Math.addExact(facts.rowAmountKopecks,amount); }
            catch(ArithmeticException overflow) { throw new IllegalArgumentException("Сумма наблюдаемых заказов не прошла проверку."); }
            facts.orders.add(row); facts.deliveries.add(row); facts.recoveredOrderRows++;
            byMinute.computeIfAbsent(endMinute,k->new ArrayList<>()).add(row);
        }
        Collections.sort(facts.orders,Comparator.comparingInt((OrderFact o)->o.visibleMinute).thenComparingInt(o->o.occurrence));
    }

    private static void applyDetail(OrderFact order,YandexScreenParser.Candidate detail) {
        String orderNumber=field(detail,"order_number"),startText=field(detail,"started_at"),endText=field(detail,"completed_at");
        LocalDateTime start=parseLocal(startText),end=parseLocal(endText);
        order.orderNumber=orderNumber!=null&&orderNumber.matches("[0-9]{6}-[0-9]{4,}")?orderNumber:null;
        order.startedAt=startText; order.completedAt=endText;
        order.acceptedMinute=start.getHour()*60+start.getMinute(); order.deliveredMinute=end.getHour()*60+end.getMinute();
        order.confirmedDelivery=true;
    }

    private static void attachOrderDetails(Facts facts,List<YandexScreenParser.Candidate> details) {
        Map<Integer,List<OrderFact>> byMinute=new HashMap<>();
        for(OrderFact order:facts.orders) byMinute.computeIfAbsent(order.visibleMinute,k->new ArrayList<>()).add(order);
        Map<Integer,Integer> nextOccurrence=new HashMap<>();
        java.util.Set<String> attachedOrderNumbers=new java.util.HashSet<>();
        for(YandexScreenParser.Candidate detail:details) {
            if(!"COMPLETED".equals(field(detail,"status"))) continue;
            String orderNumber=field(detail,"order_number"),startText=field(detail,"started_at"),endText=field(detail,"completed_at");
            LocalDateTime start=parseLocal(startText),end=parseLocal(endText);
            if(orderNumber==null||start==null||end==null||!facts.date.equals(start.toLocalDate().toString())
                    ||!facts.date.equals(end.toLocalDate().toString())||!end.isAfter(start)
                    ||!attachedOrderNumbers.add(orderNumber)) continue;
            int minute=end.getHour()*60+end.getMinute();
            List<OrderFact> matches=byMinute.get(minute); if(matches==null) continue;
            int position=nextOccurrence.containsKey(minute)?nextOccurrence.get(minute):0;
            Long amount=parseLong(field(detail,"total_kopecks"));
            while(position<matches.size()&&(matches.get(position).confirmedDelivery
                    ||amount==null||matches.get(position).amountKopecks!=amount)) position++;
            if(position>=matches.size()) continue;
            OrderFact order=matches.get(position); nextOccurrence.put(minute,position+1);
            order.orderNumber=orderNumber; order.startedAt=startText; order.completedAt=endText;
            order.acceptedMinute=start.getHour()*60+start.getMinute(); order.deliveredMinute=minute; order.confirmedDelivery=true;
            facts.deliveries.add(order);
        }
    }

    private static JSONObject toForecastDay(Facts facts) throws Exception {
        JSONObject day=new JSONObject(); JSONArray evidence=new JSONArray();
        for(OrderFact order:facts.orders) {
            JSONObject row=new JSONObject().put("id",order.id).put("visibleMin",order.visibleMinute)
                .put("acceptedMin",order.confirmedDelivery?order.acceptedMinute:JSONObject.NULL)
                .put("deliveredMin",order.confirmedDelivery?order.deliveredMinute:JSONObject.NULL)
                .put("orderNumber",order.orderNumber==null?JSONObject.NULL:order.orderNumber)
                .put("source",facts.sourceId).put("confidence",order.reconstructedFromDetail?"ORDER_DETAIL_OBSERVED":
                    (order.confirmedDelivery?"ORDER_DETAIL_MATCHED":"LIST_ROW_CROSSCHECKED"))
                .put("note",order.reconstructedFromDetail?"Отдельная запись получена из видимой карточки завершённого заказа.":"")
                .put("workingInterval","").put("confirmed",order.confirmedDelivery)
                .put("fieldSources",new JSONObject()
                    .put("visibleMin",new JSONObject().put("status","CONFIRMED").put("source",facts.sourceId))
                    .put("acceptedMin",new JSONObject().put("status",order.confirmedDelivery?"CONFIRMED":"UNKNOWN").put("source",facts.sourceId))
                    .put("deliveredMin",new JSONObject().put("status",order.confirmedDelivery?"CONFIRMED":"UNKNOWN").put("source",facts.sourceId)));
            evidence.put(row);
        }
        boolean rawComplete=facts.orders.size()==facts.declaredCount;
        String orderNote="Число заказов "+facts.declaredCount+" подтверждено итогом слота; в видео различимы отдельные записи: "+facts.orders.size()+".";
        if(rawComplete) orderNote+=" Сумма полного списка сверена с итогом слота.";
        orderNote+=" "+facts.dateEvidence;
        if(facts.recoveredOrderRows>0) orderNote+=" Отдельно распознано карточек завершённых заказов: "+facts.recoveredOrderRows+".";
        JSONObject fieldSources=new JSONObject().put("orders",new JSONObject().put("status","CONFIRMED").put("kind","FACT")
            .put("source",facts.sourceId).put("note",orderNote));
        JSONArray notes=new JSONArray().put("Подтверждённый агрегат: "+facts.declaredCount+" заказов.")
            .put("Отдельных записей заказов в видео: "+facts.orders.size()+" из "+facts.declaredCount+".")
            .put("Время полного слота "+facts.startedAt+"–"+facts.completedAt+" сохранено как слот и не засчитано рабочим временем.")
            .put("Время между принятием и завершением заказа описывает доставку и не используется как полная рабочая экспозиция.");
        if(rawComplete) notes.put("Сумма полного списка заказов сверена с итогом слота.");
        if(facts.recoveredOrderRows>0) notes.put("Дополнительно распознано отдельных карточек завершённых заказов: "+facts.recoveredOrderRows+".");
        if(!"slot_card".equals(facts.dateBasis)) notes.put(facts.dateEvidence);
        day.put("date",facts.date).put("timezone",TIME_ZONE).put("zone",TIME_ZONE)
            .put("orders",facts.declaredCount).put("ordersConfirmed",true).put("completed",true)
            .put("workConfirmed",false).put("workingMin",JSONObject.NULL).put("precision","unknown")
            .put("intervals",new JSONArray()).put("appAccountedMin",JSONObject.NULL).put("accountedConfirmed",false)
            .put("orderEvidence",evidence).put("evidenceComplete",rawComplete&&facts.deliveries.size()==facts.orders.size())
            .put("rawComplete",rawComplete)
            .put("source",facts.sourceId).put("sourceHash",facts.sourceHash)
            .put("sourceNotes",notes).put("fieldSources",fieldSources);
        return day;
    }

    private static boolean writeNativeFacts(Context context,Facts facts) throws Exception {
        CourierDatabase store=new CourierDatabase(context); SQLiteDatabase db=store.getWritableDatabase();
        String now=nowUtc(); boolean duplicate=false;
        db.beginTransaction();
        try {
            try(Cursor found=db.rawQuery("SELECT id FROM import_sources WHERE id=? OR sha256=?",new String[]{facts.sourceId,facts.sourceHash})) {
                duplicate=found.moveToFirst();
            }
            ContentValues source=new ContentValues(); source.put("id",facts.sourceId); source.put("sha256",facts.sourceHash);
            source.put("source_kind","video_import"); source.put("parser_version",YandexScreenParser.VERSION);
            source.put("status","mirrored"); source.put("created_at",now); source.put("updated_at",now);
            db.insertWithOnConflict("import_sources",null,source,SQLiteDatabase.CONFLICT_IGNORE);

            ContentValues aggregate=new ContentValues();
            aggregate.put("id",facts.sourceId+":count:"+facts.date+":"+facts.slotId); aggregate.put("date",facts.date);
            aggregate.put("slot_id",facts.slotId); aggregate.put("order_count",facts.declaredCount);
            if(facts.slotOrderAmountKopecks!=null) aggregate.put("reward_kopecks",facts.slotOrderAmountKopecks);
            else if(facts.slotTipsKopecks==null) aggregate.put("reward_kopecks",facts.slotAmountKopecks);
            aggregate.put("source_id",facts.sourceId); aggregate.put("source_kind","video_import");
            aggregate.put("confidence","confirmed"); aggregate.put("created_at",now); aggregate.put("updated_at",now);
            db.insertWithOnConflict("aggregate_order_counts",null,aggregate,SQLiteDatabase.CONFLICT_IGNORE);

            for(OrderFact order:facts.orders) {
                ContentValues row=new ContentValues(); row.put("id",order.id); row.put("date",facts.date);
                if(order.startedAt!=null) row.put("accepted_at",toUtc(order.startedAt));
                if(order.completedAt!=null) row.put("completed_at",toUtc(order.completedAt));
                if(order.orderNumber!=null) row.put("yandex_order_id",order.orderNumber);
                row.put("reward_kopecks",order.amountKopecks); row.put("source_id",facts.sourceId);
                row.put("source_kind","video_import"); row.put("confidence",order.confirmedDelivery?"confirmed":"observed");
                row.put("precision",order.confirmedDelivery?"order_detail_minute":"list_row_minute");
                row.put("created_at",now); row.put("updated_at",now);
                db.insertWithOnConflict("orders",null,row,SQLiteDatabase.CONFLICT_IGNORE);
            }
            ContentValues audit=new ContentValues(); audit.put("id",facts.sourceId+":facts:"+facts.slotId);
            audit.put("happened_at",now); audit.put("action","video_import_facts_written");
            audit.put("record_type","video_import"); audit.put("record_id",facts.sourceId);
            audit.put("source_kind","video_import");
            audit.put("payload_json",new JSONObject().put("date",facts.date).put("aggregateOrderCount",facts.declaredCount)
                .put("observedOrderRows",facts.orders.size())
                .put("slotId",facts.slotId).put("slotDateBasis",facts.dateBasis)
                .put("matchedOrderDetails",facts.deliveries.size())
                .put("recoveredOrderRows",facts.recoveredOrderRows).toString());
            db.insertWithOnConflict("audit_events",null,audit,SQLiteDatabase.CONFLICT_IGNORE);

            long count=count(db,"SELECT COUNT(*) FROM orders WHERE source_id=?",facts.sourceId);
            long aggregateCount=count(db,"SELECT COUNT(*) FROM aggregate_order_counts WHERE source_id=? AND date=?",facts.sourceId,facts.date);
            if(count!=facts.orders.size()||aggregateCount!=1)
                throw new IllegalStateException("SQLite video fact write did not match the extracted data");
            ContentValues mark=new ContentValues(); mark.put("status","mirrored"); mark.put("updated_at",now);
            db.update("import_sources",mark,"id=?",new String[]{facts.sourceId});
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); store.close(); }
        return duplicate;
    }

    private static long count(SQLiteDatabase db,String sql,String... args) {
        try(Cursor cursor=db.rawQuery(sql,args)) { if(!cursor.moveToFirst()) return -1; return cursor.getLong(0); }
    }

    private static LocalDateTime parseLocal(String value) {
        try { return LocalDateTime.parse(value,LOCAL); } catch(Exception invalid) { return null; }
    }

    private static String localDateTime(LocalDate date,int minute) {
        return LOCAL.format(date.atStartOfDay().plusMinutes(minute));
    }

    private static java.util.Set<String> orderDetailDates(List<YandexScreenParser.Candidate> details,
                                                          int slotStartMinute,int slotEndMinute) {
        java.util.Set<String> dates=new java.util.LinkedHashSet<>();
        for(YandexScreenParser.Candidate detail:details) {
            if(!"COMPLETED".equals(field(detail,"status"))) continue;
            LocalDateTime started=parseLocal(field(detail,"started_at"));
            LocalDateTime completed=parseLocal(field(detail,"completed_at"));
            LocalDateTime evidence=completed!=null?completed:started;
            if(evidence==null) continue;
            int minute=evidence.getHour()*60+evidence.getMinute();
            if(minute<slotStartMinute||minute>slotEndMinute) continue;
            if(started!=null&&completed!=null&&!started.toLocalDate().equals(completed.toLocalDate())) continue;
            dates.add(evidence.toLocalDate().toString());
        }
        return dates;
    }

    private static int parseMinute(String value) {
        if(value==null||!value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) return -1;
        return Integer.parseInt(value.substring(0,2))*60+Integer.parseInt(value.substring(3,5));
    }

    private static Integer parseInt(String value) { try { return value==null?null:Integer.valueOf(value); } catch(Exception invalid) { return null; } }
    private static Long parseLong(String value) { try { return value==null?null:Long.valueOf(value); } catch(Exception invalid) { return null; } }
    private static boolean same(String a,String b) { return a==null?b==null:a.equals(b); }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        if(candidate==null) return null;
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }

    private static String toUtc(String localTime) {
        return parseLocal(localTime).atZone(ZoneId.of(TIME_ZONE)).toInstant().toString();
    }

    private static String nowUtc() {
        SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date());
    }
}
