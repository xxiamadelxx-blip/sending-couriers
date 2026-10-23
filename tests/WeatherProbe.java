package ru.courier.finance;
import org.json.JSONObject;
public final class WeatherProbe {
    public static void main(String[] args) throws Exception {
        JSONObject result=new JSONObject(WeatherClient.fetch("Helsinki","Europe/Helsinki"));
        if(!"Open-Meteo".equals(result.getString("provider")) || result.getJSONObject("hourly").getJSONArray("time").length()<24) throw new AssertionError();
        System.out.println("PASS: production WeatherClient retrieves public geocoding + hourly weather; no app data supplied");
    }
}
