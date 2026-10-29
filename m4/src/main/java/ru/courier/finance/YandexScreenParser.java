package ru.courier.finance;

import java.text.Normalizer;
import java.util.Locale;

/** Conservative, text-only screen classifier. It never converts OCR into facts. */
public final class YandexScreenParser {
    public static final String VERSION = "yandex-pro-screen-v2";

    public enum ScreenType {
        ORDERS, INCOME, ACTIVITY, YANDEX_UNKNOWN, UNKNOWN
    }

    public static final class Result {
        public final ScreenType screenType;
        public final boolean reviewRequired;
        public final String reason;

        private Result(ScreenType screenType, boolean reviewRequired, String reason) {
            this.screenType = screenType;
            this.reviewRequired = reviewRequired;
            this.reason = reason;
        }
    }

    private YandexScreenParser() { }

    public static Result parse(String ocrText) {
        String text = normalize(ocrText);
        if (text.isEmpty()) return new Result(ScreenType.UNKNOWN, true, "empty_ocr");

        boolean yandex = containsAny(text, "яндекс про", "yandex pro", "таксометр", "заказы сегодня");
        boolean orders = containsAny(text, "заказ", "orders", "активные заказы");
        boolean slot = containsAny(text, "слот", "тип слота", "информация по слоту");
        boolean orderDetails = containsAny(text, "номер заказа", "коэффициент спроса");
        boolean demandCoefficient = containsAny(text, "коэффициент спроса", "коэф");
        boolean income = containsAny(text, "доход", "заработано", "выплата", "income", "earnings", "вознаграждение");
        boolean incomeBreakdown = containsAny(text, "вознаграждение") && containsAny(text, "комиссия партнера");
        boolean activity = containsAny(text, "на линии", "активность", "смена", "online", "activity");

        // Recorded Yandex Pro pages often omit the product name. A slot plus its
        // order/coefficient fields, or an order number/details page, is a safer
        // signature than requiring a visible brand label.
        if ((orders && (yandex || containsAny(text, "на линии", "заказы сегодня") || slot || orderDetails))
            || (slot && demandCoefficient))
            return new Result(ScreenType.ORDERS, false, "order_screen_signature");
        if (income && (yandex || incomeBreakdown))
            return new Result(ScreenType.INCOME, false, "income_screen_signature");
        if (activity && yandex)
            return new Result(ScreenType.ACTIVITY, false, "activity_screen_signature");
        if (yandex)
            return new Result(ScreenType.YANDEX_UNKNOWN, true, "unclassified_yandex_screen");
        return new Result(ScreenType.UNKNOWN, true, "unknown_screen_signature");
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT).replace('ё', 'е').replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private static boolean containsAny(String text, String... needles) {
        for (String needle : needles) if (text.contains(needle)) return true;
        return false;
    }
}
