package ru.courier.finance.m2probe;
import android.app.Activity;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.widget.TextView;
import android.graphics.Color;
import org.json.JSONArray;
import org.json.JSONObject;

/** TEST-ONLY: compiled into isolated m2probe package, not release APK. */
public final class M2DeviceProbeActivity extends Activity {
  private static void eq(long actual,long expected,String what){
    if(actual!=expected)throw new AssertionError(what+": "+actual+" expected "+expected);
  }
  private static long count(SQLiteDatabase db,String statement){
    try(Cursor c=db.rawQuery(statement,null)){
      if(!c.moveToFirst())throw new AssertionError("empty query "+statement);
      return c.getLong(0);
    }
  }
  private static void test()throws Exception{
    // A dedicated package ensures no actual courier state can be touched.
    CourierDatabase store=new CourierDatabase(App.instance);
    JSONArray slots=new JSONArray();
    slots.put(new JSONObject().put("id","slot-am").put("date","2026-10-18")
      .put("dailyOrders",12).put("dailyHours",9).put("reward",1200).put("tips",70));
    slots.put(new JSONObject().put("id","slot-pm").put("date","2026-10-18")
      .put("dailyOrders",9).put("dailyHours",5).put("reward",900));
    String original=new JSONObject().put("schemaVersion",6).put("entries",slots).toString();
    boolean initial=store.mirrorLegacy(original);
    if(!initial && !store.matchesLegacy(original))throw new AssertionError("existing mirror did not recover");
    if(!store.matchesLegacy(original))throw new AssertionError("legacy roundtrip hash mismatch");
    if(!original.equals(store.readVerifiedState()))throw new AssertionError("SQLite primary reader changed JSON");
    if(store.mirrorLegacy(original))throw new AssertionError("same JSON should be idempotent");
    SQLiteDatabase db=store.getReadableDatabase();
    eq(count(db,"SELECT COUNT(*) FROM legacy_slot_facts"),2,"two slots");
    eq(count(db,"SELECT COUNT(*) FROM orders"),initial?0:2,"no invented RAW and preserved prior import");
    eq(count(db,"SELECT SUM(order_count) FROM aggregate_order_counts"),initial?21:50,"21 legacy orders, plus separately sourced XLSX history on restart");
    eq(count(db,"SELECT SUM(accounted_hundredths) FROM legacy_slot_facts"),1400,"14 accounted hours");
    eq(count(db,"SELECT SUM(amount_kopecks) FROM financial_ledger WHERE kind='reward'"),210000,"kopecks exact");
    eq(count(db,"SELECT SUM(amount_kopecks) FROM financial_ledger WHERE kind='tip'"),7000,"tips separate");
    JSONObject sheets=new JSONObject();
    sheets.put("Заказы RAW",new JSONObject()
       .put("2",new JSONObject().put("A","2026-10-18").put("C","18:57").put("D",13)
          .put("E",100).put("K","Высокая").put("M","18:57"))
       .put("3",new JSONObject().put("A","2026-10-18").put("C","18:57").put("D",14)
          .put("E",100).put("K","Высокая").put("M","18:57")));
    sheets.put("Дневные итоги",new JSONObject()
       .put("2",new JSONObject().put("A","2026-10-17").put("E",29)));
    sheets.put("Финансовые факты",new JSONObject()
       .put("2",new JSONObject().put("A","2026-10-15")
          .put("B","Финальная доплата почасовой гарантии").put("C","22 376,00")));
    sheets.put("Прогнозы",new JSONObject()
       .put("2",new JSONObject().put("A","2026-10-17").put("D",28).put("E",19).put("F",39)));
    // All remaining historical sections must be present before promotion.
    for(String name:new String[]{"Смены","Точность","Настройки","Календарь",
        "Методика","Решения","Модели","Финансовые правила","Контроль",
        "Аудит 19.10","Снимки периода"}){
      sheets.put(name,new JSONObject().put("2",new JSONObject().put("A","source evidence")));
    }
    // A real period snapshot is required for full 15-tab parity; a
    // placeholder sheet name alone cannot authorize the SQLite cutover.
    sheets.put("Снимки периода",new JSONObject()
      .put("2",new JSONObject().put("A","2026-10-19")
        .put("B","16.10.2026–29.10.2026").put("C",43).put("D",62)));
    String workbook=new JSONObject().put("sheets",sheets).toString();
    String sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    long archivedBefore=count(db,"SELECT COUNT(*) FROM sheet_import_rows");
    eq(store.mirrorWorkbook(workbook,sha),archivedBefore==0?16:0,"16 source rows or verified restart");
    if(!store.hasCompleteWorkbook(sha))throw new AssertionError("complete 15-sheet source not recognized");
    eq(store.mirrorWorkbook(workbook,sha),0,"same XLSX is idempotent");
    eq(count(db,"SELECT COUNT(*) FROM sheet_import_rows"),16,"source evidence rows");
    eq(count(db,"SELECT COUNT(*) FROM orders"),2,"two equal-time RAW deliveries not merged");
    eq(count(db,"SELECT COUNT(*) FROM orders WHERE completed_at LIKE '%18:57%'"),2,"equal completion times");
    eq(count(db,"SELECT SUM(order_count) FROM aggregate_order_counts WHERE source_kind='xlsx'"),29,"partial RAW remains 12/29 only when known");
    eq(count(db,"SELECT amount_kopecks FROM financial_ledger WHERE kind='final_guarantee'"),2237600,"final settlement");
    eq(count(db,"SELECT COUNT(*) FROM historical_forecasts"),1,"historical forecast preserved");
    eq(count(db,"SELECT COUNT(*) FROM forecast_snapshots"),0,"no invented published forecast");
    eq(count(db,"SELECT COUNT(*) FROM audit_events"),2,"one audit event per source");
    try(Cursor c=db.rawQuery("PRAGMA integrity_check",null)){
      if(!c.moveToFirst()||!"ok".equals(c.getString(0)))throw new AssertionError("SQLite integrity");
    }
    store.close();
    store=new CourierDatabase(App.instance);
    eq(count(store.getReadableDatabase(),"SELECT COUNT(*) FROM orders"),2,"orders survive close-reopen");
    if(!store.matchesLegacy(original))throw new AssertionError("legacy survives close-reopen");
    if(!original.equals(store.readVerifiedState()))throw new AssertionError("verified read fails after reopening SQLite");
    if(!store.hasCompleteWorkbook(sha))throw new AssertionError("archive parity lost after reopening");
    // RED: a workbook with fifteen tab names but no usable facts is not
    // adequate evidence for promoting SQLite to the active store.
    JSONObject incomplete=new JSONObject();
    for(String name:new String[]{"Заказы RAW","Дневные итоги","Финансовые факты",
        "Прогнозы","Смены","Точность","Настройки","Календарь",
        "Методика","Решения","Модели","Финансовые правила","Контроль",
        "Аудит 19.10","Снимки периода"}){
      incomplete.put(name,new JSONObject().put("2",new JSONObject().put("A","unknown")));
    }
    String partialSha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    eq(store.mirrorWorkbook(new JSONObject().put("sheets",incomplete).toString(),partialSha),15,"archive has 15 source rows");
    if(store.hasCompleteWorkbook(partialSha))
      throw new AssertionError("partial 15-tab workbook incorrectly authorized primary cutover");
    // RED: a newer, fully typed workbook that omits a historical RAW row
    // must never supersede the original source without owner confirmation.
    JSONObject reduced=new JSONObject(sheets.toString());
    reduced.getJSONObject("Заказы RAW").remove("3");
    String reducedSha="cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    eq(store.mirrorWorkbook(new JSONObject().put("sheets",reduced).toString(),reducedSha),15,
      "reduced source is still archived for auditing");
    if(store.hasCompleteWorkbook(reducedSha))
      throw new AssertionError("newer XLSX with fewer orders superseded existing history");
    eq(count(store.getReadableDatabase(),"SELECT COUNT(*) FROM active_orders"),2,
      "old confirmed RAW must remain active after reduced workbook");

