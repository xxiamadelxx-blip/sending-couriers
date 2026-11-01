package ru.courier.finance;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read already committed video orders for a durable forecast handoff. */
public final class VideoForecastRecovery {
    private static final ZoneId MOSCOW=ZoneId.of("Europe/Moscow");
    private VideoForecastRecovery() {}

    public static String read(CourierDatabase store,String hash) throws Exception {
        if(hash==null||!hash.matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("Invalid video source");
        JSONArray orders=new JSONArray();
        SQLiteDatabase db=store.getReadableDatabase();
        try(Cursor cursor=db.rawQuery(
                "SELECT id,date,observed_at,accepted_at,completed_at,yandex_order_id "
                +"FROM orders WHERE source_id=? ORDER BY date,observed_at,id LIMIT 2001",
                new String[]{"video:"+hash})) {
            while(cursor.moveToNext()) {
                if(orders.length()>=2000) throw new IllegalStateException("Video order limit exceeded");
                String date=cursor.getString(1),observed=cursor.getString(2);
                if(date==null||!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) continue;
                Integer visible=minute(observed),accepted=minute(cursor.getString(3)),
                    delivered=minute(cursor.getString(4));
                JSONObject row=new JSONObject().put("id",cursor.getString(0))
                    .put("date",date).put("visibleMin",visible==null?JSONObject.NULL:visible)
                    .put("acceptedMin",accepted==null?JSONObject.NULL:accepted)
                    .put("deliveredMin",delivered==null?JSONObject.NULL:delivered)
                    .put("orderNumber",cursor.getString(5)==null?JSONObject.NULL:cursor.getString(5))
                    .put("source","video:"+hash).put("confidence",
                        accepted!=null&&delivered!=null?"ORDER_DETAIL_MATCHED":"LIST_ROW_CROSSCHECKED")
                    .put("confirmed",accepted!=null&&delivered!=null);
                String source="video:"+hash;
                row.put("fieldSources",new JSONObject()
                    .put("visibleMin",new JSONObject().put("status",visible==null?"UNKNOWN":"CONFIRMED").put("source",source))
                    .put("acceptedMin",new JSONObject().put("status",accepted==null?"UNKNOWN":"CONFIRMED").put("source",source))
                    .put("deliveredMin",new JSONObject().put("status",delivered==null?"UNKNOWN":"CONFIRMED").put("source",source)));
                orders.put(row);
            }
        }
        return new JSONObject().put("ok",true).put("orders",orders).toString();
    }

    private static Integer minute(String utc) {
        if(utc==null||utc.isEmpty()) return null;
        ZonedDateTime local=Instant.parse(utc).atZone(MOSCOW);
        return local.getHour()*60+local.getMinute();
    }
}
