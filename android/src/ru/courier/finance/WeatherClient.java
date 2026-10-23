package ru.courier.finance;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Only public weather endpoints. Never receives app state, reports or screen frames. */
public final class WeatherClient {
    private static JSONObject get(String address) throws Exception {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol()) || !("geocoding-api.open-meteo.com".equals(url.getHost()) || "api.open-meteo.com".equals(url.getHost()))) throw new IllegalArgumentException();
        HttpsURLConnection connection = (HttpsURLConnection)url.openConnection();
        connection.setConnectTimeout(7000); connection.setReadTimeout(7000); connection.setInstanceFollowRedirects(false);
        try {
            if (connection.getResponseCode()!=200) throw new IllegalStateException();
            try (InputStream in=connection.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[4096]; int n;
                while((n=in.read(buffer))!=-1) { out.write(buffer,0,n); if(out.size()>200000) throw new IllegalArgumentException(); }
                return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            }
        } finally { connection.disconnect(); }
    }
    public static String fetch(String city,String timezone) throws Exception {
        if(city==null||city.trim().isEmpty()||city.length()>120||timezone==null||timezone.length()>80) throw new IllegalArgumentException();
        String encoded=URLEncoder.encode(city.trim(),"UTF-8"),tz=URLEncoder.encode(timezone,"UTF-8");
        JSONObject geo=get("https://geocoding-api.open-meteo.com/v1/search?name="+encoded+"&count=1&language=ru&format=json");
        JSONArray results=geo.optJSONArray("results"); if(results==null||results.length()==0) throw new IllegalArgumentException();
        JSONObject place=results.getJSONObject(0);
        JSONObject weather=get("https://api.open-meteo.com/v1/forecast?latitude="+place.getDouble("latitude")+"&longitude="+place.getDouble("longitude")+"&hourly=temperature_2m,weather_code&forecast_days=2&timezone="+tz);
        return new JSONObject().put("provider","Open-Meteo").put("requestedCity",city).put("city",place.getString("name")).put("timezone",timezone)
            .put("latitude",place.getDouble("latitude")).put("longitude",place.getDouble("longitude")).put("hourly",weather.getJSONObject("hourly")).toString();
    }
}
