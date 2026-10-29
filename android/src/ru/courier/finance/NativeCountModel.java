package ru.courier.finance;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Deterministic, database-independent native count model.
 *
 * Exposure is confirmed WORK availability in minutes. Accounted/Yandex hours
 * and nominal slot duration are deliberately absent from this contract.
 */
public final class NativeCountModel {
    public static final String VERSION = "native-count-1";
    private static final double RECENCY_DAYS = 35.0;
    private static final int MAX_BASELINE_ROWS = 56;
    private static final int MAX_BACKTEST_ROWS = 42;
    private static final double MIN_IMPROVEMENT = 0.05;

    private NativeCountModel() {}

    public static final class Observation {
        public final String date;
        public final String zone;
        public final int orders;
        public final int workMinutes;

        public Observation(String date, String zone, int orders, int workMinutes) {
            LocalDate.parse(date);
            if (zone == null || zone.trim().isEmpty()) throw new IllegalArgumentException("zone required");
            if (orders < 0 || workMinutes <= 0 || workMinutes > 1440)
                throw new IllegalArgumentException("invalid confirmed observation");
            this.date = date;
            this.zone = zone;
            this.orders = orders;
            this.workMinutes = workMinutes;
        }
    }

    public static final class Metrics {
        public final int n;
        public final Double mae;
        public final Double bias;
        public final Double wape;

        Metrics(List<Double> errors, List<Integer> facts) {
            n = errors.size();
            if (n == 0) {
                mae = bias = wape = null;
                return;
            }
            double abs = 0, signed = 0, total = 0;
            for (int i = 0; i < n; i++) {
                abs += Math.abs(errors.get(i));
                signed += errors.get(i);
                total += facts.get(i);
            }
            mae = abs / n;
            bias = signed / n;
            wape = total == 0 ? null : abs / total;
        }
    }

    private static final class Fold {
        final double fact, baseline, poisson, nb;
        Fold(double fact, double baseline, double poisson, double nb) {
            this.fact = fact; this.baseline = baseline; this.poisson = poisson; this.nb = nb;
        }
    }

    private static final class Baseline {
        final double mean, rate, weightedOrders, weightedHours;
        final int n;
        Baseline(double mean, double rate, double weightedOrders, double weightedHours, int n) {
            this.mean = mean; this.rate = rate; this.weightedOrders = weightedOrders;
            this.weightedHours = weightedHours; this.n = n;
        }
    }

    private static final class Fit {
        final double[] beta;
        final double alpha, dispersion;
        final int n;
        Fit(double[] beta, double alpha, double dispersion, int n) {
            this.beta = beta; this.alpha = alpha; this.dispersion = dispersion; this.n = n;
        }
        double mean(String date, int workMinutes) {
            return (workMinutes / 60.0) * Math.exp(beta[0] + beta[1 + weekday(date)]);
        }
    }

    public static final class Prediction {
        public final boolean available;
        public final String reason, targetDate, zone, trainingCutoff, sourceHash;
        public final String selectedModel, confidence;
        public final int comparableN, targetWorkMinutes;
        public final Integer central, lower, upper, baseline;
        public final int validationN;
        public final Double mae, bias, wape, baselineMae, poissonMae, negativeBinomialMae;
        public final double dispersion, negativeBinomialAlpha;
        public final String intervalMethod;

        private Prediction(String reason, String targetDate, String zone, String cutoff,
                           String hash, String selected, String confidence, int n,
                           int targetMinutes, Integer central, Integer lower, Integer upper,
                           Integer baseline, int validationN, Double mae, Double bias,
                           Double wape, Double baselineMae, Double poissonMae,
                           Double negativeBinomialMae, double dispersion, double alpha,
                           String intervalMethod) {
            this.available = central != null;
            this.reason = reason;
            this.targetDate = targetDate;
            this.zone = zone;
            this.trainingCutoff = cutoff;
            this.sourceHash = hash;
            this.selectedModel = selected;
            this.confidence = confidence;
            this.comparableN = n;
            this.targetWorkMinutes = targetMinutes;
            this.central = central; this.lower = lower; this.upper = upper; this.baseline = baseline;
            this.validationN = validationN; this.mae = mae; this.bias = bias; this.wape = wape;
            this.baselineMae = baselineMae; this.poissonMae = poissonMae;
            this.negativeBinomialMae = negativeBinomialMae;
            this.dispersion = dispersion; this.negativeBinomialAlpha = alpha;
            this.intervalMethod = intervalMethod;
        }
    }

