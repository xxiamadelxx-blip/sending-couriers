package ru.courier.finance;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/** Conservative mappings from verified sheet fields, never fabricated raw orders. */
public final class SheetFactNormalizer {
    private SheetFactNormalizer() {}

    private static String cell(JSONObject row, String column) {
        Object value=row.opt(column);
        if(value==null||value==JSONObject.NULL||value instanceof JSONObject)return null;
        String s=String.valueOf(value).trim();
        return s.isEmpty()?null:s;
    }
    private static String iso(String value) {
        if(value==null)return null;
        try {
            // Google Sheets exports date-formatted cells as Excel serial numbers.
            // This is an explicitly dated column; require an exact whole day.
            if(value.matches("\\d{5}(?:\\.0+)?")) {
                int serial=new BigDecimal(value).intValueExact();
                LocalDate date=LocalDate.of(1899,12,30).plusDays(serial);
                if(date.getYear()<2020 || date.getYear()>2100)return null;
                return date.toString();
            }
            if(value.matches("\\d{4}-\\d{2}-\\d{2}"))
                return LocalDate.parse(value).toString();
            return LocalDate.parse(value,DateTimeFormatter.ofPattern("d.M.uuuu",Locale.ROOT)
                .withResolverStyle(ResolverStyle.STRICT)).toString();
        } catch(Exception invalid) {return null;}
    }
    private static Integer whole(String raw) {
        if(raw==null)return null;
        String s=raw.replaceAll("[\\s\\u00a0\\u202f]","").replace(',','.');
        if(!s.matches("\\d+(?:\\.0+)?"))return null;
        try {int result=new BigDecimal(s).intValueExact();return result>=0?result:null;}
        catch(Exception ignored){return null;}
    }
    private static Integer hoursHundredths(String raw) {
        if(raw==null)return null;
        String s=raw.replaceAll("[\\s\\u00a0\\u202f]","").replace(',','.');
        if(!s.matches("\\d+(?:\\.\\d{1,2})?"))return null;
        try {
            int h=new BigDecimal(s).movePointRight(2).setScale(0,RoundingMode.UNNECESSARY).intValueExact();
            return h>=0?h:null;
        }catch(Exception ignored){return null;}
    }
    private static Long kopecks(String raw) {
        if(raw==null)return null;
        String s=raw.replaceAll("[\\s\\u00a0\\u202f]","").replace(',','.');
        if(!s.matches("-?\\d+(?:\\.\\d{1,2})?"))return null;
        try {return new BigDecimal(s).movePointRight(2).setScale(0,RoundingMode.UNNECESSARY).longValueExact();}
        catch(Exception ignored){return null;}
    }

