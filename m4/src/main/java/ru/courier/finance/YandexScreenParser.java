package ru.courier.finance;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Deterministic OCR parser. Extracted values remain review candidates, never finance facts. */
public final class YandexScreenParser {
    public static final String VERSION = "yandex-pro-video-extract-v6";

    public enum ScreenType { ORDERS, INCOME, ACTIVITY, YANDEX_UNKNOWN, UNKNOWN }

    public static final class Field {
        public final String name;
        public final String valueType;
        public final String value;

        Field(String name, String valueType, String value) {
            this.name=name; this.valueType=valueType; this.value=value;
        }
    }

    public static final class Candidate {
        public final String candidateType;
        public final List<Field> fields;
        /** Deterministic rule score for ordering review candidates; not a calibrated probability. */
        public final float ruleScore;

        Candidate(String candidateType, float ruleScore, List<Field> fields) {
            this.candidateType=candidateType; this.ruleScore=ruleScore;
            this.fields=Collections.unmodifiableList(new ArrayList<>(fields));
        }

        public String toJson() {
            StringBuilder json=new StringBuilder("{\"type\":");
            appendQuoted(json,candidateType);
            json.append(",\"rule_score\":").append(String.format(Locale.ROOT,"%.2f",ruleScore));
            json.append(",\"fields\":{");
            for(int i=0;i<fields.size();i++) {
                if(i>0) json.append(',');
                Field field=fields.get(i);
                appendQuoted(json,field.name); json.append(":{\"type\":"); appendQuoted(json,field.valueType);
                json.append(",\"value\":");
                if("integer".equals(field.valueType) || "decimal".equals(field.valueType)) json.append(field.value);
                else appendQuoted(json,field.value);
                json.append('}');
            }
            return json.append("}}").toString();
        }

        /** Stable, local deduplication key for repeated frames from one recording. */
        public String stableKey() { return candidateType+"\n"+toJson(); }

        /** Stable identity for combining partial observations of the same order or slot. */
        String mergeKey() {
            if("ORDER_LIST_ROW".equals(candidateType)) {
                String time=null,occurrence="1";
                for(Field field:fields) {
                    if("order_time".equals(field.name)) time=field.value;
                    else if("occurrence".equals(field.name)) occurrence=field.value;
                }
                if(time!=null) return candidateType+"\n"+time+"\n"+occurrence;
            }
            String identityField="SLOT_DETAIL".equals(candidateType)?"slot_id":
                ("ORDER_DETAIL".equals(candidateType)?"order_number":null);
            if(identityField==null) return stableKey();
            for(Field field:fields) if(identityField.equals(field.name)&&!field.value.isEmpty())
                return candidateType+"\n"+identityField+"\n"+field.value;
            if("ORDER_DETAIL".equals(candidateType)) {
                String started=null,completed=null,total=null;
                for(Field field:fields) {
                    if("started_at".equals(field.name)) started=field.value;
                    else if("completed_at".equals(field.name)) completed=field.value;
                    else if("total_kopecks".equals(field.name)) total=field.value;
                }
                if(started!=null||completed!=null)
                    return candidateType+"\ntime_pair\n"+String.valueOf(started)+"\n"
                        +String.valueOf(completed)+"\n"+String.valueOf(total);
            }
            return stableKey();
        }

        /** Combines non-conflicting fields while per-frame evidence remains stored separately. */
        Candidate mergeMissingFields(Candidate other) {
            if(other==null||!candidateType.equals(other.candidateType)) return this;
            LinkedHashMap<String,Field> merged=new LinkedHashMap<>();
            for(Field field:fields) merged.put(field.name,field);
            for(Field field:other.fields) {
                Field prior=merged.get(field.name);
                if(prior==null||other.ruleScore>ruleScore&&sameFieldValue(field.name,prior,field)) merged.put(field.name,field);
            }
            return new Candidate(candidateType,Math.max(ruleScore,other.ruleScore),new ArrayList<>(merged.values()));
        }