    public static Prediction predict(Collection<Observation> input, String targetDate,
                                     int targetWorkMinutes, String zone) {
        LocalDate.parse(targetDate);
        if (zone == null || zone.trim().isEmpty()) throw new IllegalArgumentException("zone required");
        if (targetWorkMinutes < 0 || targetWorkMinutes > 1440)
            throw new IllegalArgumentException("target WORK minutes out of range");
        if (targetWorkMinutes == 0)
            return unavailable("rest day", targetDate, zone, 0);

        List<Observation> rows = combine(input, targetDate, zone);
        if (rows.isEmpty()) return unavailable("no confirmed count plus WORK exposure", targetDate, zone, targetWorkMinutes);
        String cutoff = rows.get(rows.size() - 1).date;
        String hash = sourceHash(rows, targetDate, zone);

        Baseline base = baseline(rows, targetDate, targetWorkMinutes);
        List<Fold> folds = walkForward(rows);
        Metrics baseMetrics = metrics(folds, 0, -1);
        Metrics poissonMetrics = metrics(folds, 1, 0);
        Metrics nbMetrics = metrics(folds, 2, 0);
        String selected = "weighted-count-baseline";
        Metrics poissonBase = metrics(folds, 0, 1);
        Metrics nbBase = metrics(folds, 0, 2);
        if (improves(poissonMetrics, poissonBase)) selected = "poisson-offset-daily";
        if (improves(nbMetrics, nbBase)
                && ("weighted-count-baseline".equals(selected)
                    || improves(nbMetrics, metrics(folds, 1, 2))))
            selected = "negative-binomial-daily";
        Metrics selectedMetrics = "poisson-offset-daily".equals(selected) ? poissonMetrics
                : "negative-binomial-daily".equals(selected) ? nbMetrics : baseMetrics;
        Metrics selectedBaseline = "poisson-offset-daily".equals(selected) ? poissonBase
                : "negative-binomial-daily".equals(selected) ? nbBase : baseMetrics;

        Fit poisson = fit(rows, targetDate, 0);
        Fit nb = eligibleNb(poisson, rows) ? fit(rows, targetDate, poisson.alpha) : null;
        double mean = base.mean;
        double dispersion = poisson == null ? 0 : poisson.dispersion;
        double alpha = 0;
        String intervalMethod = "weighted baseline predictive, nominal 90%";
        if ("poisson-offset-daily".equals(selected) && poisson != null) {
            mean = poisson.mean(targetDate, targetWorkMinutes);
            intervalMethod = "Poisson predictive, nominal 90%";
        } else if ("negative-binomial-daily".equals(selected) && nb != null) {
            mean = nb.mean(targetDate, targetWorkMinutes);
            alpha = nb.alpha;
            intervalMethod = "Negative Binomial predictive, nominal 90%";
        } else {
            alpha = 1.0 / Math.max(.5, base.weightedOrders + .5);
        }
        if (!Double.isFinite(mean) || mean < 0 || mean > 1_000_000)
            return unavailable("invalid model result", targetDate, zone, targetWorkMinutes);

        int center = (int) Math.round(mean);
        int[] band = band(mean, alpha);
        String confidence = base.n < 5 ? "low" : base.n < 15 ? "limited" : "moderate";
        return new Prediction(null, targetDate, zone, cutoff, hash, selected, confidence,
                base.n, targetWorkMinutes, center, band[0], band[1],
                (int) Math.round(base.mean), selectedMetrics.n, selectedMetrics.mae, selectedMetrics.bias,
                selectedMetrics.wape, selectedBaseline.mae, poissonMetrics.mae, nbMetrics.mae,
                dispersion, alpha, intervalMethod);
    }

    private static Prediction unavailable(String reason, String date, String zone, int minutes) {
        return new Prediction(reason, date, zone, null, null, "none", "insufficient",
                0, minutes, null, null, null, null, 0, null, null, null, null, null,
                null, 0, 0, null);
    }

