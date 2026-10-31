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

    @Test public void keepsOrderCardsShownSlowlyAndBrieflyAtDifferentFrameRates() {
        String slowCard="Заказ\nИтого\n100,00 ₽\nДетали\nСтатус\nЗавершён\n"
            +"Коэффициент спроса\n1.0\nНомер заказа\n123456-1234567\n"
            +"Начало\n2026.10.18 10:30\nЗавершение\n2026.10.18 10:38";
        String briefCard="Заказ\nИтого\n100,00 ₽\nДетали\nСтатус\nЗавершён\n"
            +"Коэффициент спроса\n1.0\nНомер заказа\n765432-7654321\n"
            +"Начало\n2026.10.18 10:39\nЗавершение\n2026.10.18 10:41";
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        YandexScreenParser.Result slow=YandexScreenParser.parse(slowCard);
        YandexScreenParser.Result brief=YandexScreenParser.parse(briefCard);
        for(int i=0;i<8;i++)
            observations.add(new VideoImportProcessor.Observation(i,i*250L,"slow-frame-"+i,slowCard,1f,slow,null));
        observations.add(new VideoImportProcessor.Observation(8,2000L,"brief-frame",briefCard,1f,brief,null));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,2250,observations,9);
        assertEquals(2,video.uniqueCandidateCount("ORDER_DETAIL"));
        java.util.Set<String> orderNumbers=new java.util.HashSet<>();
        for(YandexScreenParser.Candidate detail:video.uniqueCandidates())
            if("ORDER_DETAIL".equals(detail.candidateType)) orderNumbers.add(field(detail,"order_number"));
        assertEquals(new java.util.HashSet<>(java.util.Arrays.asList("123456-1234567","765432-7654321")),orderNumbers);
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

    @Test public void pairsListTimesAndAmountsByHocrRowCoordinates() {
        String text="Слот: 300,00 ₽\n341681811\nЗаказы\n10:00\n10:30\n20:340\n100,00 ₽\n100,00 ₽\n100,00 ₽";
        String hocr="<div class='ocr_page' title='image \"screen.png\"; bbox 0 0 720 1608; ppageno 0'>"
            +"<span class='ocr_line'>"+hocrWord("10:00",15,260,87,282)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("100,00",546,261,633,285)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("10:30",15,384,87,406)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("100,00",546,385,633,409)+hocrWord("2",640,394,650,396)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("20:340",15,508,124,532)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("100,00",546,509,633,533)+"</span>"
            +"</div>";
        YandexScreenParser.Result result=YandexScreenParser.parse(text,hocr);
        assertEquals(3,count(result,"ORDER_LIST_ROW"));
        java.util.List<YandexScreenParser.Candidate> rows=byType(result,"ORDER_LIST_ROW");
        assertEquals("10:00",field(rows.get(0),"order_time"));
        assertEquals("10:30",field(rows.get(1),"order_time"));
        assertEquals("20:34",field(rows.get(2),"order_time"));
        for(YandexScreenParser.Candidate row:rows) assertEquals("10000",field(row,"amount_kopecks"));
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
        assertEquals("10000",field(find(video.uniqueCandidates(),"ORDER_LIST_ROW"),"amount_kopecks"));
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

    @Test public void dropsOneWeakExtraRowOnlyWhenSlotCountAndTotalBothMatch() {
        String slot="Слот: 300,00 ₽\n341681811\n3 заказа · 3 км\n"
            +"Начало\n2026.10.18 07:30\nЗавершение\n2026.10.18 22:00";
        String stable="Яндекс Про\nЗаказы\n10:00 100,00 ₽ >\n10:30 100,00 ₽ >\n10:50 100,00 ₽ >";
        String noisy="Яндекс Про\nЗаказы\n10:00 100,00 ₽ >\n10:30 100,00 ₽ >\n"
            +"10:49 100,00 ₽ >\n10:50 100,00 ₽ >";
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        observations.add(observation(0,"slot",slot));
        for(int i=0;i<3;i++) observations.add(observation(i+1,"stable-"+i,stable));
        observations.add(observation(4,"one-frame-ocr-variant",noisy));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,3000,observations,4);
        assertEquals(3,video.uniqueCandidateCount("ORDER_LIST_ROW"));
        java.util.Set<String> times=new java.util.HashSet<>(); long amount=0;
        for(YandexScreenParser.Candidate row:video.uniqueCandidates()) if("ORDER_LIST_ROW".equals(row.candidateType)) {
            times.add(field(row,"order_time"));amount+=Long.parseLong(field(row,"amount_kopecks"));
        }
        assertEquals(new java.util.HashSet<>(java.util.Arrays.asList("10:00","10:30","10:50")),times);
        assertEquals(30000,amount);
    }

    @Test public void readsSlotTotalWhenHeaderCurrencyIsAnOcrDigit() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "< Слот: 900,002\n339533360\n17:59 — 22:00\n9 заказов · 12,33 км\n"
            +"Итого\n900,00 P\nИнформация по слоту\n"
            +"Начало\n2026.10.13 17:59\nЗавершение\n2026.10.13 22:00");
        YandexScreenParser.Candidate slot=find(result,"SLOT_DETAIL");
        assertNotNull(slot);
        assertEquals("339533360",field(slot,"slot_id"));
        assertEquals("90000",field(slot,"slot_total_kopecks"));
        assertEquals("9",field(slot,"slot_order_count"));
    }

    @Test public void extractsOrderSubtotalAndTipsFromHocrWhenCurrencyGlyphsAreCorrupted() {
        String text="Слот: 2970,00P\n341228517\n07:30 — 22:00\n29 заказов\n"
            +"Итого 2970,00 P\nЧаевые 70,00 P\nЗаказы 2900,00? м\n"
            +"Тип слота Плановый\nНачало 2026.10.17 07:30\nЗавершение 2026.10.17 22:00";
        String hocr="<div class='ocr_page' title='image \"screen.png\"; bbox 0 0 720 1608; ppageno 0'>"
            +"<span class='ocr_line'>"+hocrWord("Чаевые",31,602,127,626)+hocrWord("70,00",568,602,637,626)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("Заказы",31,732,124,756)+hocrWord("2900,002",503,732,638,756)+"</span>"
            +"</div>";
        YandexScreenParser.Candidate slot=find(YandexScreenParser.parse(text,hocr),"SLOT_DETAIL");
        assertNotNull(slot);
        assertEquals("297000",field(slot,"slot_total_kopecks"));
        assertEquals("290000",field(slot,"slot_order_total_kopecks"));
        assertEquals("7000",field(slot,"slot_tips_kopecks"));
    }

    @Test public void doesNotTreatFirstListRowBelowOrdersHeadingAsSlotSubtotal() {
        String text="Слот: 3300,00 ₽\n341234567\n33 заказа · 0 км\nЗаказы\n12:01 100,00 ₽";
        String hocr="<div class='ocr_page' title='image \"screen.png\"; bbox 0 0 720 1608; ppageno 0'>"
            +"<span class='ocr_line'>"+hocrWord("Заказы",31,300,124,330)+"</span>"
            +"<span class='ocr_line'>"+hocrWord("12:01",31,339,110,369)+hocrWord("100,00",503,339,638,369)+"</span>"
            +"</div>";
        YandexScreenParser.Candidate slot=find(YandexScreenParser.parse(text,hocr),"SLOT_DETAIL");
        assertNotNull(slot);
        assertNull("a list row is not a labeled slot subtotal",field(slot,"slot_order_total_kopecks"));
    }

    @Test public void extractsOrderDetailAmountWhenOcrAddsCurrencyDigitAndLabelNoise() {
        String text="Заказ\nИтого 100,002 м\nДетали\nСтатус Завершён\nКоэффициент спроса 1.0\n"
            +"Номер заказа 261017-1234567\nНачало 2026.10.17 11:12\nЗавершение 2026.10.17 11:20";
        String hocr="<div class='ocr_page' title='image \"screen.png\"; bbox 0 0 720 1608; ppageno 0'>"
            +"<span class='ocr_line'>"+hocrWord("Итого",31,519,107,543)+hocrWord("100,002",524,519,638,543)+"</span>"
            +"</div>";
        YandexScreenParser.Candidate detail=find(YandexScreenParser.parse(text,hocr),"ORDER_DETAIL");
        assertNotNull(detail);
        assertEquals("10000",field(detail,"total_kopecks"));
    }

    @Test public void reconstructsOneMissingSameMinuteListRowOnlyWhenCompletedDetailsReconcile() throws Exception {
        String slot="Слот: 300,00 ₽\n341234567\n3 заказа · 3 км\nЗаказы 300,00 ₽\n"
            +"Начало 2026.10.17 07:30\nЗавершение 2026.10.17 22:00";
        String list="Яндекс Про\nЗаказы\n11:20 100,00 ₽ >\n11:40 100,00 ₽ >";
        VideoImportProcessor.Result video=videoWith(slot,list,
            detailCard("261017-1111111","10:55","11:20","100,00 ₽"),
            detailCard("261017-2222222","10:58","11:20","100,00 ₽"),
            detailCard("261017-3333333","11:25","11:40","100,00 ₽"));
        Object facts=extractFacts(video);
        assertEquals(3,((java.util.List<?>)fact(facts,"orders")).size());
        assertEquals(3,((java.util.List<?>)fact(facts,"deliveries")).size());
        assertEquals(30000,((Long)fact(facts,"rowAmountKopecks")).longValue());
        assertEquals(1,((Integer)fact(facts,"recoveredOrderRows")).intValue());
    }

    @Test public void refusesMissingRowRecoveryWhenDetailSubtotalDoesNotReconcile() throws Exception {
        String slot="Слот: 300,00 ₽\n341234567\n3 заказа · 3 км\nЗаказы 300,00 ₽\n"
            +"Начало 2026.10.17 07:30\nЗавершение 2026.10.17 22:00";
        String list="Яндекс Про\nЗаказы\n11:20 100,00 ₽ >\n11:40 100,00 ₽ >";
        VideoImportProcessor.Result video=videoWith(slot,list,
            detailCard("261017-1111111","10:55","11:20","100,00 ₽"),
            detailCard("261017-2222222","10:58","11:20","100,00 ₽"),
            detailCard("261017-3333333","11:25","11:40","99,00 ₽"));
        int observedDetails=0;
        boolean thirdAmountRead=false;
        for(YandexScreenParser.Candidate detail:video.uniqueCandidates()) if("ORDER_DETAIL".equals(detail.candidateType)) {
            observedDetails++;
            if("261017-3333333".equals(field(detail,"order_number")))
                thirdAmountRead="9900".equals(field(detail,"total_kopecks"));
        }
        assertEquals("all three distinct completed cards should be observed",3,observedDetails);
        assertTrue("the third card's 99 ₽ payout must be read without rounding",thirdAmountRead);
        try {
            extractFacts(video);
            throw new AssertionError("expected strict detail subtotal rejection");
        } catch(java.lang.reflect.InvocationTargetException expected) {
            assertTrue(expected.getCause() instanceof IllegalArgumentException);
        }
    }

    @Test public void refusesSlotWhenOrderSubtotalAndTipsDoNotMatchDisplayedGross() throws Exception {
        String slot="Слот: 110,00 ₽\n341234567\n1 заказ\nЗаказы 100,00 ₽\n"
            +"Начало 2026.10.17 07:30\nЗавершение 2026.10.17 22:00";
        String hocr="<div class='ocr_page' title='image \"screen.png\"; bbox 0 0 720 1608; ppageno 0'>"
            +"<span class='ocr_line'>"+hocrWord("Чаевые",31,602,127,626)+hocrWord("20,00",568,602,637,626)+"</span>"
            +"</div>";
        String list="Яндекс Про\nЗаказы\n18:00 100,00 ₽ >";
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        observations.add(observation(0,"slot",slot,hocr)); observations.add(observation(1,"list",list));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("a".repeat(64),1,5000,observations,2);
        try {
            extractFacts(video);
            throw new AssertionError("expected order subtotal plus tips mismatch rejection");
        } catch(java.lang.reflect.InvocationTargetException expected) {
            assertTrue(expected.getCause() instanceof IllegalArgumentException);
            assertTrue(expected.getCause().getMessage().contains("чаевых"));
        }
    }

    @Test public void derivesOrderSubtotalFromGrossAfterRecognizedTipsWhenOrderLineIsAbsent() throws Exception {
        String slot="Слот: 120,00 ₽\n341234567\n1 заказ · 1 км\n"
            +"Начало 2026.10.17 07:30\nЗавершение 2026.10.17 22:00";
        String hocr="<div class='ocr_page' title='image \"screen.png\"; bbox 0 0 720 1608; ppageno 0'>"
            +"<span class='ocr_line'>"+hocrWord("Чаевые",31,602,127,626)+hocrWord("20,00",568,602,637,626)+"</span>"
            +"</div>";
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        observations.add(observation(0,"slot",slot,hocr));
        observations.add(observation(1,"list","Яндекс Про\nЗаказы\n18:00 100,00 ₽ >"));
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("a".repeat(64),1,5000,observations,2);
        Object facts=extractFacts(video);
        assertEquals(1,((java.util.List<?>)fact(facts,"orders")).size());
        assertEquals(10000,((Long)fact(facts,"rowAmountKopecks")).longValue());
    }

    @Test public void removesOneFrameTimeReversalWhenAnotherRealRowHasOnlyTwoFrames() {
        String slot="Слот: 300,00 ₽\n341681811\n3 заказа · 3 км\n"
            +"Начало\n2026.10.18 07:30\nЗавершение\n2026.10.18 22:00";
        String first="Яндекс Про\nЗаказы\n10:00 100,00 ₽ >\n10:30 100,00 ₽ >\n11:00 100,00 ₽ >";
        String second="Яндекс Про\nЗаказы\n10:00 100,00 ₽ >\n10:30 100,00 ₽ >";
        String noisy="Яндекс Про\nЗаказы\n10:00 100,00 ₽ >\n10:30 100,00 ₽ >\n"
            +"14:57 100,00 ₽ >\n11:00 100,00 ₽ >";
        VideoImportProcessor.Result video=new VideoImportProcessor.Result("source",1,6000,
            java.util.Arrays.asList(observation(0,"slot",slot),observation(1,"first",first),
                observation(2,"second",second),observation(3,"noisy",noisy)),4);
        assertEquals(3,video.uniqueCandidateCount("ORDER_LIST_ROW"));
        java.util.Set<String> times=new java.util.HashSet<>();
        for(YandexScreenParser.Candidate row:video.uniqueCandidates()) if("ORDER_LIST_ROW".equals(row.candidateType))
            times.add(field(row,"order_time"));
        assertFalse(times.contains("14:57"));
        assertEquals(new java.util.HashSet<>(java.util.Arrays.asList("10:00","10:30","11:00")),times);
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

    @Test public void extractsTimeOnlySlotRangeWithoutInventingCalendarDates() {
        YandexScreenParser.Result result=YandexScreenParser.parse(
            "Слот: 3300,00 ₽\n341681811\n07:30 — 22:00\n33 заказа · 34,43 км\n"
                +"Заказы\n10:38 100,00 ₽");
        YandexScreenParser.Candidate slot=find(result,"SLOT_DETAIL");
        assertNotNull(slot);
        assertEquals("07:30",field(slot,"slot_start_time"));
        assertEquals("22:00",field(slot,"slot_end_time"));
        assertNull(field(slot,"started_at"));
        assertNull(field(slot,"completed_at"));
        assertEquals(1,count(result,"ORDER_LIST_ROW"));
    }

    @Test public void samplesShortVideosOftenEnoughForBriefOrderCards() {
        assertEquals(250L,VideoImportProcessor.samplingSpacingMs(30_000L));
        assertEquals(120,VideoImportProcessor.estimatedFrameCount(30_000L));
        assertEquals(250L,VideoImportProcessor.samplingSpacingMs(81_407L));
        assertEquals(326,VideoImportProcessor.estimatedFrameCount(81_407L));
        assertEquals(VideoImportProcessor.MAX_FRAMES,VideoImportProcessor.estimatedFrameCount(30L*60L*1000L));
        assertEquals(3_000L,VideoImportProcessor.samplingSpacingMs(30L*60L*1000L));
    }

    @Test public void resolvesPreviousSlotDayFromVideoTimestampAndLaterVisibleOrderTimes() {
        M4VideoDateResolver.Resolution resolution=M4VideoDateResolver.resolve(
            "2026-10-18T21:36:30.000000Z","07:30","22:00",
            java.util.Arrays.asList("10:38","21:57"));
        assertNotNull(resolution);
        assertEquals("2026-10-18",resolution.date.toString());
        assertEquals(450,resolution.startMinute);
        assertEquals(1320,resolution.endMinute);
        assertTrue(resolution.previousDay);
        assertEquals("2026-10-19T00:36",resolution.recordingLocal.toString().substring(0,16));
    }

    @Test public void resolvesSameDayOnlyWhenVideoWasRecordedSoonAfterSlotEnd() {
        M4VideoDateResolver.Resolution resolution=M4VideoDateResolver.resolve(
            "2026-10-18T20:30:00Z","07:30","22:00",
            java.util.Arrays.asList("10:38","21:57"));
        assertNotNull(resolution);
        assertEquals("2026-10-18",resolution.date.toString());
        assertFalse(resolution.previousDay);
    }

    @Test public void leavesTimeOnlySlotUnresolvedWhenDateEvidenceIsAmbiguous() {
        assertNull(M4VideoDateResolver.resolve(
            "2026-10-18T15:00:00Z","07:30","22:00",
            java.util.Arrays.asList("10:38","17:57")));
        assertNull(M4VideoDateResolver.resolve(
            null,"07:30","22:00",java.util.Arrays.asList("10:38","21:57")));
        assertNull(M4VideoDateResolver.resolve(
            "2026-10-18 21:36:30","07:30","22:00",java.util.Arrays.asList("10:38","21:57")));
    }

    private static YandexScreenParser.Candidate find(YandexScreenParser.Result result,String type) {
        for(YandexScreenParser.Candidate candidate:result.candidates)
            if(type.equals(candidate.candidateType)) return candidate;
        return null;
    }

    private static YandexScreenParser.Candidate find(java.util.List<YandexScreenParser.Candidate> candidates,String type) {
        for(YandexScreenParser.Candidate candidate:candidates)
            if(type.equals(candidate.candidateType)) return candidate;
        return null;
    }

    private static java.util.List<YandexScreenParser.Candidate> byType(YandexScreenParser.Result result,String type) {
        java.util.List<YandexScreenParser.Candidate> found=new java.util.ArrayList<>();
        for(YandexScreenParser.Candidate candidate:result.candidates) if(type.equals(candidate.candidateType)) found.add(candidate);
        return found;
    }

    private static String hocrWord(String text,int left,int top,int right,int bottom) {
        return "<span class='ocrx_word' title='bbox "+left+" "+top+" "+right+" "+bottom+"; x_wconf 95'>"+text+"</span>";
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

    private static VideoImportProcessor.Observation observation(int index,String id,String text,String hocr) {
        return new VideoImportProcessor.Observation(index,index*500L,id,text,1f,YandexScreenParser.parse(text,hocr),null);
    }

    private static VideoImportProcessor.Result videoWith(String slot,String list,String... details) {
        java.util.List<VideoImportProcessor.Observation> observations=new java.util.ArrayList<>();
        observations.add(observation(0,"slot",slot)); observations.add(observation(1,"list",list));
        for(int i=0;i<details.length;i++) observations.add(observation(i+2,"detail-"+i,details[i]));
        return new VideoImportProcessor.Result("a".repeat(64),1,5000,observations,observations.size());
    }

    private static String detailCard(String id,String start,String end,String total) {
        return "Заказ\nИтого "+total+"\nДетали\nСтатус Завершён\nКоэффициент спроса 1.0\n"
            +"Номер заказа "+id+"\nНачало 2026.10.17 "+start+"\nЗавершение 2026.10.17 "+end;
    }

    private static Object extractFacts(VideoImportProcessor.Result video) throws Exception {
        java.lang.reflect.Method method=M4ForecastFactWriter.class.getDeclaredMethod("extract",VideoImportProcessor.Result.class);
        method.setAccessible(true);
        return method.invoke(null,video);
    }

    private static Object fact(Object facts,String name) throws Exception {
        java.lang.reflect.Field field=facts.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(facts);
    }

    private static String field(YandexScreenParser.Candidate candidate,String name) {
        if(candidate==null) return null;
        for(YandexScreenParser.Field field:candidate.fields) if(name.equals(field.name)) return field.value;
        return null;
    }
}
