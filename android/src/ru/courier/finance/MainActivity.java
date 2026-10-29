package ru.courier.finance;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.UiModeManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
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
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int SAVE_FILE = 101, IMPORT_FILE = 102, IMPORT_FORECAST = 103;
    private static final int MAX_BYTES = 8_000_000;
    private WebView web;
    private FrameLayout root;
    private View launch;
    private SharedPreferences preferences;
    private CourierDatabase factMirrorDatabase;
    private final ExecutorService factMirrorExecutor = Executors.newSingleThreadExecutor();
    private File pendingSave;
    private boolean darkTheme = true;
    private Boolean appliedNightMode;
    private volatile boolean weatherLoading;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        preferences = getSharedPreferences("courier_finance", MODE_PRIVATE);
        factMirrorDatabase = new CourierDatabase(this);
        // Source of truth remains the existing, intact JSON until verified
        // M2 migration parity. Recover interrupted shadow writes on next launch.
        mirrorFacts(preferences.getString("state", ""));
        try { darkTheme = !"light".equals(new JSONObject(preferences.getString("state", "{}")).optJSONObject("settings").optString("theme")); }
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
    private void mirrorFacts(String serialized) {
        if (serialized == null || serialized.isEmpty()) return;
        // During recovery or a legacy JVM probe, the mirror might not yet be
        // initialized. Saving the existing primary store must never fail here.
        if (factMirrorExecutor == null || factMirrorDatabase == null) return;
        try {
            factMirrorExecutor.execute(() -> {
                try { factMirrorDatabase.mirrorLegacy(serialized); }
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
        @JavascriptInterface public String readState() { return preferences.getString("state", ""); }
        @JavascriptInterface public boolean writeState(String value) {
            try {
                if (value == null || value.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return false;
                JSONObject parsed = new JSONObject(value);
                int schemaVersion = parsed.getInt("schemaVersion");
                if ((schemaVersion != 1 && schemaVersion != 2 && schemaVersion != 3 && schemaVersion != 4 && schemaVersion != 5 && schemaVersion != 6) || parsed.getJSONArray("entries").length() > 10000) return false;
                boolean saved = preferences.edit().putString("state", value).commit();
                if (saved) mirrorFacts(value);
                return saved;
            } catch (Exception ignored) { return false; }
        }
        @JavascriptInterface public void ready() { runOnUiThread(() -> { if (launch != null) { root.removeView(launch); launch = null; } }); }
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
            if (filename == null || !filename.matches("courier-(report|backup)-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.(md|json)") || content == null) { error("Не удалось создать отчёт."); return; }
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
                        send.setType(filename.endsWith(".json") ? "application/json" : "text/plain");
                        send.putExtra(Intent.EXTRA_STREAM, uri);
                        send.putExtra(Intent.EXTRA_SUBJECT, "Доход курьера");
                        send.setClipData(ClipData.newUri(getContentResolver(), filename, uri));
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "Поделиться отчётом"));
                    } else {
                        pendingSave = file;
                        Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        save.addCategory(Intent.CATEGORY_OPENABLE);
                        save.setType(filename.endsWith(".json") ? "application/json" : "text/markdown");
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
        } else if (requestCode == IMPORT_FILE || requestCode == IMPORT_FORECAST) {
            new Thread(() -> {
                try (InputStream in = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    if (in == null) throw new IllegalStateException();
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = in.read(buffer)) != -1) { out.write(buffer, 0, count); if (out.size() > MAX_BYTES) throw new IllegalArgumentException(); }
                    byte[] bytes = out.toByteArray();
                    String text = requestCode == IMPORT_FORECAST && bytes.length>2 && bytes[0]=='P' && bytes[1]=='K'
                        ? WorkbookReader.read(new ByteArrayInputStream(bytes)) : new String(bytes, StandardCharsets.UTF_8);
                    String callback = requestCode == IMPORT_FORECAST ? "window.receiveForecastImport" : "window.receiveImport";
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
        factMirrorExecutor.shutdown(); // Queued writes finish; next launch also repairs interruption.
        if (web != null) { web.removeJavascriptInterface("CourierNative"); web.destroy(); }
        super.onDestroy();
    }
}