    private static List<Observation> combine(Collection<Observation> input, String target, String zone) {
        Map<String, long[]> grouped = new LinkedHashMap<>();
        List<Observation> sorted = new ArrayList<>();
        if (input != null) for (Observation observation : input) if (observation != null) sorted.add(observation);
        Collections.sort(sorted, Comparator.comparing(o -> o.date));
        for (Observation o : sorted) {
            if (o == null || !zone.equals(o.zone) || o.date.compareTo(target) >= 0) continue;
            long[] pair = grouped.get(o.date);
            if (pair == null) { pair = new long[]{0, 0}; grouped.put(o.date, pair); }
            if (pair[1] == Long.MIN_VALUE) continue;
            pair[0] += o.orders; pair[1] += o.workMinutes;
            if (pair[0] > 1_000_000 || pair[1] > 1440) pair[1] = Long.MIN_VALUE;
        }
        List<Observation> result = new ArrayList<>();
        for (Map.Entry<String, long[]> e : grouped.entrySet()) {
            long[] v = e.getValue();
            if (v[1] != Long.MIN_VALUE && v[0] <= 1_000_000 && v[1] > 0 && v[1] <= 1440)
                result.add(new Observation(e.getKey(), zone, (int) v[0], (int) v[1]));
        }
        return result;
    }

    private static Baseline baseline(List<Observation> rows, String date, int minutes) {
        int weekday = weekday(date);
        List<Observation> same = new ArrayList<>();
        for (Observation o : rows) if (weekday(o.date) == weekday) same.add(o);
        List<Observation> sample = same.size() >= 3 ? same : new ArrayList<>(rows);
        if (sample.size() > MAX_BASELINE_ROWS)
            sample = new ArrayList<>(sample.subList(sample.size() - MAX_BASELINE_ROWS, sample.size()));
        double y = 0, h = 0;
        for (Observation o : sample) {
            double w = recency(o.date, date);
            y += w * o.orders;
            h += w * o.workMinutes / 60.0;
        }
        double rate = h == 0 ? 0 : y / h;
        return new Baseline(rate * minutes / 60.0, rate, y, h, sample.size());
    }

    private static List<Fold> walkForward(List<Observation> rows) {
        List<Fold> result = new ArrayList<>();
        int start = Math.max(0, rows.size() - MAX_BACKTEST_ROWS);
        for (int i = start; i < rows.size(); i++) {
            Observation heldOut = rows.get(i);
            List<Observation> train = rows.subList(0, i);
            if (train.size() < 3) continue;
            Baseline b = baseline(train, heldOut.date, heldOut.workMinutes);
            Fit p = fit(train, heldOut.date, 0);
            Fit over = p != null && eligibleNb(p, train) ? fit(train, heldOut.date, p.alpha) : null;
            double pMean = p == null ? Double.NaN : p.mean(heldOut.date, heldOut.workMinutes);
            double nbMean = over == null ? Double.NaN : over.mean(heldOut.date, heldOut.workMinutes);
            result.add(new Fold(heldOut.orders, b.mean, pMean, nbMean));
        }
        return result;
    }

    private static Metrics metrics(List<Fold> folds, int model, int matchedTo) {
        List<Double> errors = new ArrayList<>();
        List<Integer> facts = new ArrayList<>();
        for (Fold f : folds) {
            double pred = model == 0 ? f.baseline : model == 1 ? f.poisson : f.nb;
            double match = matchedTo == 0 ? f.baseline : matchedTo == 1 ? f.poisson
                    : matchedTo == 2 ? f.nb : Double.NaN;
            if (!Double.isFinite(pred) || matchedTo >= 0 && !Double.isFinite(match)) continue;
            errors.add(pred - f.fact);
            facts.add((int) f.fact);
        }
        return new Metrics(errors, facts);
    }

    private static boolean improves(Metrics candidate, Metrics reference) {
        return candidate.n >= 6 && reference.n >= 6 && candidate.mae != null
                && reference.mae != null && candidate.mae < reference.mae * (1 - MIN_IMPROVEMENT);
    }

