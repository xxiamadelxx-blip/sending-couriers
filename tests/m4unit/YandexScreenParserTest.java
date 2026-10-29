package ru.courier.finance;

import org.junit.Test;
import static org.junit.Assert.*;

public final class YandexScreenParserTest {
    @Test public void classifiesRussianOrdersScreenAndExtractsOrderDetailCandidates() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Заказ\nИтого\n123,45 ₽\nДетали\nСтатус\nЗавершён\n"
                +"Коэффициент спроса\n1.2\nНомер заказа\n123456-1234567\n"
                +"Начало\n2026.10.19 12:55\nЗавершение\n2026.10.19 13:03");
        assertEquals(YandexScreenParser.ScreenType.ORDERS,result.screenType);
        assertFalse(result.reviewRequired);
        YandexScreenParser.Candidate detail=find(result,"ORDER_DETAIL");
        assertNotNull(detail);
        assertEquals("123456-1234567",field(detail,"order_number"));
        assertEquals("12345",field(detail,"total_kopecks"));
        assertEquals("COMPLETED",field(detail,"status"));
        assertEquals("1.2",field(detail,"demand_coefficient"));
        assertEquals("2026-10-19T12:55",field(detail,"started_at"));
        assertEquals("2026-10-19T13:03",field(detail,"completed_at"));
        assertTrue(detail.toJson().contains("\"total_kopecks\":{\"type\":\"integer\",\"value\":12345}"));
    }

    @Test public void extractsSlotAndVisibleOrderRowsWithoutAddingUnseenOrders() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Слот: 900,00 ₽\n339533360\n17:59 — 22:00\n9 заказов · 12,33 км\nЗаказы\n900,00 ₽\n"
                +"18:18\nРесторан A\n100,00 ₽\nкоэф 1.0\n"
                +"19:26\nРесторан B\n100,00 ₽\nкоэф 1.0\n"
                +"Тип слота\nПлановый\nНачало\n2026.10.13 17:59\nЗавершение\n2026.10.13 22:04");
        assertEquals(YandexScreenParser.ScreenType.ORDERS,result.screenType);
        YandexScreenParser.Candidate slot=find(result,"SLOT_DETAIL");
        assertNotNull(slot);
        assertEquals("339533360",field(slot,"slot_id"));
        assertEquals("90000",field(slot,"slot_total_kopecks"));
        assertEquals("9",field(slot,"slot_order_count"));
        assertEquals("12.33",field(slot,"distance_km"));
        assertEquals("PLANNED",field(slot,"slot_type"));
        assertEquals("2026-10-13T17:59",field(slot,"started_at"));
        assertEquals("2026-10-13T22:04",field(slot,"completed_at"));
        assertEquals(2,count(result,"ORDER_LIST_ROW"));
        assertEquals("10000",field(find(result,"ORDER_LIST_ROW"),"amount_kopecks"));
    }

    @Test public void mergesPartialSlotObservationsBySlotId() {
        YandexScreenParser.Result summary=YandexScreenParser.parse(
            "Слот: 900,00 ₽\n339533360\n17:59 — 22:00\n9 заказов · 12,33 км");
        YandexScreenParser.Result details=YandexScreenParser.parse(
            "Слот: 900,00 ₽\n339533360\nТип слота Плановый\nСтатус Завершён\n"
                +"Начало 2026.10.13 17:59\nЗавершение 2026.10.13 22:04");
        java.util.List<VideoImportProcessor.Observation> observations=java.util.Arrays.asList(
            new VideoImportProcessor.Observation(0,0,"frame1","",0f,summary,null),
            new VideoImportProcessor.Observation(1,1500,"frame2","",0f,details,null));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,1500,observations,2);
        java.util.List<YandexScreenParser.Candidate> unique=video.uniqueCandidates();
        assertEquals(1,unique.size());
        YandexScreenParser.Candidate merged=unique.get(0);
        assertEquals("339533360",field(merged,"slot_id"));
        assertEquals("9",field(merged,"slot_order_count"));
        assertEquals("12.33",field(merged,"distance_km"));
        assertEquals("PLANNED",field(merged,"slot_type"));
        assertEquals("COMPLETED",field(merged,"status"));
        assertEquals("2026-10-13T17:59",field(merged,"started_at"));
        assertEquals("2026-10-13T22:04",field(merged,"completed_at"));
    }

    @Test public void parsesInlineTimeAndMoneyButIgnoresSlotTimeRangeAsAnOrder() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Слот: 900,00 ₽\nЗаказы\n12:34 100,00 ₽ коэф 1.0\n"
                +"Начало\n2026.10.13 18:00–22:00\n100,00 ₽");
        assertEquals(1,count(result,"ORDER_LIST_ROW"));
        YandexScreenParser.Candidate row=find(result,"ORDER_LIST_ROW");
        assertEquals("12:34",field(row,"order_time"));
        assertEquals("10000",field(row,"amount_kopecks"));
        assertEquals("1.0",field(row,"demand_coefficient"));
    }

    @Test public void extractsIncomeTotalsCommissionsTaxAndVisibleLedgerRowsInKopecks() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "День Неделя Месяц\n2 459,36 ₽\nВознаграждение 2 600 ₽\n"
                +"Комиссия партнёра -130 ₽\nНалог -10,64 ₽\n"
                +"11:00\nДругое\n1 615 ₽\n11:09\nДругое\n-4,76 ₽");
        assertEquals(YandexScreenParser.ScreenType.INCOME,result.screenType);
        YandexScreenParser.Candidate summary=find(result,"INCOME_SUMMARY");
        assertNotNull(summary);
        assertEquals("245936",field(summary,"total_kopecks"));
        assertEquals("260000",field(summary,"reward_kopecks"));
        assertEquals("-13000",field(summary,"partner_commission_kopecks"));
        assertEquals("-1064",field(summary,"tax_kopecks"));
        assertEquals("day|week|month",field(summary,"period_tabs_seen"));
        assertEquals(2,count(result,"INCOME_LINE"));
        assertEquals("161500",field(find(result,"INCOME_LINE"),"amount_kopecks"));
    }

    @Test public void keepsAmbiguousAndUnrelatedScreensInReviewQueue() {
        YandexScreenParser.Result yandex=YandexScreenParser.parse("Яндекс Про\nНастройки карты");
        YandexScreenParser.Result unrelated=YandexScreenParser.parse("Заметки\nвстреча завтра 18:30");
        assertEquals(YandexScreenParser.ScreenType.YANDEX_UNKNOWN,yandex.screenType);
        assertTrue(yandex.reviewRequired);
        assertTrue(yandex.candidates.isEmpty());
        assertEquals(YandexScreenParser.ScreenType.UNKNOWN,unrelated.screenType);
        assertTrue(unrelated.reviewRequired);
        assertTrue(unrelated.candidates.isEmpty());
    }

    @Test public void identifiesEmptyOcrAsUnknown() {
        YandexScreenParser.Result result=YandexScreenParser.parse("  \n ");
        assertEquals(YandexScreenParser.ScreenType.UNKNOWN,result.screenType);
        assertEquals("empty_ocr",result.reason);
        assertTrue(result.candidates.isEmpty());
    }

    @Test public void unlabeledHomeNumberIsNotTreatedAsAnImportedFact() {
        YandexScreenParser.Result result=YandexScreenParser.parse("Yandex Pro\nIncome today: 1250");
        assertEquals(YandexScreenParser.ScreenType.INCOME,result.screenType);
        // An unlabeled number on the home screen is not treated as a payment fact.
        result=YandexScreenParser.parse("Яндекс Про\nЗаказы сегодня: 18\nСумма 1 234,56 ₽");
        assertTrue(result.candidates.isEmpty());
    }

    private static YandexScreenParser.Candidate find(YandexScreenParser.Result result,String type) {
        for(YandexScreenParser.Candidate candidate:result.candidates)
            if(type.equals(candidate.candidateType)) return candidate;
        return null;
    }

    private static int count(YandexScreenParser.Result result,String type) {
        int count=0;
        for(YandexScreenParser.Candidate candidate:result.candidates)
            if(type.equals(candidate.candidateType)) count++;
        return count;
    }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        if(candidate==null) return null;
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }
}
