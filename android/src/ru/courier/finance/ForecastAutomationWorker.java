package ru.courier.finance;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Computes from confirmed local facts only. No network or WebView dependency. */
public final class ForecastAutomationWorker extends Worker {
    public static final String KEY_MODE="forecast_mode";
    public static final String MODE_DAILY="DAILY";
    public static final String MODE_EVALUATE="EVALUATE";

    public ForecastAutomationWorker(Context context,WorkerParameters parameters) { super(context,parameters); }

    @Override public Result doWork() {
        try {
            Context context=getApplicationContext();
            SharedPreferences preferences=context.getSharedPreferences("courier_finance",Context.MODE_PRIVATE);
            String raw=preferences.getString("state","");
            if(preferences.getBoolean("m2_sqlite_primary",false)) {
                String verified=new CourierDatabase(context).readVerifiedState();
                if(verified==null||verified.isEmpty())return Result.retry();
                raw=verified;
            }
            if(raw==null||raw.isEmpty()) return Result.success();
            JSONObject state=new JSONObject(raw),forecast=state.optJSONObject("forecast");
            if(forecast==null) return Result.success();
            CourierDatabase store=new CourierDatabase(context);
            String mode=getInputData().getString(KEY_MODE);
            if(MODE_DAILY.equals(mode)) publishMorning(forecast,store);
            evaluatePersisted(store);
            return Result.success();
        } catch(Exception failure) {
            if(isStopped()) return Result.retry();
            return Result.failure(new Data.Builder().putString("error",
                failure.getMessage()==null?failure.getClass().getSimpleName():failure.getMessage()).build());
        }
    }

    private static void publishMorning(JSONObject forecast,CourierDatabase store) throws Exception {
        String zoneName=activeTimezone(forecast);
        ZoneId zone=ZoneId.of(zoneName);
        ZonedDateTime now=ZonedDateTime.now(zone);
        LocalDate target=now.toLocalDate();
        String date=target.toString();
        // The Web forecast also records MORNING snapshots in its JSON state.
        // That snapshot is not the native append-only SQL publication, so it
        // must not suppress this worker. publishAutomation checks the stable
        // native-MORNING-{date} ID inside SQLite and remains retry-idempotent.
        Plan plan=targetPlan(forecast,date,target,zone);
        if(plan.minutes<=0) return;
        List<NativeCountModel.Observation> observations=confirmedHistory(forecast,date,zoneName);
        NativeCountModel.Prediction prediction=NativeCountModel.predict(observations,date,plan.minutes,zoneName);
        if(!prediction.available) return;
        Integer profileVersion=plan.profileVersion;
        int firstWork=plan.firstWorkMinute;
        int minute=now.getHour()*60+now.getMinute();
        JSONObject currentDay=forecast.optJSONObject("days")==null?null:forecast.optJSONObject("days").optJSONObject(date);
        boolean hasFact=currentDay!=null&&(currentDay.optBoolean("ordersConfirmed")||currentDay.optBoolean("workConfirmed")
            ||currentDay.optBoolean("accountedConfirmed"));
        boolean partial=hasFact||(firstWork>=0&&minute>firstWork);
        AutonomousForecastStore.publishAutomation(store,prediction,"MORNING",profileVersion,partial);
    }

    private static final class Plan {
        final int minutes,firstWorkMinute;
        final Integer profileVersion;
        Plan(int minutes,int first,Integer version){this.minutes=minutes;this.firstWorkMinute=first;this.profileVersion=version;}
    }