    // Actual native onUpgrade: emulate an older on-disk v1 database without
    // deleting records, then let the production SQLiteOpenHelper reopen it.
    store.close();
    String path=App.instance.getDatabasePath(CourierDatabase.FILE_NAME).getPath();
    SQLiteDatabase older=SQLiteDatabase.openDatabase(path,null,SQLiteDatabase.OPEN_READWRITE);
    try {
      try(Cursor views=older.rawQuery("SELECT name FROM sqlite_master WHERE type='view'",null)){
        while(views.moveToNext()){
          String name=views.getString(0);
          if(!name.startsWith("active_"))throw new AssertionError("unexpected view: "+name);
          older.execSQL("DROP VIEW IF EXISTS "+name);
        }
      }
      older.setVersion(1);
    } finally {older.close();}
    store=new CourierDatabase(App.instance);
    eq(count(store.getReadableDatabase(),"PRAGMA user_version"),2,"v1 to v2 migration");
    eq(count(store.getReadableDatabase(),"SELECT COUNT(*) FROM legacy_slot_facts"),2,
       "two slots survive schema upgrade");
    eq(count(store.getReadableDatabase(),"SELECT COUNT(*) FROM active_orders"),2,
       "active RAW survives schema upgrade");
    if(!original.equals(store.readVerifiedState()))
      throw new AssertionError("legacy state lost during v1-v2 migration");
    store.close();
  }
  static class App { static Activity instance; }
  @Override public void onCreate(Bundle saved){
    super.onCreate(saved);App.instance=this;
    if(getIntent()!=null&&getIntent().getData()!=null&&"seed".equals(getIntent().getData().getHost())){
      try {
        CourierDatabase database=new CourierDatabase(this);
        String verified=database.readVerifiedState();
        if(verified==null||!verified.contains("slot-am"))
          throw new AssertionError("must run courierm2://probe before seed");
        database.close();
        // Deliberately stale backup: live UI must follow the verified primary.
        boolean backupWritten=getSharedPreferences("courier_finance",MODE_PRIVATE).edit()
          .putString("state","{\"schemaVersion\":6,\"entries\":[]}")
          .putBoolean("m2_sqlite_primary",true).commit();
        if(!backupWritten)throw new AssertionError("cannot mark primary backend");
        startActivity(new android.content.Intent(this,MainActivity.class));
        finish();
      }catch(Throwable problem){
        TextView error=new TextView(this);
        error.setText("M2 PRIMARY UI FAIL: "+problem.getMessage());
        setContentView(error);
      }
      return;
    }
    TextView display=new TextView(this);
    display.setTextSize(18);display.setPadding(24,80,24,24);
    display.setBackgroundColor(Color.WHITE);display.setTextColor(Color.BLACK);
    setContentView(display);
    try{
      test();
      display.setText("M2 SQLITE QA PASS\nAndroid native SQLite\nTwo slots, zero fabricated orders, exact kopecks, same-minute RAW, financial closing, forecasts, repeat import and restart: PASS");
    }catch(Throwable error){
      display.setText("M2 SQLITE QA FAIL: "+error.getClass().getSimpleName()+" "+error.getMessage());
    }
  }
}