    private static Fit fit(List<Observation> rows, String target, double alpha) {
        if (rows.size() < 16) return null;
        double totalOrders = 0, totalHours = 0;
        for (Observation o : rows) { totalOrders += o.orders; totalHours += o.workMinutes / 60.0; }
        if (totalHours <= 0) return null;
        double[] beta = new double[8];
        beta[0] = Math.log(Math.max(.05, totalOrders / totalHours));
        for (int iter = 0; iter < 45; iter++) {
            double max = 0;
            for (int j = 0; j < beta.length; j++) {
                double g = j == 0 ? 0 : -3 * beta[j];
                double h = j == 0 ? .001 : 3;
                for (Observation o : rows) {
                    if (j > 0 && j != 1 + weekday(o.date)) continue;
                    double mu = expected(o, beta);
                    double weight = recency(o.date, target);
                    double variance = 1 + alpha * mu;
                    g += weight * (o.orders - mu) / variance;
                    h += weight * mu / variance;
                }
                if (h <= 0 || !Double.isFinite(h)) continue;
                double change = Math.max(-.5, Math.min(.5, g / h));
                beta[j] = Math.max(-6, Math.min(6, beta[j] + change));
                max = Math.max(max, Math.abs(change));
            }
            if (max < .0001) break;
        }
        double pearson = 0, excess = 0, denominator = 0;
        for (Observation o : rows) {
            double mu = expected(o, beta);
            pearson += (o.orders - mu) * (o.orders - mu) / Math.max(.05, mu);
            excess += (o.orders - mu) * (o.orders - mu) - mu;
            denominator += mu * mu;
        }
        double dispersion = pearson / Math.max(1, rows.size() - beta.length);
        double estimate = denominator == 0 ? 0 : Math.max(0, excess / denominator);
        return new Fit(beta, alpha == 0 ? estimate : alpha, dispersion, rows.size());
    }

    private static boolean eligibleNb(Fit poisson, List<Observation> rows) {
        long orders = 0;
        for (Observation o : rows) orders += o.orders;
        return poisson != null && rows.size() >= 28 && orders >= 200
                && poisson.dispersion > 1.3 && poisson.alpha > .05;
    }

    private static double expected(Observation o, double[] beta) {
        return (o.workMinutes / 60.0) * Math.exp(beta[0] + beta[1 + weekday(o.date)]);
    }

    private static int[] band(double mean, double alpha) {
        double predictiveMean = mean == 0 ? .5 : mean;
        alpha = Math.max(alpha, .000001);
        double variance = predictiveMean + alpha * predictiveMean * predictiveMean;
        if (predictiveMean > 200 || !Double.isFinite(variance)) {
            int low = Math.max(0, (int) Math.floor(mean - 1.64485362695147 * Math.sqrt(Math.max(1, variance))));
            int high = (int) Math.ceil(mean + 1.64485362695147 * Math.sqrt(Math.max(1, variance)));
            return new int[]{Math.min((int) Math.round(mean), low), Math.max((int) Math.round(mean), high)};
        }
        double r = 1.0 / alpha, p = r / (r + predictiveMean);
        double mass = Math.pow(p, r), cdf = mass;
        int low = cdf >= .05 ? 0 : -1, high = 0;
        int cap = (int) Math.ceil(predictiveMean + 12 * Math.sqrt(Math.max(1, variance)) + 100);
        for (int k = 1; k <= cap; k++) {
            mass *= ((k - 1 + r) / k) * (1 - p);
            cdf += mass;
            if (low < 0 && cdf >= .05) low = k;
            if (cdf >= .95) { high = k; break; }
            high = k;
        }
        int center = (int) Math.round(mean);
        return new int[]{Math.min(center, Math.max(0, low < 0 ? 0 : low)), Math.max(center, high)};
    }

    private static double recency(String date, String target) {
        long age = ChronoUnit.DAYS.between(LocalDate.parse(date), LocalDate.parse(target));
        return Math.exp(-Math.max(0, age) / RECENCY_DAYS);
    }

    private static int weekday(String date) {
        return LocalDate.parse(date).getDayOfWeek().getValue() - 1; // Monday=0
    }

    private static String sourceHash(List<Observation> rows, String target, String zone) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update((VERSION + "\n" + target + "\n" + zone + "\n").getBytes(StandardCharsets.UTF_8));
            for (Observation o : rows)
                digest.update(String.format(Locale.ROOT, "%s|%d|%d|%s\n",
                        o.date, o.orders, o.workMinutes, o.zone).getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(64);
            for (byte b : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return out.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