    private static Plan targetPlan(JSONObject forecast,String date,LocalDate target,ZoneId zone) throws Exception {
        JSONObject own=forecast.optJSONObject("plans")==null?null:forecast.optJSONObject("plans").optJSONObject(date);
        if(own!=null) {
            Plan from=planObject(own,null);
            return from.minutes>=0?from:new Plan(0,-1,null);
        }
        JSONObject weekly=forecast.optJSONObject("weekConfig");
        if(weekly!=null) {
            Plan from=planObject(weekly,null);
            return from.minutes>=0?from:new Plan(0,-1,null);
        }

        JSONObject active=null;JSONArray profiles=forecast.optJSONArray("profiles");
        if(profiles!=null) for(int i=0;i<profiles.length();i++) {
            JSONObject profile=profiles.optJSONObject(i);
            if(profile==null)continue;
            try {if(LocalDate.parse(profile.optString("effectiveFrom")).isAfter(target))continue;}
            catch(Exception invalid){continue;}
            if(active==null||profile.optString("effectiveFrom").compareTo(active.optString("effectiveFrom"))>0) active=profile;
        }
        if(active!=null) {
            JSONArray week=active.optJSONArray("week");
            int dayIndex=target.getDayOfWeek().getValue()%7;
            if(week!=null&&week.length()==7) {
                JSONObject todays=week.optJSONObject(dayIndex);
                JSONObject previous=week.optJSONObject((dayIndex+6)%7);
                List<int[]> ranges=new ArrayList<>();
                addWorkRanges(ranges,todays==null?null:todays.optJSONArray("intervals"),0,1440);
                if(previous!=null)addOvernightCarry(ranges,previous.optJSONArray("intervals"));
                int sum=unionMinutes(ranges);
                return new Plan(sum,first(ranges),active.optInt("version",1));
            }
        }
        JSONObject typical=forecast.optJSONObject("typicalPlan");
        if(typical!=null) {
            List<int[]> ranges=new ArrayList<>();addWorkRanges(ranges,typical.optJSONArray("intervals"),0,1440);
            int sum=unionMinutes(ranges);if(sum>0)return new Plan(sum,first(ranges),null);
        }
        return new Plan(0,-1,null);
    }

    /** -1 means no usable value; zero is an explicit rest plan. */
    private static Plan planObject(JSONObject value,Integer version) throws Exception {
        JSONArray intervals=value.optJSONArray("intervals");
        List<int[]> ranges=new ArrayList<>();addWorkRanges(ranges,intervals,0,1440);
        if(intervals!=null&&"intervals".equals(value.optString("precision")))
            return new Plan(unionMinutes(ranges),first(ranges),version);
        if(intervals!=null&&ranges.size()>0)return new Plan(unionMinutes(ranges),first(ranges),version);
        if(value.has("workingMin")&&!value.isNull("workingMin")) {
            int minutes=value.getInt("workingMin");
            if(minutes>=0&&minutes<=1440)return new Plan(minutes,minutes>0?0:-1,version);
        }
        return new Plan(-1,-1,version);
    }

    private static void addWorkRanges(List<int[]> out,JSONArray intervals,int min,int max) {
        if(intervals==null)return;
        for(int i=0;i<intervals.length();i++) {
            JSONObject item=intervals.optJSONObject(i);
            if(item==null||!"WORK".equals(item.optString("state")))continue;
            int start=item.optInt("start",-1),end=item.optInt("end",-1);
            int a=Math.max(min,start),b=Math.min(max,end);
            if(a>=0&&b>a)out.add(new int[]{a,b});
        }
    }

    private static void addOvernightCarry(List<int[]> out,JSONArray intervals) {
        if(intervals==null)return;
        for(int i=0;i<intervals.length();i++) {
            JSONObject item=intervals.optJSONObject(i);
            if(item==null||!"WORK".equals(item.optString("state")))continue;
            int end=item.optInt("end",0);
            if(end>1440)out.add(new int[]{0,Math.min(1440,end-1440)});
        }
    }

    private static int first(List<int[]> ranges) {
        int first=Integer.MAX_VALUE;for(int[] r:ranges)first=Math.min(first,r[0]);
        return first==Integer.MAX_VALUE?-1:first;
    }

    private static int unionMinutes(List<int[]> ranges) {
        if(ranges.isEmpty())return 0;
        Collections.sort(ranges,Comparator.comparingInt(a->a[0]));
        int start=ranges.get(0)[0],end=ranges.get(0)[1],sum=0;
        for(int i=1;i<ranges.size();i++) {
            int[] next=ranges.get(i);
            if(next[0]<=end)end=Math.max(end,next[1]);
            else {sum+=end-start;start=next[0];end=next[1];}
        }
        return sum+end-start;
    }

