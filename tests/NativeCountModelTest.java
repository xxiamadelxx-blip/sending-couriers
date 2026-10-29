package ru.courier.finance;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Small deterministic JVM test for the production native model. */
public final class NativeCountModelTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        List<NativeCountModel.Observation> facts = new ArrayList<>();
        LocalDate first = LocalDate.parse("2026-06-01");
        for (int i = 0; i < 84; i++) {
            LocalDate date = first.plusDays(i);
            int orders = i % 9 == 0 ? 0 : 5 + date.getDayOfWeek().getValue() % 4;
            facts.add(new NativeCountModel.Observation(date.toString(), "Europe/Moscow", orders, 390));
        }
        String target = first.plusDays(84).toString();
        NativeCountModel.Prediction ordinary =
                NativeCountModel.predict(facts, target, 390, "Europe/Moscow");
        check(ordinary.available, "confirmed facts should produce a forecast");
        check(ordinary.comparableN == 12, "same-weekday comparison sample");
        check(ordinary.central >= 0 && ordinary.lower <= ordinary.central
                && ordinary.upper >= ordinary.central, "valid count interval");
        check(ordinary.validationN >= 6 && ordinary.mae != null && ordinary.bias != null
                && ordinary.wape != null && ordinary.baselineMae != null,
                "walk-forward metrics missing");
        List<NativeCountModel.Observation> withoutZeroOrders = new ArrayList<>();
        for (NativeCountModel.Observation fact : facts) if (fact.orders > 0) withoutZeroOrders.add(fact);
        NativeCountModel.Prediction zeroRemoved =
                NativeCountModel.predict(withoutZeroOrders, target, 390, "Europe/Moscow");
        check(zeroRemoved.comparableN == 10 && !ordinary.sourceHash.equals(zeroRemoved.sourceHash),
                "zero-order WORK days were dropped");

        List<NativeCountModel.Observation> withFuture = new ArrayList<>(facts);
        withFuture.add(new NativeCountModel.Observation(target, "Europe/Moscow", 900, 390));
        withFuture.add(new NativeCountModel.Observation(
                LocalDate.parse(target).plusDays(1).toString(), "Europe/Moscow", 900, 390));
        NativeCountModel.Prediction protectedForecast =
                NativeCountModel.predict(withFuture, target, 390, "Europe/Moscow");
        check(ordinary.sourceHash.equals(protectedForecast.sourceHash), "future facts leaked into training key");
        check(ordinary.central.equals(protectedForecast.central), "future facts changed forecast");

        NativeCountModel.Prediction wrongZone =
                NativeCountModel.predict(facts, target, 390, "Asia/Tokyo");
        check(!wrongZone.available && wrongZone.central == null, "zone mismatch must not fabricate a forecast");
        NativeCountModel.Prediction noHistory =
                NativeCountModel.predict(new ArrayList<>(), target, 390, "Europe/Moscow");
        check(!noHistory.available && noHistory.reason.contains("no confirmed"), "missing exposure must stay unknown");

        NativeCountModel.Prediction longDay =
                NativeCountModel.predict(facts, target, 780, "Europe/Moscow");
        check(longDay.available && longDay.central >= ordinary.central,
                "doubling confirmed WORK exposure must not reduce the baseline forecast");

        List<NativeCountModel.Observation> zeroFacts = new ArrayList<>();
        for (int i = 0; i < 20; i++)
            zeroFacts.add(new NativeCountModel.Observation(
                    LocalDate.parse("2026-01-01").plusDays(i).toString(),
                    "Europe/Moscow", 0, 390));
        NativeCountModel.Prediction allZero =
                NativeCountModel.predict(zeroFacts, "2026-01-21", 390, "Europe/Moscow");
        check(allZero.available && allZero.mae != null && allZero.mae == 0
                && allZero.bias == 0 && allZero.wape == null,
                "zero-denominator metrics must preserve zero facts and leave WAPE undefined");
        System.out.println("M3 NativeCountModel PASS; n=" + ordinary.comparableN
                + " model=" + ordinary.selectedModel + " MAE=" + ordinary.mae);
    }
}
