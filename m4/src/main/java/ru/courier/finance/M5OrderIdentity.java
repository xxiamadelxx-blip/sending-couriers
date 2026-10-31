package ru.courier.finance;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Stable, source-independent identity for an observed Yandex order event. */
public final class M5OrderIdentity {
    private M5OrderIdentity() {}

    public static String rowId(String date, String slotId, String orderNumber,
                               int minute, long amountKopecks, int occurrence,
                               String sourceSha256, int sourceIndex) {
        String identity;
        if (orderNumber != null && orderNumber.matches("[0-9]{6}-[0-9]{4,}")) {
            identity = "yandex|" + date + "|" + orderNumber;
        } else if (date != null && date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")
                && slotId != null && slotId.matches("[0-9]{6,12}")
                && minute >= 0 && minute < 1440 && amountKopecks >= 0 && occurrence > 0) {
            // Occurrence preserves distinct deliveries with the same minute and payout.
            identity = "event|" + date + "|" + slotId + "|" + minute + "|"
                    + amountKopecks + "|" + occurrence;
        } else {
            identity = "source|" + sourceSha256 + "|" + sourceIndex;
        }
        return "m5-" + sha256(identity);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(64);
            for (byte b : digest) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return out.toString();
        } catch (Exception impossible) {
            throw new AssertionError("SHA-256 is required by Android", impossible);
        }
    }
}
