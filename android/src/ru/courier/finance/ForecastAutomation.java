package ru.courier.finance;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;
import org.json.JSONArray;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.TimeUnit;

/** Offline, restartable WorkManager entry points for forecast maintenance. */
public final class ForecastAutomation {
    private static final String DAILY="courier-forecast-daily";
    private static final String EVALUATE="courier-forecast-evaluate";
    private ForecastAutomation() {}

    public static void scheduleDaily(Context context) {
        SharedPreferences preferences=context.getApplicationContext()
            .getSharedPreferences("courier_finance",Context.MODE_PRIVATE);
        scheduleDaily(context,preferences.getString("state","{}"));
    }

    public static void scheduleDaily(Context context,String serializedState) {
        try {
            Context app=context.getApplicationContext();
            String zoneName=timezone(app,serializedState);
            SharedPreferences schedule=app.getSharedPreferences("courier_finance",Context.MODE_PRIVATE);
            if(zoneName.equals(schedule.getString("forecast_schedule_zone",""))) return;
            ZoneId zone=ZoneId.of(zoneName);
            ZonedDateTime now=ZonedDateTime.now(zone);
            ZonedDateTime next=now.toLocalDate().atTime(6,0).atZone(zone);
            if(!next.isAfter(now)) next=next.plusDays(1);
            long delay=Math.max(0,Duration.between(now,next).toMillis());
            PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(
                ForecastAutomationWorker.class,24,TimeUnit.HOURS,15,TimeUnit.MINUTES)
                .setInitialDelay(delay,TimeUnit.MILLISECONDS)
                .setInputData(new Data.Builder().putString(ForecastAutomationWorker.KEY_MODE,
                    ForecastAutomationWorker.MODE_DAILY).build()).build();
            WorkManager.getInstance(app).enqueueUniquePeriodicWork(
                DAILY,ExistingPeriodicWorkPolicy.UPDATE,request);
            schedule.edit().putString("forecast_schedule_zone",zoneName).apply();
        } catch(Exception ignored) {
            // An invalid saved timezone cannot block app startup or video import.
        }
    }

    public static void enqueueEvaluation(Context context) {
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(ForecastAutomationWorker.class)
            .setInputData(new Data.Builder().putString(ForecastAutomationWorker.KEY_MODE,
                ForecastAutomationWorker.MODE_EVALUATE).build()).build();
        try {
            WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
                EVALUATE,ExistingWorkPolicy.REPLACE,request);
        } catch(RuntimeException ignored) { /* queueing is best-effort; next launch retries */ }
    }

    public static void enqueueAfterVideo(Context context,String sourceSha256) {
        enqueueEvaluation(context);
    }

    private static String timezone(Context context,String raw) {
        SharedPreferences preferences=context.getApplicationContext()
            .getSharedPreferences("courier_finance",Context.MODE_PRIVATE);
        boolean primary=preferences.getBoolean("m2_sqlite_primary",false);
        try {
            if(raw==null||raw.isEmpty())raw="{}";
            JSONObject state=new JSONObject(raw);
            JSONObject forecast=state.optJSONObject("forecast");
            JSONObject location=forecast==null?null:forecast.optJSONObject("location");
            String zone=location!=null&&!location.optString("timezone","").isEmpty()
                ?location.optString("timezone"):ZoneId.systemDefault().getId();
            JSONObject typical=forecast==null?null:forecast.optJSONObject("typicalPlan");
            if(typical!=null&&!typical.optString("timezone","").isEmpty()) zone=typical.optString("timezone");
            if(forecast!=null) {
                JSONArray profiles=forecast.optJSONArray("profiles");JSONObject active=null;
                LocalDate today=LocalDate.now(ZoneId.of(zone));
                if(profiles!=null)for(int i=0;i<profiles.length();i++) {
                    JSONObject profile=profiles.optJSONObject(i);if(profile==null)continue;
                    if(profile.optString("effectiveFrom").compareTo(today.toString())<=0
                        &&(active==null||profile.optString("effectiveFrom").compareTo(active.optString("effectiveFrom"))>0)) active=profile;
                }
                if(active!=null&&!active.optString("timezone","").isEmpty())zone=active.optString("timezone");
            }
            ZoneId.of(zone);return zone;
        } catch(Exception ignored) {
            if(primary)return preferences.getString("forecast_schedule_zone",ZoneId.systemDefault().getId());
        }
        return ZoneId.systemDefault().getId();
    }
}
