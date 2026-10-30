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

    @Test public void excludesAndroidStatusBarClocksFromOrderRows() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "00:35 @ © 00:47 LTE 11%\n< Слот: 3300,00 ₽\n341681811\n"
                +"18:57 100,00 ₽ >\nМагнит коэф 1.0");
        assertEquals(1,count(result,"ORDER_LIST_ROW"));
        assertEquals("18:57",field(find(result,"ORDER_LIST_ROW"),"order_time"));
    }

    @Test public void preservesTwoRealRowsWithIdenticalTimeAndAmountAcrossFrames() {
        String screen="Слот: 200,00 ₽\n339533360\n2 заказа\n"
            +"18:57 100,00 ₽ >\nМагазин A коэф 1.0\n"
            +"18:57 100,00 ₽ >\nМагазин B коэф 1.0";
        YandexScreenParser.Result parsed=YandexScreenParser.parse(screen);
        assertEquals(2,count(parsed,"ORDER_LIST_ROW"));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,3000,
            java.util.Arrays.asList(
                new VideoImportProcessor.Observation(0,0,"frame1",screen,1f,parsed,null),
                new VideoImportProcessor.Observation(1,1500,"frame2",screen,1f,parsed,null)),2);
        assertEquals(2,video.uniqueCandidateCount("ORDER_LIST_ROW"));
        int occurrences=0;
        for(YandexScreenParser.Candidate row:video.uniqueCandidates()) if("ORDER_LIST_ROW".equals(row.candidateType)) {
            String ordinal=field(row,"occurrence");
            assertTrue("1".equals(ordinal)||"2".equals(ordinal));
            occurrences+=Integer.parseInt(ordinal);
        }
        assertEquals(3,occurrences);
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

    @Test public void extractsScrollingOrderRowsWithoutAVisibleListHeading() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Яндекс Про\nЗаказы сегодня: 8\n18.22 Ресторан\n100,00 P\n"
                +"18:41 Кафе\n250,50 2");
        assertEquals(YandexScreenParser.ScreenType.ORDERS,result.screenType);
        assertEquals(2,count(result,"ORDER_LIST_ROW"));
        assertEquals("18:22",field(find(result,"ORDER_LIST_ROW"),"order_time"));
        assertEquals("10000",field(find(result,"ORDER_LIST_ROW"),"amount_kopecks"));
    }

    @Test public void acceptsAnOcrCurrencyDigitBeforeTheOrderChevron() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Яндекс Про\nЗаказы\n18:41 250,50 2 >\nКафе коэф 1.0");
        assertEquals(1,count(result,"ORDER_LIST_ROW"));
        assertEquals("25050",field(find(result,"ORDER_LIST_ROW"),"amount_kopecks"));

        result=YandexScreenParser.parse("Яндекс Про\nЗаказы\n18:42 250,502 >\nКафе коэф 1.0");
        assertEquals("25050",field(find(result,"ORDER_LIST_ROW"),"amount_kopecks"));

        YandexScreenParser.Result ambiguous=YandexScreenParser.parse(
            "Яндекс Про\nЗаказы\n18:41 250,50 20 >\nКафе коэф 1.0");
        assertEquals(0,count(ambiguous,"ORDER_LIST_ROW"));
    }

    @Test public void resolvesOneFrameMoneyMisreadByRepeatedFrameEvidence() {
        String slot="Слот: 3300,00 ₽\n341681811\n33 заказа · 34,43 км\n"
            +"Начало\n2026.10.18 07:30\nЗавершение\n2026.10.18 22:00";
        String wrong="Яндекс Про\nЗаказы\n21:11 3 100,00 P >\nТеремок коэф 1.0";
        String right="Яндекс Про\nЗаказы\n21:11 100,00 P >\nТеремок коэф 1.0";
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        observations.add(observation(0,"slot",slot));
        observations.add(observation(1,"wrong",wrong));
        observations.add(observation(2,"right-1",right));
        observations.add(observation(3,"right-2",right));
        observations.add(observation(4,"right-3",right));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,2000,observations,2);
        assertEquals(1,video.uniqueCandidateCount("ORDER_LIST_ROW"));
        assertEquals("10000",field(video.uniqueCandidates().get(0),"amount_kopecks"));
    }

    @Test public void recognizesSlotListWhenRussianLabelsAreTransliteratedByOcr() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "€ Cnor: 600,00P\n341681811\n© 07:30 — 22:00\n6 3aka3a + 10,0 KM\n"
                +"Utoro 600,00P\n10:38 100,00 P >\n10:49 100,00 P >\n11:05 100,00 P >\n"
                +"11:10 100,00 P >\n11:23 100,00 P >\n11:36 100,00 P >\n");
        assertEquals(YandexScreenParser.ScreenType.ORDERS,result.screenType);
        assertEquals(6,count(result,"ORDER_LIST_ROW"));
        YandexScreenParser.Candidate slot=find(result,"SLOT_DETAIL");
        assertNotNull(slot);
        assertEquals("341681811",field(slot,"slot_id"));
        assertEquals("6",field(slot,"slot_order_count"));
        assertEquals("60000",field(slot,"slot_total_kopecks"));
        assertEquals("10.0",field(slot,"distance_km"));
    }

    @Test public void consensusRemovesOneFrameTimeErrorsAndKeepsTwoSameMinuteOrders() {
        String slotScreen="Слот: 900,00 ₽\n341681811\n9 заказов · 10 км\n"
            +"Начало\n2026.10.18 07:30\nЗавершение\n2026.10.18 22:00\n";
        String prefix="Яндекс Про\nЗаказы\n";
        String stable=prefix+"13:08 100,00 ₽ >\n13:16 100,00 ₽ >\n13:27 100,00 ₽ >\n"
            +"18:57 100,00 ₽ >\n18:57 100,00 ₽ >\n21:11 100,00 ₽ >\n21:23 100,00 ₽ >\n"
            +"21:37 100,00 ₽ >\n21:57 100,00 ₽ >\n";
        String noisy=prefix+"13:08 100,00 ₽ >\n13:16 100,00 ₽ >\n12:27 100,00 ₽ >\n"
            +"18:57 100,00 ₽ >\n18:57 100,00 ₽ >\n21:11 100,00 ₽ >\n21:25 100,00 ₽ >\n"
            +"21:37 100,00 ₽ >\n21:57 100,00 ₽ >\n";
        YandexScreenParser.Result stableResult=YandexScreenParser.parse(stable);
        YandexScreenParser.Result noisyResult=YandexScreenParser.parse(noisy);
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        YandexScreenParser.Result slotResult=YandexScreenParser.parse(slotScreen);
        observations.add(new VideoImportProcessor.Observation(0,0,"slot",slotScreen,1f,slotResult,null));
        for(int i=0;i<4;i++) observations.add(new VideoImportProcessor.Observation(
            i+1,(i+1)*500,"stable-"+i,stable,1f,stableResult,null));
        observations.add(new VideoImportProcessor.Observation(5,2500,"noisy",noisy,0.6f,noisyResult,null));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,3000,observations,2);

        assertEquals(9,video.uniqueCandidateCount("ORDER_LIST_ROW"));
        java.util.Set<String> times=new java.util.HashSet<>();
        java.util.Map<String,Integer> sameMinute=new java.util.HashMap<>();
        long sum=0;
        for(YandexScreenParser.Candidate row:video.uniqueCandidates()) if("ORDER_LIST_ROW".equals(row.candidateType)) {
            times.add(field(row,"order_time"));
            sum+=Long.parseLong(field(row,"amount_kopecks"));
            if("18:57".equals(field(row,"order_time")))
                sameMinute.put(field(row,"occurrence"),1);
        }
        assertFalse(times.contains("12:27"));
        assertFalse(times.contains("21:25"));
        assertTrue(times.contains("13:27"));
        assertTrue(times.contains("21:23"));
        assertEquals(2,sameMinute.size());
        assertEquals(90000,sum);
    }

    @Test public void twoCloseRowsSeenTogetherAreNotMergedAsAnOcrError() {
        String screen="Слот: 200,00 ₽\n341681811\n2 заказа · 10 км\n"
            +"Начало\n2026.10.18 07:30\nЗавершение\n2026.10.18 22:00\nЗаказы\n"
            +"18:57 100,00 ₽ >\n18:59 100,00 ₽ >\n";
        YandexScreenParser.Result parsed=YandexScreenParser.parse(screen);
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        for(int i=0;i<4;i++) observations.add(new VideoImportProcessor.Observation(
            i,i*500,"near-"+i,screen,1f,parsed,null));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,2000,observations,1);
        assertEquals(2,video.uniqueCandidateCount("ORDER_LIST_ROW"));
    }

    @Test public void parsesInlineIncomeLabelsAndOcrCurrencyVariants() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Yandex Pro\nДоход\n2 459,36 P\n"
                +"Вознаграждение 2 600 P — Комиссия партнёра -130 P\nНалог -10,64 2");
        assertEquals(YandexScreenParser.ScreenType.INCOME,result.screenType);
        YandexScreenParser.Candidate summary=find(result,"INCOME_SUMMARY");
        assertNotNull(summary);
        assertEquals("245936",field(summary,"total_kopecks"));
        assertEquals("260000",field(summary,"reward_kopecks"));
        assertEquals("-13000",field(summary,"partner_commission_kopecks"));
        assertEquals("-1064",field(summary,"tax_kopecks"));

        YandexScreenParser.Result ambiguous=YandexScreenParser.parse(
            "Yandex Pro\nДоход\nВознаграждение 2 600 ₽\nКомиссия партнёра -130 2");
        assertNull(field(find(ambiguous,"INCOME_SUMMARY"),"partner_commission_kopecks"));
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

    private static VideoImportProcessor.Observation observation(int index,String id,String text) {
        return new VideoImportProcessor.Observation(index,index*500L,id,text,1f,YandexScreenParser.parse(text),null);
    }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        if(candidate==null) return null;
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }
}
