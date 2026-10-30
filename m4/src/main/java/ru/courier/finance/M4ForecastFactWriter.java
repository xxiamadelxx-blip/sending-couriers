package ru.courier.finance;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.time.Duration;
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
    }

    private static final class Facts {
        String sourceHash, sourceId, slotId, date, startedAt, completedAt;
        Integer declaredCount;
        int slotStartMinute, slotEndMinute;
        Long slotAmountKopecks;
        long rowAmountKopecks;
        final List<OrderFact> orders=new ArrayList<>();
        final List<OrderFact> deliveries=new ArrayList<>();
    }

    public static final class ImportResult {
        public final boolean accepted;
        public final boolean duplicate;
        public final String message;
        public final int orderCount;
        public final int deliveryIntervals;
        public final JSONObject forecastDay;
        public final String source;

        private ImportResult(boolean accepted,boolean duplicate,String message,int orderCount,
                             int deliveryIntervals,JSONObject forecastDay,String source) {
            this.accepted=accepted; this.duplicate=duplicate; this.message=message;
            this.orderCount=orderCount; this.deliveryIntervals=deliveryIntervals;
            this.forecastDay=forecastDay; this.source=source;
        }
    }

    public static ImportResult importFacts(Context context,VideoImportProcessor.Result analysis) throws Exception {
        Facts facts;
        try { facts=extract(analysis); }
        catch(IllegalArgumentException invalid) {
            return new ImportResult(false,false,invalid.getMessage(),0,0,null,null);
        }
        boolean duplicate=writeNativeFacts(context,facts);
        return new ImportResult(true,duplicate,
            "Распознано и сверено строк заказов: "+facts.orders.size()+" из "+facts.declaredCount+
            "; сумма строк совпала с итогом слота. В историю прогноза записано. Рабочие часы из полного слота не выводились.",
            facts.orders.size(),facts.deliveries.size(),toForecastDay(facts),facts.sourceId);
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
        facts.startedAt=field(slot,"started_at"); facts.completedAt=field(slot,"completed_at");
        if(facts.slotId==null||!facts.slotId.matches("[0-9]{6,12}")||facts.declaredCount==null||facts.declaredCount<1
                ||facts.slotAmountKopecks==null||facts.startedAt==null||facts.completedAt==null)
            throw new IllegalArgumentException("Данные карточки слота неполны; факты не записаны.");
        LocalDateTime slotStart=parseLocal(facts.startedAt),slotEnd=parseLocal(facts.completedAt);
        if(slotStart==null||slotEnd==null||!slotStart.toLocalDate().equals(slotEnd.toLocalDate())||!slotEnd.isAfter(slotStart))
            throw new IllegalArgumentException("Дата или время слота не прошли проверку; факты не записаны.");
        facts.date=slotStart.toLocalDate().toString();
        facts.slotStartMinute=slotStart.getHour()*60+slotStart.getMinute();
        facts.slotEndMinute=slotEnd.getHour()*60+slotEnd.getMinute();

        for(YandexScreenParser.Candidate row:rows) {
            String rowSlot=field(row,"slot_id");
            if(rowSlot!=null&&!facts.slotId.equals(rowSlot)) continue;
            String time=field(row,"order_time"); int minute=parseMinute(time);
            Long amount=parseLong(field(row,"amount_kopecks"));
            Integer occurrence=parseInt(field(row,"occurrence"));
            if(minute<facts.slotStartMinute||minute>facts.slotEndMinute||amount==null||amount<0||occurrence==null||occurrence<1) continue;
            OrderFact item=new OrderFact(); item.time=time; item.visibleMinute=minute; item.amountKopecks=amount;
            item.occurrence=occurrence; facts.orders.add(item); facts.rowAmountKopecks+=amount;
        }
        Collections.sort(facts.orders,Comparator.comparingInt((OrderFact o)->o.visibleMinute).thenComparingInt(o->o.occurrence));
        if(facts.orders.size()!=facts.declaredCount)
            throw new IllegalArgumentException("Извлечено строк заказов: "+facts.orders.size()+"; в слоте указано "+facts.declaredCount+". Неполные данные оставлены кандидатами, в прогноз не записаны.");
        if(facts.rowAmountKopecks!=facts.slotAmountKopecks)
            throw new IllegalArgumentException("Сумма строк списка не совпала с итогом слота; в прогноз не записано.");

        for(int i=0;i<facts.orders.size();i++) facts.orders.get(i).id="video-"+facts.sourceHash.substring(0,24)+"-"+facts.slotId+"-"+(i+1);
        attachOrderDetails(facts,details);
        return facts;
    }

    private static void attachOrderDetails(Facts facts,List<YandexScreenParser.Candidate> details) {
        Map<Integer,List<OrderFact>> byMinute=new HashMap<>();
        for(OrderFact order:facts.orders) byMinute.computeIfAbsent(order.visibleMinute,k->new ArrayList<>()).add(order);
        Map<Integer,Integer> nextOccurrence=new HashMap<>();
        for(YandexScreenParser.Candidate detail:details) {
            if(!"COMPLETED".equals(field(detail,"status"))) continue;
            String orderNumber=field(detail,"order_number"),startText=field(detail,"started_at"),endText=field(detail,"completed_at");
            LocalDateTime start=parseLocal(startText),end=parseLocal(endText);
            if(orderNumber==null||start==null||end==null||!facts.date.equals(start.toLocalDate().toString())
                    ||!facts.date.equals(end.toLocalDate().toString())||!end.isAfter(start)) continue;
            int minute=end.getHour()*60+end.getMinute();
            List<OrderFact> matches=byMinute.get(minute); if(matches==null) continue;
            int position=nextOccurrence.containsKey(minute)?nextOccurrence.get(minute):0;
            while(position<matches.size()&&matches.get(position).confirmedDelivery) position++;
            if(position>=matches.size()) continue;
            OrderFact order=matches.get(position); nextOccurrence.put(minute,position+1);
            order.orderNumber=orderNumber; order.startedAt=startText; order.completedAt=endText;
            order.acceptedMinute=start.getHour()*60+start.getMinute(); order.deliveredMinute=minute; order.confirmedDelivery=true;
            facts.deliveries.add(order);
        }
    }

    private static JSONObject toForecastDay(Facts facts) throws Exception {
        JSONObject day=new JSONObject(); JSONArray evidence=new JSONArray(),intervals=new JSONArray();
        for(OrderFact order:facts.orders) {
            JSONObject row=new JSONObject().put("id",order.id).put("visibleMin",order.visibleMinute)
                .put("acceptedMin",order.confirmedDelivery?order.acceptedMinute:JSONObject.NULL)
                .put("deliveredMin",order.confirmedDelivery?order.deliveredMinute:JSONObject.NULL)
                .put("orderNumber",order.orderNumber==null?JSONObject.NULL:order.orderNumber)
                .put("source",facts.sourceId).put("confidence",order.confirmedDelivery?"ORDER_DETAIL_MATCHED":"LIST_ROW_CROSSCHECKED")
                .put("note","").put("workingInterval","").put("confirmed",order.confirmedDelivery)
                .put("fieldSources",new JSONObject()
                    .put("visibleMin",new JSONObject().put("status","CONFIRMED").put("source",facts.sourceId))
                    .put("acceptedMin",new JSONObject().put("status",order.confirmedDelivery?"CONFIRMED":"UNKNOWN").put("source",facts.sourceId))
                    .put("deliveredMin",new JSONObject().put("status",order.confirmedDelivery?"CONFIRMED":"UNKNOWN").put("source",facts.sourceId)));
            evidence.put(row);
            if(order.confirmedDelivery) intervals.put(new JSONObject().put("start",order.acceptedMinute).put("end",order.deliveredMinute).put("state","WORK"));
        }
        JSONObject fieldSources=new JSONObject().put("orders",new JSONObject().put("status","CONFIRMED").put("kind","FACT")
            .put("source",facts.sourceId).put("note","Все "+facts.declaredCount+" строк совпали с числом заказов и суммой слота."));
        if(!facts.deliveries.isEmpty()) fieldSources.put("workingMin",new JSONObject().put("status","CONFIRMED").put("kind","FACT")
            .put("source",facts.sourceId).put("note","Только явно показанные интервалы завершённых заказов; промежутки между ними неизвестны."));
        JSONArray notes=new JSONArray().put("Проверено строк списка: "+facts.declaredCount+"; число и сумма совпали с итогом слота.")
            .put("Время полного слота "+facts.startedAt+"–"+facts.completedAt+" сохранено как слот и не засчитано рабочим временем.")
            .put("В WORK записаны только распознанные интервалы завершённых заказов; время ожидания и пауз между заказами осталось неизвестным.");
        day.put("date",facts.date).put("timezone",TIME_ZONE).put("zone",TIME_ZONE)
            .put("orders",facts.orders.size()).put("ordersConfirmed",true).put("completed",true)
            .put("workConfirmed",!facts.deliveries.isEmpty()).put("precision",facts.deliveries.isEmpty()?"unknown":"intervals")
            .put("intervals",intervals).put("appAccountedMin",JSONObject.NULL).put("accountedConfirmed",false)
            .put("orderEvidence",evidence).put("evidenceComplete",facts.deliveries.size()==facts.orders.size())
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
            aggregate.put("slot_id",facts.slotId); aggregate.put("order_count",facts.orders.size());
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
                if(order.confirmedDelivery) {
                    int active=(int)Duration.between(parseLocal(order.startedAt),parseLocal(order.completedAt)).toMinutes();
                    ContentValues interval=new ContentValues(); interval.put("id",order.id+":delivery");
                    interval.put("date",facts.date); interval.put("started_at",toUtc(order.startedAt));
                    interval.put("ended_at",toUtc(order.completedAt)); interval.put("zone",TIME_ZONE);
                    interval.put("state","WORK"); interval.put("active_minutes",active);
                    interval.put("source_id",facts.sourceId); interval.put("source_kind","video_import");
                    interval.put("confidence","confirmed"); interval.put("created_at",now); interval.put("updated_at",now);
                    db.insertWithOnConflict("work_intervals",null,interval,SQLiteDatabase.CONFLICT_IGNORE);
                }
            }
            ContentValues audit=new ContentValues(); audit.put("id",facts.sourceId+":facts:"+facts.slotId);
            audit.put("happened_at",now); audit.put("action","video_import_facts_written");
            audit.put("record_type","video_import"); audit.put("record_id",facts.sourceId);
            audit.put("source_kind","video_import");
            audit.put("payload_json",new JSONObject().put("date",facts.date).put("orderCount",facts.orders.size())
                .put("slotId",facts.slotId).put("matchedDeliveryIntervals",facts.deliveries.size()).toString());
            db.insertWithOnConflict("audit_events",null,audit,SQLiteDatabase.CONFLICT_IGNORE);

            long count=count(db,"SELECT COUNT(*) FROM orders WHERE source_id=?",facts.sourceId);
            long aggregateCount=count(db,"SELECT COUNT(*) FROM aggregate_order_counts WHERE source_id=? AND date=?",facts.sourceId,facts.date);
            long intervalCount=count(db,"SELECT COUNT(*) FROM work_intervals WHERE source_id=? AND date=? AND state='WORK'",facts.sourceId,facts.date);
            if(count!=facts.orders.size()||aggregateCount!=1||intervalCount!=facts.deliveries.size())
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