    /**
     * Return a fully grounded normalized row, or NULL when the evidence cannot
     * justify one. Caller still keeps the original sheet row in all cases.
     */
    public static JSONObject normalize(String sheet, JSONObject row) throws Exception {
        if("Дневные итоги".equals(sheet)) {
            String date=iso(cell(row,"A"));Integer orders=whole(cell(row,"E"));
            if(date==null||orders==null)return null;
            return new JSONObject().put("table","aggregate_order_counts")
                .put("date",date).put("order_count",orders)
                .put("confidence","reported_sheet");
            // Column G is the whole slot amount, NEVER automatically reward.
        }
        if("Финансовые факты".equals(sheet)) {
            String date=iso(cell(row,"A")),type=cell(row,"B");
            Long amount=kopecks(cell(row,"C"));
            if(date==null||type==null||amount==null)return null;
            String key=type.toLowerCase(Locale.ROOT),kind;
            if(key.startsWith("финальная доплата почасовой гарантии"))kind="final_guarantee";
            else if(key.equals("вознаграждение"))kind="reward";
            else if(key.equals("чаевые"))kind="tip";
            else if(key.equals("комиссия партнёра"))kind="park_commission";
            else if(key.equals("налог"))kind="tax";
            else if(key.equals("реальный бонус парка")||key.equals("бонус парка"))kind="park_bonus";
            else return null; // "Бонусы и корректировки" is ambiguous.
            return new JSONObject().put("table","financial_ledger")
                .put("date",date).put("kind",kind).put("amount_kopecks",amount)
                .put("confidence","reported_sheet");
            // No automatic addition to the Home total; confirmed closure wins later.
        }
        if("Прогнозы".equals(sheet)) {
            String target=iso(cell(row,"A"));
            if(target==null)return null;
            String[] columns={"D","E","F"};
            Integer[] counts=new Integer[columns.length];
            for(int i=0;i<columns.length;i++) {
                String original=cell(row,columns[i]);
                counts[i]=whole(original);
                // An invalid count remains only in the raw source archive.
                if(original!=null && counts[i]==null)return null;
            }
            if(counts[0]==null)return null;
            if(counts[1]!=null && counts[1]>counts[0])return null;
            if(counts[2]!=null && counts[2]<counts[0])return null;
            String publication=cell(row,"Q");
            String note=cell(row,"T");
            boolean reconstructed=(publication!=null && publication.toLowerCase(Locale.ROOT).contains("восстанов"))
                || (note!=null && note.toLowerCase(Locale.ROOT).contains("восстанов"));
            JSONObject result=new JSONObject().put("table","historical_forecasts")
                .put("target_date",target).put("center_orders",counts[0])
                .put("source_status",reconstructed?"reconstructed_publication":"unverified_historical");
            String label=cell(row,"C"); if(label!=null)result.put("window_label",label);
            if(counts[1]!=null)result.put("lower_orders",counts[1]);
            if(counts[2]!=null)result.put("upper_orders",counts[2]);
            if(publication!=null)result.put("claimed_publication",publication);
            String model=cell(row,"R");
            if(model==null)model=cell(row,"J");
            if(model!=null)result.put("claimed_model",model);
            // Claimed time is NOT a reliable training cutoff or proof of
            // prospective publication. Do not populate forecast_snapshots here.
            return result;
        }
        if("Финансовые правила".equals(sheet)) {
            String name=cell(row,"A");
            if(name==null)return null;
            JSONObject result=new JSONObject().put("table","historical_rule_specs")
                .put("rule_label",name).put("source_status","declared_archive");
            String rule=cell(row,"B");if(rule!=null)result.put("rule_text",rule);
            return result;
        }
        if("Модели".equals(sheet)) {
            String model=cell(row,"A");
            if(model==null)return null;
            JSONObject result=new JSONObject().put("table","historical_model_specs")
                .put("model_label",model).put("source_status","declared_archive");
            String state=cell(row,"B"),version=cell(row,"M");
            if(state!=null)result.put("model_state",state);
            if(version!=null)result.put("declared_version",version);
            return result;
        }
        if("Снимки периода".equals(sheet)) {
            String seen=iso(cell(row,"A")),range=cell(row,"B");
            if(seen==null||range==null)return null;
            Matcher m=Pattern.compile("^(\\d{1,2}\\.\\d{1,2}\\.\\d{4})\\s*[–—-]\\s*(\\d{1,2}\\.\\d{1,2}\\.\\d{4})$").matcher(range);
            if(!m.matches())return null;
            String start=iso(m.group(1)),end=iso(m.group(2));
            if(start==null||end==null||start.compareTo(end)>0)return null;
            Integer hours=hoursHundredths(cell(row,"C")),orders=whole(cell(row,"D"));
            if(hours==null&&orders==null)return null;
            JSONObject result=new JSONObject().put("table","period_snapshots")
                .put("period_start",start).put("period_end",end)
                .put("seen_at",seen).put("precision","date_only");
            if(hours!=null)result.put("accounted_hundredths",hours);
            if(orders!=null)result.put("orders",orders);
            return result;
        }
        return null;
    }
}
