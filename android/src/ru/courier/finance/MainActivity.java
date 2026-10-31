package ru.courier.finance;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.UiModeManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.SoundEffectConstants;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.util.Log;
import android.app.PendingIntent;
import android.content.IntentSender;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.common.api.Scope;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int SAVE_FILE = 101, IMPORT_FILE = 102, IMPORT_FORECAST = 103, IMPORT_VIDEO = 104, IMPORT_SYNC = 105, AUTHORIZE_SYNC = 106;
    private static final int MAX_BYTES = 8_000_000;
    private WebView web;
    private FrameLayout root;
    private View launch;
    private SharedPreferences preferences;
    private CourierDatabase factMirrorDatabase;
    private M7SyncStore syncStore;
    private final ExecutorService factMirrorExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService syncExecutor = Executors.newSingleThreadExecutor();
    private File pendingSave;
    private boolean darkTheme = true;
    private Boolean appliedNightMode;
    private volatile boolean weatherLoading;
    private volatile boolean syncInProgress;
    private boolean enableSyncAfterAuthorization;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        preferences = getSharedPreferences("courier_finance", MODE_PRIVATE);
        factMirrorDatabase = new CourierDatabase(this);
        syncStore = new M7SyncStore(factMirrorDatabase);
        // Existing JSON remains authoritative until the complete XLSX and
        // legacy JSON have both passed native SQLite parity. No forced cutover.
        if (!preferences.getBoolean("m2_sqlite_primary",false))
            mirrorFacts(preferences.getString("state", ""));
        try { darkTheme = !"light".equals(new JSONObject(storedState().isEmpty()?"{}":storedState()).optJSONObject("settings").optString("theme")); }
        catch (Exception ignored) { darkTheme = true; }
        setTheme(darkTheme ? R.style.AppThemeDark : R.style.AppThemeLight);
        if (saved != null && saved.getString("pendingSave") != null) {
            File candidate = new File(getCacheDir(), saved.getString("pendingSave"));
            try { if (candidate.getCanonicalPath().startsWith(new File(getCacheDir(), "exports").getCanonicalPath() + File.separator)) pendingSave = candidate; }
            catch (Exception ignored) { }
        }
        int bg = AppAppearance.background(darkTheme);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(attributes);
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((v, insets) -> {
            int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
            if (Build.VERSION.SDK_INT >= 34) types |= WindowInsets.Type.systemOverlays();
            android.graphics.Insets system = insets.getInsetsIgnoringVisibility(types);
            android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
            android.view.DisplayCutout cutout = insets.getDisplayCutout();
            android.graphics.Insets waterfall = cutout == null ? android.graphics.Insets.NONE : cutout.getWaterfallInsets();
            int[] padding = SafeArea.padding(Math.max(system.left, waterfall.left), Math.max(system.top, waterfall.top),
                Math.max(system.right, waterfall.right), Math.max(system.bottom, waterfall.bottom), keyboard.bottom);
            v.setPadding(padding[0], padding[1], padding[2], padding[3]);
            return WindowInsets.CONSUMED;
        });
        web = new WebView(this);
        web.setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT >= 29) web.setForceDarkAllowed(false);
        web.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        web.setSoundEffectsEnabled(true);
        web.setHapticFeedbackEnabled(true);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        if (Build.VERSION.SDK_INT >= 33) settings.setAlgorithmicDarkeningAllowed(false);
        web.addJavascriptInterface(new NativeBridge(), "CourierNative");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton("Удалить", (dialog, which) -> result.confirm())
                    .setNegativeButton("Отмена", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/assets/")) {
                    String path = uri.getPath().substring(8);
                    if (path.contains("..") || !request.getMethod().equals("GET")) return blocked();
                    try {
                        String type = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : path.endsWith(".mjs") || path.endsWith(".js") ? "application/javascript" : path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".png") ? "image/png" : "application/octet-stream";
                        return new WebResourceResponse(type, "UTF-8", getAssets().open("www/" + path));
                    } catch (Exception ignored) { return blocked(); }
                }
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(ORIGIN + "/assets/");
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        launch = createLaunch();
        root.addView(launch, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        applyAppearance(darkTheme);
        root.requestApplyInsets();
        web.loadUrl(ORIGIN + "/assets/index.html");
        // WorkManager persists this schedule across force-stop/reboot. Its
        // morning execution is best-effort; Web startup repairs stale dates.
        ForecastAutomation.scheduleDaily(this,storedState());
        ForecastAutomation.enqueueEvaluation(this);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> handleBack());
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private View createLaunch() {
        // Keep the original SHIFT CONTROL glyph; show it floating on graphite.
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(0xFF10151A);
        FrameLayout mark = new FrameLayout(this);
        View halo = new View(this);
        GradientDrawable radial = new GradientDrawable();
        radial.setShape(GradientDrawable.OVAL);
        radial.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        radial.setGradientCenter(0.5f, 0.5f);
        radial.setGradientRadius(dp(140));
        radial.setColors(new int[]{0x24FF7952, 0x0DFFBD57, 0x0010151A});
        halo.setBackground(radial);
        mark.addView(halo, new FrameLayout.LayoutParams(dp(280), dp(280), Gravity.CENTER));
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.approved_mark);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        mark.addView(icon, new FrameLayout.LayoutParams(dp(164), dp(164), Gravity.CENTER));
        layout.addView(mark, new LinearLayout.LayoutParams(dp(280), dp(280)));
        return layout;
    }

    private void applyAppearance(boolean dark) {
        darkTheme = dark;
        setTheme(dark ? R.style.AppThemeDark : R.style.AppThemeLight);
        int bg = AppAppearance.background(dark);
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility((decor.getSystemUiVisibility() & ~mask) | (dark ? 0 : mask));
        if (Build.VERSION.SDK_INT >= 30 && getWindow().getInsetsController() != null) {
            int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : appearance, appearance);
        }
        if (root != null) root.setBackgroundColor(bg);
        if (web != null) web.setBackgroundColor(bg);
        // Android 12+ remembers this for the next system launch screen.
        if (Build.VERSION.SDK_INT >= 31 && (appliedNightMode == null || appliedNightMode != dark)) {
            appliedNightMode = dark;
            UiModeManager manager = getSystemService(UiModeManager.class);
            if (manager != null) manager.setApplicationNightMode(dark ? UiModeManager.MODE_NIGHT_YES : UiModeManager.MODE_NIGHT_NO);
        }
    }

    private void error(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    /** Read the verified primary SQLite state, keeping the old JSON as fallback. */
    private String storedState() {
        String backup=preferences.getString("state","");
        if(factMirrorDatabase==null||!preferences.getBoolean("m2_sqlite_primary",false))
            return backup;
        try {
            String primary=factMirrorDatabase.readVerifiedState();
            return primary==null?backup:primary;
        }catch(Exception error){
            Log.e("CourierSQLite","M2 verified read failed: "+error.getClass().getSimpleName());
            return backup;
        }
    }

    private boolean writeStateInternal(String value,boolean trackLocalSync) {
        try {
            if(value==null||value.getBytes(StandardCharsets.UTF_8).length>MAX_BYTES)return false;
            JSONObject parsed=new JSONObject(value);int schemaVersion=parsed.getInt("schemaVersion");
            if((schemaVersion<1||schemaVersion>6)||parsed.getJSONArray("entries").length()>10000)return false;
            String before=storedState();boolean saved;
            if(factMirrorDatabase!=null&&preferences.getBoolean("m2_sqlite_primary",false)) {
                factMirrorDatabase.mirrorLegacy(value);
                if(!factMirrorDatabase.matchesLegacy(value))return false;
                if(!preferences.edit().putString("state",value).commit())Log.w("CourierSQLite","Legacy backup update failed; SQLite commit retained");
                saved=true;
            } else {
                saved=preferences.edit().putString("state",value).commit();
                if(saved)mirrorFacts(value);
            }
            if(!saved)return false;
            if(trackLocalSync&&syncStore!=null&&syncStore.enabled())try{syncStore.recordLocalChanges(before,value);}
            catch(Exception queueError){syncStore.setLastError("Данные сохранены на устройстве; очередь синхронизации не обновлена.");Log.e("CourierSync","Local queue update failed: "+queueError.getClass().getSimpleName());}
            ForecastAutomation.scheduleDaily(this,value);ForecastAutomation.enqueueEvaluation(this);
            return true;
        } catch(Exception ignored) { return false; }
    }

    private boolean hasValidatedInternet() {
        try {
            ConnectivityManager manager=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
            Network network=manager==null?null:manager.getActiveNetwork();
            NetworkCapabilities caps=network==null||manager==null?null:manager.getNetworkCapabilities(network);
            return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                &&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch(Exception ignored) { return false; }
    }

    private String syncStatusJson() {
        try{return syncStore.status().put("sheetName","Courier Forecast").put("inProgress",syncInProgress).toString();}
        catch(Exception ignored){return "{\"enabled\":false,\"pending\":0,\"conflicts\":0,\"inProgress\":false}";}
    }

    private String syncConflictsJson() {
        JSONArray result=new JSONArray();
        try {
            for(M7SyncStore.Conflict conflict:syncStore.conflicts())result.put(new JSONObject().put("id",conflict.id).put("type",conflict.type)
                .put("recordId",conflict.recordId).put("localAction",conflict.localAction).put("localPayload",conflict.localPayload)
                .put("remoteAction",conflict.remoteAction).put("remotePayload",conflict.remotePayload));
        }catch(Exception error){Log.e("CourierSync","Conflict list read failed: "+error.getClass().getSimpleName());}
        return result.toString();
    }

    private void publishSyncState(String message) {
        if(web==null||isFinishing())return;
        String status=syncStatusJson(),conflicts=syncConflictsJson();
        web.evaluateJavascript("window.receiveSyncUpdate&&window.receiveSyncUpdate("+JSONObject.quote(status)+","+JSONObject.quote(conflicts)+","+JSONObject.quote(message==null?"":message)+")",null);
    }

    private void askGoogleSync(boolean enable) {
        if(syncInProgress){error("Синхронизация уже выполняется.");return;}
        if(!hasValidatedInternet()){publishSyncState("Интернета нет. Локальные изменения останутся в очереди.");return;}
        if(enable&&!syncStore.enabled()) {
            new AlertDialog.Builder(this).setTitle("Подключить Google")
                .setMessage("После разрешения Google приложение будет синхронизировать записи, настройки и закрытия периодов с таблицей Courier Forecast. Для обмена создаётся отдельный лист __CourierSync; прогнозы и видео в него не отправляются. Google запрашивает доступ к таблицам, а приложение использует только эту таблицу.")
                .setNegativeButton("Отмена",(dialog,which)->publishSyncState(""))
                .setPositiveButton("Продолжить",(dialog,which)->{enableSyncAfterAuthorization=true;requestGoogleAuthorization();}).show();
        } else {enableSyncAfterAuthorization=false;requestGoogleAuthorization();}
    }

    private void requestGoogleAuthorization() {
        try {
            AuthorizationRequest request=AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(M7GoogleSheetsSync.OAUTH_SCOPE))).build();
            Identity.getAuthorizationClient(this).authorize(request).addOnSuccessListener(this,result->{
                if(result.hasResolution()) {
                    PendingIntent pending=result.getPendingIntent();
                    if(pending==null){finishAuthorization(null);return;}
                    try{startIntentSenderForResult(pending.getIntentSender(),AUTHORIZE_SYNC,null,0,0,0,null);}
                    catch(IntentSender.SendIntentException error){finishAuthorization(null);}
                } else finishAuthorization(result);
            }).addOnFailureListener(this,error->{enableSyncAfterAuthorization=false;publishSyncState("Не удалось получить разрешение Google. Очередь не изменена.");});
        } catch(Exception error){enableSyncAfterAuthorization=false;publishSyncState("Google authorization недоступен на этом устройстве.");}
    }

    private void finishAuthorization(AuthorizationResult result) {
        enableSyncAfterAuthorization=false;
        try {
            String token=result==null?null:result.getAccessToken();
            if(token==null||token.isEmpty()){publishSyncState("Разрешение Google не получено. Локальные данные сохранены.");return;}
            syncStore.setEnabled(true);runSync(token);
        } catch(Exception error){publishSyncState("Не удалось начать синхронизацию. Очередь сохранена.");}
    }

    private void runSync(String accessToken) {
        if(syncInProgress)return;
        syncInProgress=true;final String initialState=storedState();publishSyncState("");
        try {
            syncExecutor.execute(()->{
                try {
                    M7GoogleSheetsSync.Result result=M7GoogleSheetsSync.synchronize(accessToken,initialState,syncStore);
                    runOnUiThread(()->finishSync(result));
                } catch(Exception failure) {
                    runOnUiThread(()->{syncInProgress=false;String message=failure.getMessage()==null?"Синхронизация не завершена. Очередь сохранена.":failure.getMessage();publishSyncState(message);});
                }
            });
        } catch(Exception rejected){syncInProgress=false;publishSyncState("Синхронизация не запущена. Очередь сохранена.");}
    }

    private void finishSync(M7GoogleSheetsSync.Result result) {
        String current=storedState();String merged=current;int applied=0;java.util.List<M7SyncStore.RemoteEvent> appliedEvents=new java.util.ArrayList<>();
        try {
            Map<String,M7SyncStore.Record> now=syncStore.currentRecords(current);
            for(M7SyncStore.RemoteEvent remote:result.incoming) {
                String key=remote.type+"\u001f"+remote.recordId;String expected=result.expectedLocalHashes.get(key);
                M7SyncStore.Record currentRecord=now.get(key);String actual=currentRecord==null?null:currentRecord.hash;
                if(!same(expected,actual)) {
                    syncStore.createConflict(remote.type,remote.recordId,currentRecord==null?M7SyncStore.ACTION_DELETE:M7SyncStore.ACTION_UPSERT,
                        currentRecord==null?null:currentRecord.payload,remote.action,remote.payload,remote.id);
                    continue;
                }
                merged=applySyncRecord(merged,remote);applied++;appliedEvents.add(remote);
            }
            if(applied>0) {
                if(!writeStateInternal(merged,false))throw new IllegalStateException("Не удалось сохранить загруженные записи на устройстве.");
                for(M7SyncStore.RemoteEvent event:appliedEvents)syncStore.saveHead(event);
                if(web!=null)web.evaluateJavascript("window.receiveSyncedState&&window.receiveSyncedState("+JSONObject.quote(merged)+")",null);
            }
            syncStore.markSyncComplete();syncInProgress=false;
            publishSyncState("Синхронизация завершена. Отправлено: "+result.pushed+", получено: "+applied+".");
        } catch(Exception error) {
            syncInProgress=false;syncStore.setLastError("Полученные изменения не подтверждены локальным сохранением.");
            Log.e("CourierSync","Sync merge failed: "+error.getClass().getSimpleName());publishSyncState("Не удалось применить данные Google. Повторите синхронизацию.");
        }
    }

    private static boolean same(String a,String b){return a==null?b==null:a.equals(b);}

    private String applySyncRecord(String raw,M7SyncStore.RemoteEvent event) throws Exception {
        JSONObject state=raw==null||raw.isEmpty()?new JSONObject().put("schemaVersion",6).put("entries",new JSONArray()).put("closures",new JSONObject()).put("settings",new JSONObject()):new JSONObject(raw);
        boolean delete=!M7SyncStore.ACTION_UPSERT.equals(event.action)||event.payload==null;
        JSONObject payload=delete?null:new JSONObject(event.payload);
        if(M7SyncStore.TYPE_ENTRY.equals(event.type)) {
            JSONArray source=state.optJSONArray("entries");if(source==null)source=new JSONArray();JSONArray entries=new JSONArray();boolean found=false;
            for(int i=0;i<source.length();i++){JSONObject row=source.optJSONObject(i);if(row!=null&&event.recordId.equals(row.optString("id"))){found=true;if(!delete)entries.put(payload);}else if(row!=null)entries.put(row);}
            if(!found&&!delete)entries.put(payload);state.put("entries",entries);
        } else if(M7SyncStore.TYPE_CLOSURE.equals(event.type)) {
            JSONObject closures=state.optJSONObject("closures");if(closures==null)closures=new JSONObject();
            if(delete)closures.remove(event.recordId);else closures.put(event.recordId,payload);state.put("closures",closures);
        } else if(M7SyncStore.TYPE_SETTINGS.equals(event.type)) {
            if(delete)state.remove("settings");else state.put("settings",payload);
        }
        return state.toString();
    }

    private void mirrorFacts(String serialized) {
        if (serialized == null || serialized.isEmpty()) return;
        // During recovery or a legacy JVM probe, the mirror might not yet be
        // initialized. Saving the existing primary store must never fail here.
        if (factMirrorExecutor == null || factMirrorDatabase == null) return;
        try {
            factMirrorExecutor.execute(() -> {
                try {
                    if (!preferences.getBoolean("m2_sqlite_primary",false))
                        factMirrorDatabase.mirrorLegacy(preferences.getString("state",""));
                }
                catch (Exception error) {
                    // Never log private financial content or reject a valid save.
                    Log.e("CourierSQLite", "M2 shadow copy failed: " + error.getClass().getSimpleName());
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // Activity is closing. The next launch replays the committed JSON.
        }
    }

    public final class NativeBridge {
        @JavascriptInterface public double fontScale() { return getResources().getConfiguration().fontScale; }
        @JavascriptInterface public void applyTheme(String mode) {
            if (!"dark".equals(mode) && !"light".equals(mode)) return;
            runOnUiThread(() -> applyAppearance("dark".equals(mode)));
        }
        @JavascriptInterface public void feedback(String kind, boolean sound, boolean haptic) {
            if (!"tap".equals(kind) && !"success".equals(kind) && !"error".equals(kind)) return;
            runOnUiThread(() -> {
                if (sound) web.playSoundEffect(SoundEffectConstants.CLICK);
                if (haptic) {
                    int effect = HapticFeedbackConstants.KEYBOARD_TAP;
                    if (Build.VERSION.SDK_INT >= 30 && "success".equals(kind)) effect = HapticFeedbackConstants.CONFIRM;
                    if (Build.VERSION.SDK_INT >= 30 && "error".equals(kind)) effect = HapticFeedbackConstants.REJECT;
                    web.performHapticFeedback(effect);
                }
            });
        }
        @JavascriptInterface public String readState() { return storedState(); }
        @JavascriptInterface public boolean writeState(String value) { return writeStateInternal(value,true); }
        @JavascriptInterface public String syncStatus() { return syncStatusJson(); }
        @JavascriptInterface public String syncConflicts() { return syncConflictsJson(); }
        @JavascriptInterface public void connectGoogleSync() { runOnUiThread(()->askGoogleSync(true)); }
        @JavascriptInterface public void syncGoogleNow() { runOnUiThread(()->askGoogleSync(!syncStore.enabled())); }
        @JavascriptInterface public void disconnectGoogleSync() {
            runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setTitle("Отключить синхронизацию?")
                .setMessage("Новые изменения останутся на устройстве. Очередь и неразобранные конфликты сохранятся.")
                .setNegativeButton("Отмена",(d,w)->{})
                .setPositiveButton("Отключить",(d,w)->{
                    syncStore.setEnabled(false);syncStore.setRetryAt(0);syncStore.setLastError("");
                    RevokeAccessRequest revoke=RevokeAccessRequest.builder().setScopes(Collections.singletonList(new Scope(M7GoogleSheetsSync.OAUTH_SCOPE))).build();
                    Identity.getAuthorizationClient(MainActivity.this).revokeAccess(revoke)
                        .addOnSuccessListener(this,unused->publishSyncState("Синхронизация отключена. Локальные данные и очередь сохранены."))
                        .addOnFailureListener(this,error->publishSyncState("Синхронизация отключена на устройстве. Разрешение Google можно отозвать в настройках аккаунта."));
                }).show());
        }
        @JavascriptInterface public void resolveSyncConflict(String id,String choice) {
            if(id==null||id.length()>100||(!"local".equals(choice)&&!"remote".equals(choice)))return;
            runOnUiThread(()->{
                try {
                    M7SyncStore.Conflict conflict=syncStore.conflict(id);if(conflict==null)return;
                    if("local".equals(choice))syncStore.resolveLocal(conflict,storedState());
                    else {
                        String next=applySyncRecord(storedState(),new M7SyncStore.RemoteEvent(conflict.remoteEventId==null?"missing-"+id:conflict.remoteEventId,
                            conflict.type,conflict.recordId,conflict.remoteAction,null,conflict.remoteHash,conflict.remotePayload,0));
                        if(!writeStateInternal(next,false))throw new IllegalStateException("Не удалось сохранить выбранную версию.");
                        M7SyncStore.RemoteEvent accepted=syncStore.resolveRemote(conflict);if(accepted!=null&&!M7SyncStore.REMOTE_MISSING.equals(accepted.action))syncStore.saveHead(accepted);
                        web.evaluateJavascript("window.receiveSyncedState&&window.receiveSyncedState("+JSONObject.quote(next)+")",null);
                    }
                    publishSyncState("Решение сохранено. Другие данные не изменены.");
                } catch(Exception error){publishSyncState("Не удалось сохранить решение конфликта. Локальные данные сохранены.");}
            });
        }
        @JavascriptInterface public void importSyncFile() {
            runOnUiThread(()->{
                try {
                    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/csv","text/plain","application/octet-stream"});
                    startActivityForResult(intent,IMPORT_SYNC);
                } catch(Exception error){MainActivity.this.error("Не удалось открыть выбор файла.");}
            });
        }
        @JavascriptInterface public String pendingNativeForecasts() {
            try { return AutonomousForecastStore.automationSnapshots(factMirrorDatabase); }
            catch(Exception error) {
                Log.e("CourierForecast","Native snapshot handoff failed: "+error.getClass().getSimpleName());
                return "{\"snapshots\":[],\"models\":[]}";
            }
        }
        @JavascriptInterface public String pendingVideoResults() {
            JSONArray pending=new JSONArray();long total=0;
            try {
                File directory=new File(getFilesDir(),"video-import-results").getCanonicalFile();
                File[] files=directory.listFiles((dir,name)->name.matches("[0-9a-f]{64}\\.json"));
                if(files==null)return pending.toString();
                Arrays.sort(files,Comparator.comparingLong(File::lastModified));
                for(File file:files) {
                    if(pending.length()>=10||!file.isFile()||file.length()<=0||file.length()>1_500_000L
                            ||total+file.length()>5_000_000L)continue;
                    File checked=file.getCanonicalFile();
                    if(!checked.getPath().startsWith(directory.getPath()+File.separator))continue;
                    byte[] bytes=java.nio.file.Files.readAllBytes(checked.toPath());
                    JSONObject result=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                    JSONObject item=new JSONObject().put("sourceSha256",file.getName().substring(0,64))
                        .put("response",result.optString("response","")).put("message",result.optString("message",""));
                    if(item.optString("response").isEmpty())continue;
                    pending.put(item);total+=file.length();
                }
            }catch(Exception error){Log.e("CourierM4","Pending video result read failed: "+error.getClass().getSimpleName());}
            return pending.toString();
        }
        @JavascriptInterface public boolean acknowledgeVideoImport(String sourceSha256) {
            if(sourceSha256==null||!sourceSha256.matches("[0-9a-f]{64}"))return false;
            try {
                File root=new File(getFilesDir(),"video-import-results").getCanonicalFile();
                File result=new File(root,sourceSha256+".json").getCanonicalFile();
                return result.getPath().startsWith(root.getPath()+File.separator)&&(!result.exists()||result.delete());
            }catch(Exception ignored){return false;}
        }
        @JavascriptInterface public void ready() { runOnUiThread(() -> { if (launch != null) { root.removeView(launch); launch = null; } }); }
        @JavascriptInterface public void importVideo() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent();
                    intent.setClassName(MainActivity.this, "ru.courier.finance.M4VideoImportActivity");
                    intent.putExtra("m4.returnResult", true);
                    startActivityForResult(intent, IMPORT_VIDEO);
                } catch (Exception e) { error("Импорт видео появится после обновления приложения."); }
            });
        }
        @JavascriptInterface public void importData() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                    startActivityForResult(intent, IMPORT_FILE);
                } catch (Exception e) { error("Не удалось открыть выбор файла."); }
            });
        }
        @JavascriptInterface public void importForecast() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/json", "application/octet-stream"});
                    startActivityForResult(intent, IMPORT_FORECAST);
                } catch (Exception e) { error("Не удалось открыть выбор файла."); }
            });
        }
        @JavascriptInterface public void fetchWeather(String city, String timezone) {
            synchronized (MainActivity.this) { if (weatherLoading) return; weatherLoading=true; }
            new Thread(() -> {
                try {
                    String result=WeatherClient.fetch(city,timezone);
                    runOnUiThread(() -> { if (!isFinishing()) web.evaluateJavascript("window.receiveWeather("+JSONObject.quote(result)+")",null); });
                } catch (Exception e) {
                    runOnUiThread(() -> { if (!isFinishing()) web.evaluateJavascript("window.weatherFailed && window.weatherFailed()",null); });
                } finally { weatherLoading=false; }
            }).start();
        }
        @JavascriptInterface public void exportFile(String filename, String content, String mime, String mode) {
            if (filename == null || !filename.matches("courier-(report|backup|sync)-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.(md|json|csv)") || content == null) { error("Не удалось создать отчёт."); return; }
            final File file;
            try {
                byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > MAX_BYTES) throw new IllegalArgumentException();
                File dir = new File(getCacheDir(), "exports/" + UUID.randomUUID());
                if (!dir.mkdirs()) throw new IllegalStateException();
                file = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); out.getFD().sync(); }
            } catch (Exception e) { error("Не удалось сохранить файл отчёта."); return; }
            runOnUiThread(() -> {
                try {
                    if ("share".equals(mode)) {
                        Uri uri = new Uri.Builder().scheme("content").authority("ru.courier.finance.exports").appendPath(file.getParentFile().getName()).appendPath(file.getName()).build();
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(filename.endsWith(".json")?"application/json":filename.endsWith(".csv")?"text/csv":"text/plain");
                        send.putExtra(Intent.EXTRA_STREAM, uri);
                        send.putExtra(Intent.EXTRA_SUBJECT, "Доход курьера");
                        send.setClipData(ClipData.newUri(getContentResolver(), filename, uri));
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "Поделиться отчётом"));
                    } else {
                        pendingSave = file;
                        Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        save.addCategory(Intent.CATEGORY_OPENABLE);
                        save.setType(filename.endsWith(".json")?"application/json":filename.endsWith(".csv")?"text/csv":"text/markdown");
                        save.putExtra(Intent.EXTRA_TITLE, filename);
                        startActivityForResult(save, SAVE_FILE);
                    }
                } catch (Exception e) { error("Не удалось открыть меню. Попробуйте сохранить файл."); }
            });
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && root != null) root.requestApplyInsets();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if(requestCode==AUTHORIZE_SYNC) {
            if(resultCode==RESULT_OK&&data!=null) {
                try{finishAuthorization(Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data));}
                catch(Exception error){enableSyncAfterAuthorization=false;publishSyncState("Google не подтвердил разрешение. Очередь не изменена.");}
            } else {enableSyncAfterAuthorization=false;publishSyncState("Подключение Google отменено. Локальные данные сохранены.");}
            return;
        }
        if (requestCode == IMPORT_VIDEO) {
            if (resultCode == RESULT_OK && data != null) {
                String payload = data.getStringExtra("m4.video.result");
                if (payload != null && web != null) web.evaluateJavascript(
                    "window.receiveVideoImport && window.receiveVideoImport(" + JSONObject.quote(payload) + ")", null);
            }
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == SAVE_FILE && pendingSave != null) {
            File source = pendingSave;
            new Thread(() -> {
                try (InputStream in = new java.io.FileInputStream(source); OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
                    if (out == null) throw new IllegalStateException();
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    out.flush();
                    error("Файл сохранён");
                } catch (Exception e) { error("Не удалось сохранить файл в выбранную папку."); }
            }).start();
        } else if (requestCode == IMPORT_FILE || requestCode == IMPORT_FORECAST || requestCode == IMPORT_SYNC) {
            new Thread(() -> {
                try (InputStream in = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    if (in == null) throw new IllegalStateException();
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = in.read(buffer)) != -1) { out.write(buffer, 0, count); if (out.size() > MAX_BYTES) throw new IllegalArgumentException(); }
                    byte[] bytes = out.toByteArray();
                    boolean xlsx = requestCode == IMPORT_FORECAST && bytes.length>2 && bytes[0]=='P' && bytes[1]=='K';
                    String text = xlsx ? WorkbookReader.read(new ByteArrayInputStream(bytes))
                        : new String(bytes, StandardCharsets.UTF_8);
                    if (xlsx) {
                        try {
                            byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
                            StringBuilder digest=new StringBuilder(64);
                            for (byte h : hash) digest.append(String.format(java.util.Locale.ROOT,"%02x",h & 0xff));
                            String sha=digest.toString();
                            factMirrorDatabase.mirrorWorkbook(text,sha);
                            // Promote only after both source history and legacy
                            // JSON are verified. Preserve the old JSON as backup.
                            if(factMirrorDatabase.isApprovedPrimarySource(sha)
                               && !preferences.getBoolean("m2_sqlite_primary",false)){
                                String backup=preferences.getString("state","");
                                if(!backup.isEmpty()){
                                    // Do not race the asynchronous startup mirror.
                                    // First commit the freshest legacy JSON exactly.
                                    factMirrorDatabase.mirrorLegacy(backup);
                                    if(factMirrorDatabase.matchesLegacy(backup))
                                        preferences.edit().putBoolean("m2_sqlite_primary",true).commit();
                                }
                            }
                        } catch(Exception archiveError) {
                            // Old, user-visible import must continue. Source-parity
                            // migration is NOT marked successful on a shadow error.
                            Log.e("CourierSQLite","M2 workbook archival failed: "+archiveError.getClass().getSimpleName());
                        }
                    }
                    String callback = requestCode == IMPORT_FORECAST ? "window.receiveForecastImport" : requestCode == IMPORT_SYNC ? "window.receiveSyncImport" : "window.receiveImport";
                    runOnUiThread(() -> web.evaluateJavascript(callback + "(" + JSONObject.quote(text) + ")", null));
                } catch (Exception e) { error("Не удалось прочитать файл. Допустимы JSON и XLSX до 8 МБ без пароля."); }
            }).start();
        }
    }

    @Override public void onBackPressed() {
        handleBack();
    }
    private void handleBack() {
        web.evaluateJavascript("window.appBack ? window.appBack() : false", result -> {
            if (!"true".equals(result)) finish();
        });
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (pendingSave != null) out.putString("pendingSave", "exports/" + pendingSave.getParentFile().getName() + "/" + pendingSave.getName());
    }
    @Override protected void onDestroy() {
        factMirrorExecutor.shutdown();syncExecutor.shutdown(); // Queued writes finish; next launch also repairs interruption.
        if (web != null) { web.removeJavascriptInterface("CourierNative"); web.destroy(); }
        super.onDestroy();
    }
}
