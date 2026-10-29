package ru.courier.finance;

import org.junit.Test;
import static org.junit.Assert.*;

public final class YandexScreenParserTest {
    @Test public void classifiesRussianOrdersScreenWithoutExtractingFacts() {
        YandexScreenParser.Result result=YandexScreenParser.parse("Яндекс Про\nЗаказы сегодня: 18");
        assertEquals(YandexScreenParser.ScreenType.ORDERS,result.screenType);
        assertFalse(result.reviewRequired);
    }
    @Test public void classifiesEnglishIncomeScreen() {
        assertEquals(YandexScreenParser.ScreenType.INCOME,
            YandexScreenParser.parse("Yandex Pro\nIncome today: 1250").screenType);
    }
    @Test public void queuesUnclassifiedYandexAndUnrelatedScreens() {
        YandexScreenParser.Result yandex=YandexScreenParser.parse("Яндекс Про\nНастройки карты");
        YandexScreenParser.Result unrelated=YandexScreenParser.parse("Заметки\nвстреча завтра 18:30");
        assertEquals(YandexScreenParser.ScreenType.YANDEX_UNKNOWN,yandex.screenType);
        assertTrue(yandex.reviewRequired);
        assertEquals(YandexScreenParser.ScreenType.UNKNOWN,unrelated.screenType);
        assertTrue(unrelated.reviewRequired);
    }
    @Test public void identifiesEmptyOcrAsUnknown() {
        YandexScreenParser.Result result=YandexScreenParser.parse("  \n ");
        assertEquals(YandexScreenParser.ScreenType.UNKNOWN,result.screenType);
        assertEquals("empty_ocr",result.reason);
    }
}