    private static List<NativeCountModel.Observation> confirmedHistory(JSONObject forecast,
            String targetDate,String zone) throws Exception {
        List<NativeCountModel.Observation> rows=new ArrayList<>();
        JSONObject days=forecast.optJSONObject("days");if(days==null)return rows;
        java.util.Iterator<String> keys=days.keys();
        while(keys.hasNext()) {
            String date=keys.next();if(date.compareTo(targetDate)>=0)continue;
            JSONObject day=days.optJSONObject(date);if(day==null)continue;
            if(!day.optBoolean("ordersConfirmed")||!day.optBoolean("completed")||!day.optBoolean("workConfirmed")
                    ||day.optInt("orders",-1)<0||hasConflicts(day)||!zone.equals(day.optString("timezone",zone)))continue;
            int workMinutes=confirmedWorkMinutes(day);
            if(workMinutes<=0||workMinutes>1440)continue;
            rows.add(new NativeCountModel.Observation(date,zone,day.getInt("orders"),workMinutes));
        }
        rows.sort(Comparator.comparing(o->o.date));
        return rows;
    }

    private static int confirmedWorkMinutes(JSONObject day) {
        JSONArray intervals=day.optJSONArray("intervals");
        if("intervals".equals(day.optString("precision"))&&intervals!=null) {
            List<int[]> ranges=new ArrayList<>();addWorkRanges(ranges,intervals,0,1440);
            return unionMinutes(ranges);
        }
        if(!"total".equals(day.optString("precision")))return 0;
        JSONObject source=day.optJSONObject("fieldSources");JSONObject working=source==null?null:source.optJSONObject("workingMin");
        if(working!=null&&(!"CONFIRMED".equals(working.optString("status"))
            ||!"FACT".equals(working.optString("kind"))))return 0;
        return day.has("workingMin")&&!day.isNull("workingMin")?day.optInt("workingMin",0):0;
    }

    private static boolean hasConflicts(JSONObject day) {
        JSONArray conflicts=day.optJSONArray("conflicts"),sources=day.optJSONArray("sourceConflicts");
        if(conflicts!=null&&conflicts.length()>0||sources!=null&&sources.length()>0)return true;
        JSONObject fields=day.optJSONObject("fieldSources");
        for(String field:new String[]{"orders","workingMin"}) {
            JSONObject value=fields==null?null:fields.optJSONObject(field);
            if(value!=null&&"CONFLICT".equals(value.optString("status")))return true;
        }
        return false;
    }

    private static String activeTimezone(JSONObject forecast) {
        String fallback="Europe/Moscow";
        JSONObject location=forecast.optJSONObject("location");
        if(location!=null&&!location.optString("timezone","").isEmpty())fallback=location.optString("timezone");
        JSONObject typical=forecast.optJSONObject("typicalPlan");
        if(typical!=null&&!typical.optString("timezone","").isEmpty())fallback=typical.optString("timezone");
        try {
            LocalDate today=LocalDate.now(ZoneId.of(fallback));JSONObject chosen=null;JSONArray profiles=forecast.optJSONArray("profiles");
            if(profiles!=null)for(int i=0;i<profiles.length();i++) {
                JSONObject p=profiles.optJSONObject(i);if(p==null)continue;
                if(p.optString("effectiveFrom").compareTo(today.toString())<=0
                    &&(chosen==null||p.optString("effectiveFrom").compareTo(chosen.optString("effectiveFrom"))>0))chosen=p;
            }
            if(chosen!=null&&!chosen.optString("timezone","").isEmpty())fallback=chosen.optString("timezone");
            ZoneId.of(fallback);return fallback;
        }catch(Exception ignored){return "Europe/Moscow";}
    }

    private static void evaluatePersisted(CourierDatabase store) throws Exception {
        SQLiteDatabase db=store.getWritableDatabase();List<String> ids=new ArrayList<>();
        try(Cursor c=db.rawQuery("SELECT id FROM forecast_snapshots WHERE id LIKE 'native-MORNING-%' ORDER BY target_date",null)) {
            while(c.moveToNext())ids.add(c.getString(0));
        }
        String at=java.time.format.DateTimeFormatter.ISO_INSTANT.format(Instant.now());
        for(String id:ids)AutonomousForecastStore.evaluate(store,id,at);
    }
}
