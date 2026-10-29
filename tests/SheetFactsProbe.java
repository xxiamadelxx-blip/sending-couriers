package ru.courier.finance;
import org.json.JSONObject;

/** Actual production parser, independently computed expected facts. */
public final class SheetFactsProbe {
    static void check(boolean v,String msg){if(!v)throw new AssertionError(msg);}
    static JSONObject row(Object... pairs) throws Exception {
        JSONObject o=new JSONObject();
        for(int i=0;i<pairs.length;i+=2)o.put(String.valueOf(pairs[i]),pairs[i+1]);
        return o;
    }
    public static void main(String[] ignored) throws Exception {
        JSONObject day=SheetFactNormalizer.normalize("Дневные итоги",row("A","2026-10-14","E","12","G","1200"));
        check("aggregate_order_counts".equals(day.getString("table")) && day.getInt("order_count")==12,"14 October is a count aggregate");
        JSONObject excelDate=SheetFactNormalizer.normalize("Дневные итоги",row("A",46255.0,"E",32));
        check("2026-08-21".equals(excelDate.getString("date")) && excelDate.getInt("order_count")==32,
            "real Google XLSX date serial 46255.0 must map to 21 Aug, not disappear");
        check(!day.has("reward_kopecks"),"whole slot sum is not order reward");
        JSONObject closing=SheetFactNormalizer.normalize("Финансовые факты",
            row("A","2026-10-15","B","Финальная доплата почасовой гарантии","C","22 376,00"));
        check("final_guarantee".equals(closing.getString("kind")) && closing.getLong("amount_kopecks")==2237600,"15 Oct closure is 2237600 kopecks, not a tip");
        check(SheetFactNormalizer.normalize("Финансовые факты",
            row("A","2026-10-15","B","Бонусы и корректировки","C","22376"))==null,"ambiguous category must await review");
        JSONObject park=SheetFactNormalizer.normalize("Финансовые факты",
            row("A","2026-09-14","B","Реальный бонус парка","C","3700"));
        check("park_bonus".equals(park.getString("kind")),"park income must not become Yandex 5 percent base");
        JSONObject snapshot=SheetFactNormalizer.normalize("Снимки периода",
            row("A","2026-10-19","B","16.10.2026–29.10.2026","C","57","D","90"));
        check(snapshot.getInt("orders")==90 && snapshot.getInt("accounted_hundredths")==5700,"snapshot 90 orders 57 counted hours");
        check("2026-10-16".equals(snapshot.getString("period_start")) &&
            "2026-10-29".equals(snapshot.getString("period_end")),"14 day period endpoints");
        check("date_only".equals(snapshot.getString("precision")),"unknown time must remain unknown");
        check(SheetFactNormalizer.normalize("Дневные итоги",row("A","2026-02-30","E","12"))==null,"invalid date");
        check(SheetFactNormalizer.normalize("Финансовые факты",
            row("A","2026-10-15","B","Вознаграждение","C","2,34,5"))==null,"no guess for malformed amount");
        check(SheetFactNormalizer.normalize("Заказы RAW",row("A","2026-10-18","C","18:57","E","100"))==null,"never fabricate individual orders");
        JSONObject oldForecast=SheetFactNormalizer.normalize("Прогнозы",
            row("A","2026-09-12","C","10:00–15:00","D",21,"E",16,"F",26,"J","CF_BASELINE_DOW_HOUR"));
        check("historical_forecasts".equals(oldForecast.getString("table")) &&
            oldForecast.getInt("center_orders")==21 &&
            "unverified_historical".equals(oldForecast.getString("source_status")),
            "historical forecast without publication evidence must not become published");
        check(!oldForecast.has("claimed_publication"),"missing publication time must stay NULL");
        JSONObject reconstructed=SheetFactNormalizer.normalize("Прогнозы",
            row("A","2026-10-19","C","день","D",33,
                "Q","2026-10-19 06:04:15 МСК (первичная публикация; восстановлено позже)",
                "R","CF_BASELINE_DOW_HOUR v1.0","T","Исходный прогноз восстановлен"));
        check("reconstructed_publication".equals(reconstructed.getString("source_status")),
            "a reconstructed timestamp is evidence of an archive, not prospective publication");
        JSONObject archivedRule=SheetFactNormalizer.normalize("Финансовые правила",
            row("A","Строка 900 ₽","B","НЕ ДОХОД","D","Жёсткое правило"));
        check("historical_rule_specs".equals(archivedRule.getString("table")) &&
            "Строка 900 ₽".equals(archivedRule.getString("rule_label")),
            "archived rule should not automatically affect financial calculations");
        JSONObject archivedModel=SheetFactNormalizer.normalize("Модели",
            row("A","CF_BASELINE_DOW_HOUR","B","АКТИВНАЯ","M","v1.0"));
        check("historical_model_specs".equals(archivedModel.getString("table")) &&
            "v1.0".equals(archivedModel.getString("declared_version")),
            "archive model description separately from trained model registry");
        check(SheetFactNormalizer.normalize("Прогнозы",
            row("A","2026-10-19","D","33.5"))==null,"fractional order counts cannot be rounded");
        System.out.println("PASS: M2 actual conservative Java normalization 14/15/19 Oct, unknowns, no invented RAW");
    }
}