        private static boolean sameFieldValue(String name,Field a,Field b) {
            // OCR candidate values can conflict when a distant slot total was
            // mistakenly associated with a row. Keep the best-scored reading.
            return "amount_kopecks".equals(name)||"demand_coefficient".equals(name);
        }
    }

    public static final class Result {
        public final ScreenType screenType;
        public final boolean reviewRequired;
        public final String reason;
        public final List<Candidate> candidates;

        private Result(ScreenType screenType, boolean reviewRequired, String reason, List<Candidate> candidates) {
            this.screenType=screenType; this.reviewRequired=reviewRequired; this.reason=reason;
            this.candidates=Collections.unmodifiableList(new ArrayList<>(candidates));
        }
    }

    private static final Pattern CURRENCY_AMOUNT=Pattern.compile(
        "(?<![\\p{N}])([-+−–—]?\\s*(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,]\\d{1,2})?)\\s*(?:₽|руб(?:лей|ля)?\\.?|р\\.?|p)(?![\\p{L}])",
        Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
    private static final Pattern BARE_AMOUNT=Pattern.compile(
        "^\\s*([-+−]?\\s*(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,]\\d{1,2})?)\\s*$");
    // OCR can render the ruble glyph as one isolated digit after a decimal amount.
    // Accept this only in an already identified money label/row context.
    private static final Pattern BARE_AMOUNT_WITH_OCR_CURRENCY=Pattern.compile(
        "^\\s*([-+−–—]?\\s*(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)[.,]\\d{2})\\s+\\d\\s*$");
    private static final Pattern DECIMAL=Pattern.compile("(?<![\\p{L}\\p{N}])([0-9]{1,3}(?:[.,][0-9]{1,4})?)(?![\\p{L}\\p{N}])");
    private static final Pattern TIME_PREFIX=Pattern.compile("^\\s*[•·|>›]*\\s*([01]?\\d|2[0-3])[:.]([0-5]\\d)(?!\\d)(.*)$");
    private static final Pattern DATE_TIME=Pattern.compile("(?<!\\d)(20\\d{2})[./-](\\d{1,2})[./-](\\d{1,2})\\s+([0-2]?\\d):([0-5]\\d)(?!\\d)");
    private static final Pattern DAY_FIRST_DATE_TIME=Pattern.compile("(?<!\\d)(\\d{1,2})[./-](\\d{1,2})[./-](20\\d{2})\\s+([0-2]?\\d):([0-5]\\d)(?!\\d)");

    private YandexScreenParser() { }

    public static Result parse(String ocrText) {
        String[] lines=lines(ocrText);
        String text=normalize(ocrText);
        if(text.isEmpty()) return result(ScreenType.UNKNOWN,true,"empty_ocr",lines);

        boolean yandex=containsAny(text,"яндекс про","yandex pro","таксометр","заказы сегодня");
        boolean orders=containsAny(text,"заказ","orders","активные заказы");
        boolean slot=containsAny(text,"слот","тип слота","информация по слоту");
        boolean orderDetails=containsAny(text,"номер заказа","коэффициент спроса");
        boolean demandCoefficient=containsAny(text,"коэффициент спроса","коэф");
        boolean income=containsAny(text,"доход","заработано","выплата","income","earnings","вознаграждение");
        boolean incomeBreakdown=containsAny(text,"вознаграждение")&&containsAny(text,"комиссия партнера");
        boolean activity=containsAny(text,"на линии","активность","смена","online","activity");
        boolean repeatedOrderRows=countTimedMoneyRows(lines)>=3;

        ScreenType screen;
        String reason;
        if(orderDetails
            ||(orders&&(yandex||containsAny(text,"на линии","заказы сегодня")||slot))
            ||(slot&&(demandCoefficient||containsAny(text,"информация по слоту","тип слота")))
            ||(!income&&demandCoefficient&&repeatedOrderRows)) {
            screen=ScreenType.ORDERS; reason="order_screen_signature";
        } else if(income&&(yandex||incomeBreakdown)) {
            screen=ScreenType.INCOME; reason="income_screen_signature";
        } else if(activity&&yandex) {
            screen=ScreenType.ACTIVITY; reason="activity_screen_signature";
        } else if(yandex) {
            screen=ScreenType.YANDEX_UNKNOWN; reason="unclassified_yandex_screen";
        } else {
            screen=ScreenType.UNKNOWN; reason="unknown_screen_signature";
        }

        List<Candidate> candidates=new ArrayList<>();
        if(screen==ScreenType.ORDERS) {
            addOrderDetail(lines,candidates);
            String slotId=addSlotDetail(lines,candidates);
            addOrderRows(lines,slotId,candidates);
        } else if(screen==ScreenType.INCOME) {
            addIncomeSummary(lines,candidates);
            addIncomeRows(lines,candidates);
        }
        if(screen!=ScreenType.UNKNOWN&&screen!=ScreenType.YANDEX_UNKNOWN&&candidates.isEmpty())
            reason=screen==ScreenType.ORDERS?"order_screen_no_fields":"income_screen_no_fields";
        else if(!candidates.isEmpty()) reason=screen==ScreenType.ORDERS?"order_fields_extracted":"income_fields_extracted";
        return new Result(screen,screen==ScreenType.UNKNOWN||screen==ScreenType.YANDEX_UNKNOWN,reason,candidates);
    }

    private static Result result(ScreenType type,boolean review,String reason,String[] lines) {
        return new Result(type,review,reason,Collections.<Candidate>emptyList());
    }

    private static void addOrderDetail(String[] lines,List<Candidate> out) {
        if(!containsLine(lines,"номер заказа")&&!containsLine(lines,"коэффициент спроса")) return;
        String orderNumber=valueAfter(lines,"номер\\s+заказа");
        String total=valueAfter(lines,"итого");
        String status=valueAfter(lines,"статус");
        String coefficient=valueAfter(lines,"коэффициент\\s+спроса|коэф(?:ф)?\\.?(?:\\s+спроса)?");
        String started=valueAfter(lines,"начало|время\\s+начала");
        String completed=valueAfter(lines,"завершение|окончание|время\\s+завершения");

        CandidateBuilder candidate=new CandidateBuilder("ORDER_DETAIL",0.92f);
        addText(candidate,"order_number",extractOrderId(orderNumber));
        addText(candidate,"status",normalizeStatus(status));
        addMoney(candidate,"total_kopecks",parseLabeledMoney(total));
        addDecimal(candidate,"demand_coefficient",parseDecimal(coefficient));
        addDateTime(candidate,"started_at",parseDateTime(started));
        addDateTime(candidate,"completed_at",parseDateTime(completed));
        addIfPresent(out,candidate);
    }

    private static String addSlotDetail(String[] lines,List<Candidate> out) {
        if(!containsLine(lines,"слот")) return null;
        String header=valueAfter(lines,"слот");
        String type=valueAfter(lines,"тип\\s+слота");
        String status=valueAfter(lines,"статус");
        String started=valueAfter(lines,"начало|время\\s+начала");
        String completed=valueAfter(lines,"завершение|окончание|время\\s+завершения");
        String slotId=slotId(lines);
        Long amount=parseLabeledMoney(header);
        String orderCount=parseSlotOrderCount(lines);
        String distanceKm=parseDistanceKm(lines);

        CandidateBuilder candidate=new CandidateBuilder("SLOT_DETAIL",0.90f);
        addText(candidate,"slot_id",slotId);
        addMoney(candidate,"slot_total_kopecks",amount);
        addInteger(candidate,"slot_order_count",orderCount);
        addDecimal(candidate,"distance_km",distanceKm);
        addText(candidate,"slot_type",normalizeSlotType(type));
        addText(candidate,"status",normalizeStatus(status));
        addDateTime(candidate,"started_at",parseDateTime(started));
        addDateTime(candidate,"completed_at",parseDateTime(completed));
        addIfPresent(out,candidate);
        return slotId;
    }

    private static void addOrderRows(String[] lines,String slotId,List<Candidate> out) {
        java.util.Map<String,Integer> occurrences=new java.util.HashMap<>();
        for(int i=0;i<lines.length;i++) {
            // The Android status bar starts with the device clock and may contain
            // a second clock from a screen recording. Never join it to the slot
            // summary amount on the next OCR line and misread it as an order.
            if(i==0&&countClockTokens(lines[i])>=2) continue;
            Matcher time=TIME_PREFIX.matcher(lines[i]);
            if(!time.matches()) continue;
            if(time.group(3).trim().matches("^[-–—].*")) continue;
            // Strip the clock first so "12:34 100 ₽" cannot be misread as "34 100 ₽".
            Long amount=parseRowMoney(time.group(3)); String coefficient=null;
            int amountDistance=amount==null?Integer.MAX_VALUE:0;
            if(normalize(lines[i]).contains("коэф")) coefficient=parseDecimal(valueAfterInline(lines[i],".*?коэф(?:ф)?\\.?(?:\\s+спроса)?"));
            for(int j=i+1;j<lines.length&&j<=i+3;j++) {
                if(TIME_PREFIX.matcher(lines[j]).matches()||isSectionBoundary(lines[j])) break;
                if(amount==null) { amount=parseRowMoney(lines[j]); if(amount!=null) amountDistance=j-i; }
                if(coefficient==null&&normalize(lines[j]).startsWith("коэф"))
                    coefficient=parseDecimal(valueAfterInline(lines[j],"коэф(?:ф)?\\.?(?:\\s+спроса)?"));
                if(amount!=null&&coefficient!=null) break;
            }
            if(amount==null) continue;
            String normalizedTime=two(time.group(1))+":"+time.group(2);
            String occurrenceKey=String.valueOf(slotId)+"\n"+normalizedTime;
            int occurrence=occurrences.containsKey(occurrenceKey)?occurrences.get(occurrenceKey)+1:1;
            occurrences.put(occurrenceKey,occurrence);
            CandidateBuilder candidate=new CandidateBuilder("ORDER_LIST_ROW",amountDistance==0?0.94f:0.84f);
            candidate.add("order_time","time",normalizedTime);
            addMoney(candidate,"amount_kopecks",amount);
            addDecimal(candidate,"demand_coefficient",coefficient);
            addText(candidate,"slot_id",slotId);
            candidate.add("occurrence","integer",String.valueOf(occurrence));
            addIfPresent(out,candidate);
        }
    }

    private static int countTimedMoneyRows(String[] lines) {
        int count=0;
        for(int i=0;i<lines.length;i++) {
            if(i==0&&countClockTokens(lines[i])>=2) continue;
            Matcher time=TIME_PREFIX.matcher(lines[i]);
            if(!time.matches()||time.group(3).trim().matches("^[-–—].*")) continue;
            Long amount=parseRowMoney(time.group(3));
            for(int j=i+1;amount==null&&j<lines.length&&j<=i+3;j++) {
                if(TIME_PREFIX.matcher(lines[j]).matches()||isSectionBoundary(lines[j])) break;
                amount=parseRowMoney(lines[j]);
            }
            if(amount!=null) count++;
        }
        return count;
    }

    private static int countClockTokens(String line) {
        Matcher matcher=Pattern.compile("(?<!\\d)(?:[01]?\\d|2[0-3])[:.]([0-5]\\d)(?!\\d)").matcher(line==null?"":line);
        int count=0;
        while(matcher.find()) count++;
        return count;
    }

    private static void addIncomeSummary(String[] lines,List<Candidate> out) {
        CandidateBuilder candidate=new CandidateBuilder("INCOME_SUMMARY",0.80f);
        String periods=periodsSeen(lines);
        addText(candidate,"period_tabs_seen",periods);

        Long total=null;
        Pattern rewardLabel=Pattern.compile("вознаграждение|earnings?",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
        for(String line:lines) {
            Matcher reward=rewardLabel.matcher(line);
            boolean hasReward=reward.find();
            String beforeReward=hasReward?line.substring(0,reward.start()):line;
            total=parseCurrencyMoney(beforeReward);
            if(total==null&&!hasReward) total=parseCurrencyMoney(line);
            if(total!=null||hasReward) break;
        }
        addMoney(candidate,"total_kopecks",total);
        addMoney(candidate,"reward_kopecks",parseLabeledMoney(valueAfterAnywhere(lines,"вознаграждение|earnings?")));
        addMoney(candidate,"partner_commission_kopecks",parseLabeledMoney(valueAfterAnywhere(lines,"комиссия\\s+партн(?:е|ё)ра|partner\\s+commission")));
        addMoney(candidate,"tax_kopecks",parseLabeledMoney(valueAfterAnywhere(lines,"налог|tax")));
        addIfPresent(out,candidate);
    }

    private static void addIncomeRows(String[] lines,List<Candidate> out) {
        for(int i=0;i<lines.length;i++) {
            Matcher time=TIME_PREFIX.matcher(lines[i]);
            if(!time.matches()) continue;
            if(time.group(3).trim().matches("^[-–—].*")) continue;
            // Strip the clock before money parsing for the same HH:MM/thousands ambiguity.
            Long amount=parseRowMoney(time.group(3));
            for(int j=i+1;j<lines.length&&j<=i+3;j++) {
                if(TIME_PREFIX.matcher(lines[j]).matches()) break;
                if(amount==null) amount=parseRowMoney(lines[j]);
                if(amount!=null) break;
            }
            if(amount==null) continue;
            CandidateBuilder candidate=new CandidateBuilder("INCOME_LINE",0.74f);
            candidate.add("entry_time","time",two(time.group(1))+":"+time.group(2));
            addMoney(candidate,"amount_kopecks",amount);
            addIfPresent(out,candidate);
        }
    }

    private static String[] lines(String text) {
        if(text==null) return new String[0];
        String[] raw=Normalizer.normalize(text,Normalizer.Form.NFKC).replace('\r','\n').split("\\n");
        List<String> result=new ArrayList<>();
        for(String line:raw) {
            String clean=line.replaceAll("[\\t ]+"," ").trim();
            if(!clean.isEmpty()) result.add(clean);
        }
        return result.toArray(new String[result.size()]);
    }

    private static String valueAfter(String[] lines,String labelRegex) {
        Pattern label=Pattern.compile("^\\s*(?:"+labelRegex+")\\s*[:：]?\\s*(.*?)\\s*$",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
        for(int i=0;i<lines.length;i++) {
            Matcher matcher=label.matcher(lines[i]);
            if(!matcher.matches()) continue;
            String value=matcher.group(1).trim();
            if(!value.isEmpty()) return value;
            if(i+1<lines.length) return lines[i+1].trim();
        }
        return null;
    }

    private static String valueAfterAnywhere(String[] lines,String labelRegex) {
        Pattern label=Pattern.compile("(?:^|\\s)(?:"+labelRegex+")\\s*[:：]?\\s*(.*?)\\s*$",
            Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
        for(int i=0;i<lines.length;i++) {
            Matcher matcher=label.matcher(lines[i]);
            if(!matcher.find()) continue;
            String value=matcher.group(1).trim();
            if(!value.isEmpty()) return value;
            if(i+1<lines.length) return lines[i+1].trim();
        }
        return null;
    }

    private static String valueAfterInline(String line,String labelRegex) {
        Matcher matcher=Pattern.compile("^\\s*(?:"+labelRegex+")\\s*[:：]?\\s*(.*?)\\s*$",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE).matcher(line);
        return matcher.matches()?matcher.group(1).trim():null;
    }

    private static boolean containsLine(String[] lines,String needle) {
        String normalizedNeedle=normalize(needle);
        for(String line:lines) if(normalize(line).contains(normalizedNeedle)) return true;
        return false;
    }

    private static boolean isSectionBoundary(String line) {
        String value=normalize(line);
        return value.equals("итого")||value.equals("детали")||value.equals("статус")
            ||value.startsWith("номер заказа")||value.startsWith("начало")||value.startsWith("завершение")
            ||value.startsWith("тип слота")||value.startsWith("слот ");
    }

    private static String slotId(String[] lines) {
        for(int i=0;i<lines.length;i++) {
            if(!normalize(lines[i]).matches("^слот(?:\\s.*)?$")) continue;
            if(i+1<lines.length&&lines[i+1].matches("\\s*\\d{6,12}\\s*")) return lines[i+1].trim();
            Matcher sameLine=Pattern.compile("(?<!\\d)(\\d{6,12})(?!\\d)").matcher(lines[i]);
            if(sameLine.find()) return sameLine.group(1);
        }
        return null;
    }

    private static String parseSlotOrderCount(String[] lines) {
        Pattern count=Pattern.compile("(?<!\\d)(\\d{1,4})\\s+заказ(?:а|ов)?(?![\\p{L}])",
            Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
        for(String line:lines) {
            Matcher matcher=count.matcher(line);
            if(matcher.find()) return matcher.group(1);
        }
        return null;
    }

    private static String parseDistanceKm(String[] lines) {
        Pattern distance=Pattern.compile("(?<!\\d)(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(?:км|km)(?![\\p{L}])",
            Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
        for(String line:lines) {
            Matcher matcher=distance.matcher(line);
            if(matcher.find()) return matcher.group(1).replace(',','.');
        }
        return null;
    }

    private static String extractOrderId(String value) {
        if(value==null) return null;
        Matcher matcher=Pattern.compile("(?<!\\d)(\\d{6,}(?:[-–]\\d{4,})?)(?!\\d)").matcher(value);
        return matcher.find()?matcher.group(1).replace('–','-'):null;
    }

    private static String normalizeStatus(String value) {
        if(value==null) return null;
        String normalized=normalize(value);
        if(normalized.contains("заверш")||normalized.contains("выполн")||normalized.contains("completed")) return "COMPLETED";
        if(normalized.contains("отмен")||normalized.contains("cancel")) return "CANCELLED";
        if(normalized.contains("ожида")||normalized.contains("пути")||normalized.contains("progress")) return "IN_PROGRESS";
        return "UNKNOWN";
    }

    private static String normalizeSlotType(String value) {
        if(value==null) return null;
        String normalized=normalize(value);
        if(normalized.contains("планов")||normalized.contains("planned")) return "PLANNED";
        if(normalized.contains("свобод")||normalized.contains("free")) return "FREE";
        return "OTHER";
    }

    private static Long parseLabeledMoney(String value) {
        if(value==null) return null;
        Long withCurrency=parseCurrencyMoney(value);
        if(withCurrency!=null) return withCurrency;
        Matcher bare=BARE_AMOUNT.matcher(value);
        if(bare.matches()) return toKopecks(bare.group(1));
        Matcher ocrCurrency=BARE_AMOUNT_WITH_OCR_CURRENCY.matcher(value);
        return ocrCurrency.matches()?toKopecks(ocrCurrency.group(1)):null;
    }

    private static Long parseRowMoney(String value) {
        return parseLabeledMoney(value);
    }

    private static Long parseCurrencyMoney(String value) {
        if(value==null) return null;
        Matcher matcher=CURRENCY_AMOUNT.matcher(value);
        return matcher.find()?toKopecks(matcher.group(1)):null;
    }

    private static Long toKopecks(String amount) {
        try {
            String normalized=amount.replace(" ","").replace("\u00a0","").replace("\u202f","")
                .replace("−","-").replace("–","-").replace("—","-").replace(',','.');
            return new BigDecimal(normalized).setScale(2,RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
        } catch(Exception ignored) { return null; }
    }

    private static String parseDecimal(String value) {
        if(value==null) return null;
        Matcher matcher=DECIMAL.matcher(value.replace(',','.'));
        return matcher.find()?matcher.group(1):null;
    }

    private static String parseDateTime(String value) {
        if(value==null) return null;
        Matcher ymd=DATE_TIME.matcher(value);
        if(ymd.find()) return ymd.group(1)+"-"+two(ymd.group(2))+"-"+two(ymd.group(3))+"T"+two(ymd.group(4))+":"+ymd.group(5);
        Matcher dmy=DAY_FIRST_DATE_TIME.matcher(value);
        if(dmy.find()) return dmy.group(3)+"-"+two(dmy.group(2))+"-"+two(dmy.group(1))+"T"+two(dmy.group(4))+":"+dmy.group(5);
        return null;
    }

    private static String periodsSeen(String[] lines) {
        String all=normalize(join(lines));
        List<String> found=new ArrayList<>();
        if(containsAny(all,"день","day")) found.add("day");
        if(containsAny(all,"неделя","week")) found.add("week");
        if(containsAny(all,"месяц","month")) found.add("month");
        if(found.isEmpty()) return null;
        StringBuilder value=new StringBuilder();
        for(String item:found) { if(value.length()>0)value.append('|'); value.append(item); }
        return value.toString();
    }

    private static String join(String[] lines) {
        StringBuilder text=new StringBuilder();
        for(String line:lines) { if(text.length()>0) text.append(' '); text.append(line); }
        return text.toString();
    }

    private static void addMoney(CandidateBuilder candidate,String name,Long value) {
        if(value!=null) candidate.add(name,"integer",String.valueOf(value));
    }
    private static void addInteger(CandidateBuilder candidate,String name,String value) {
        if(value!=null) candidate.add(name,"integer",value);
    }
    private static void addDecimal(CandidateBuilder candidate,String name,String value) {
        if(value!=null) candidate.add(name,"decimal",value);
    }
    private static void addText(CandidateBuilder candidate,String name,String value) {
        if(value!=null&&!value.trim().isEmpty()) candidate.add(name,"text",value.trim());
    }
    private static void addDateTime(CandidateBuilder candidate,String name,String value) {
        if(value!=null) candidate.add(name,"datetime",value);
    }
    private static void addIfPresent(List<Candidate> out,CandidateBuilder candidate) {
        if(candidate.fields.isEmpty()) return;
        Candidate built=candidate.build();
        for(Candidate prior:out) if(prior.stableKey().equals(built.stableKey())) return;
        out.add(built);
    }

    private static String two(String value) { return value.length()==1?"0"+value:value; }

    private static String normalize(String value) {
        if(value==null) return "";
        return Normalizer.normalize(value,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replace('ё','е')
            .replaceAll("[^\\p{L}\\p{N}]+"," ").trim();
    }

    private static boolean containsAny(String text,String... needles) {
        for(String needle:needles) if(text.contains(needle)) return true;
        return false;
    }

    private static void appendQuoted(StringBuilder out,String value) {
        out.append('"');
        for(int i=0;i<value.length();i++) {
            char c=value.charAt(i);
            if(c=='"'||c=='\\') out.append('\\').append(c);
            else if(c=='\n') out.append("\\n");
            else if(c=='\r') out.append("\\r");
            else if(c=='\t') out.append("\\t");
            else if(c<0x20) out.append(String.format(Locale.ROOT,"\\u%04x",(int)c));
            else out.append(c);
        }
        out.append('"');
    }

    private static final class CandidateBuilder {
        final String type;
        final float score;
        final List<Field> fields=new ArrayList<>();
        CandidateBuilder(String type,float score) { this.type=type; this.score=score; }
        void add(String name,String valueType,String value) { fields.add(new Field(name,valueType,value)); }
        Candidate build() { return new Candidate(type,score,fields); }
    }
}
