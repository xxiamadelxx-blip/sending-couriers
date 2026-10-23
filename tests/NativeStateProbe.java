package ru.courier.finance;

import android.content.SharedPreferences;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.json.JSONArray;
import org.json.JSONObject;

/** Executes the actual compiled NativeBridge without constructing Android UI. */
public final class NativeStateProbe {
    private static String stored = "";
    private static String staged;
    private static boolean commitSucceeds = true;
    private static int commits;

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) throws Exception {
        check(java.util.Arrays.equals(SafeArea.padding(0, 80, 0, 24, 0), new int[]{0,80,0,24}), "portrait cutout is reserved");
        check(java.util.Arrays.equals(SafeArea.padding(90, 24, 20, 0, 0), new int[]{90,24,20,0}), "landscape cutout sides are reserved");
        check(java.util.Arrays.equals(SafeArea.padding(0, 80, 0, 24, 420), new int[]{0,80,0,420}), "keyboard max preserves automatic top inset");
        check(java.util.Arrays.equals(SafeArea.padding(0, 24, 0, 48, 20), new int[]{0,24,0,48}), "keyboard and navigation are not added twice");
        SharedPreferences.Editor editor = (SharedPreferences.Editor) Proxy.newProxyInstance(
            NativeStateProbe.class.getClassLoader(), new Class<?>[]{SharedPreferences.Editor.class},
            (proxy, method, values) -> {
                if (method.getName().equals("putString")) { staged = (String) values[1]; return proxy; }
                if (method.getName().equals("commit")) { commits++; if (commitSucceeds) stored = staged; return commitSucceeds; }
                throw new UnsupportedOperationException(method.getName());
            });
        SharedPreferences preferences = (SharedPreferences) Proxy.newProxyInstance(
            NativeStateProbe.class.getClassLoader(), new Class<?>[]{SharedPreferences.class},
            (proxy, method, values) -> {
                if (method.getName().equals("getString")) return stored;
                if (method.getName().equals("edit")) return editor;
                throw new UnsupportedOperationException(method.getName());
            });
        Class<?> unsafeClass = Class.forName("sun.misc.Unsafe");
        Field singleton = unsafeClass.getDeclaredField("theUnsafe"); singleton.setAccessible(true);
        MainActivity activity = (MainActivity) unsafeClass.getMethod("allocateInstance", Class.class)
            .invoke(singleton.get(null), MainActivity.class);
        Field field = MainActivity.class.getDeclaredField("preferences"); field.setAccessible(true); field.set(activity, preferences);
        MainActivity.NativeBridge bridge = activity.new NativeBridge();
        String legacy = "{\"schemaVersion\":1,\"entries\":[],\"closures\":{}}";
        check(bridge.writeState(legacy), "legacy format must remain writable");
        check(bridge.readState().equals(legacy), "committed legacy data must be read back");
        String previous = "{\"schemaVersion\":2,\"entries\":[],\"closures\":{}}";
        check(bridge.writeState(previous), "previous schema 2 must remain writable");
        check(bridge.readState().equals(previous), "committed schema 2 must be read back");
        String schema3 = "{\"schemaVersion\":3,\"entries\":[],\"closures\":{}}";
        check(bridge.writeState(schema3), "schema 3 remains writable");
        check(bridge.readState().equals(schema3), "schema 3 exact readback");
        String schema4 = "{\"schemaVersion\":4,\"entries\":[],\"closures\":{}}";
        check(bridge.writeState(schema4), "schema 4 remains writable");
        check(bridge.readState().equals(schema4), "schema 4 exact readback");
        check(bridge.writeState("{\"schemaVersion\":5,\"entries\":[],\"closures\":{}}"), "schema 5 remains writable");
        check(AppAppearance.background(true) == 0xff000000, "night surfaces are true black");
        check(AppAppearance.background(false) == 0xfff4f7f3, "day native and web backgrounds agree");
        check(AppAppearance.foreground(true) != AppAppearance.foreground(false), "native launch text has two palettes");
        String current = new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8);
        if (args.length > 1 && args[1].equals("--reproduce")) {
            check(!bridge.writeState(current), "old release should reproduce schema-3 rejection");
            check(bridge.readState().equals(previous), "old state must remain intact after rejection");
            System.out.println("REPRODUCED: actual NativeBridge rejects valid schema 3 before commit");
            return;
        }
        check(new JSONObject(current).getInt("schemaVersion") == 6, "fixture must use production schema 6");
        JSONArray slots = new JSONObject(current).getJSONArray("entries");
        check(slots.length() >= 2, "fixture must contain multiple slots");
        check(slots.getJSONObject(0).getString("date").equals(slots.getJSONObject(1).getString("date")), "fixture must exercise duplicate dates");
        check(!slots.getJSONObject(0).getString("id").equals(slots.getJSONObject(1).getString("id")), "slots must have separate IDs");
        check(bridge.writeState(current), "actual NativeBridge must accept production schema 6");
        check(bridge.readState().equals(current), "saved schema-6 slots must match exactly");
        String withinLimit = new JSONObject(current).put("probePadding", new String(new char[3000000]).replace('\0', 'я')).toString();
        check(bridge.writeState(withinLimit), "valid UTF-8 state below 8 MB must be writable");
        check(bridge.readState().equals(withinLimit), "large forecast backup must round-trip exactly");
        check(bridge.writeState(current), "restore fixture after capacity probe");
        int writes = commits;
        for (String invalid : new String[]{null, "{bad json", "{}", "{\"schemaVersion\":7,\"entries\":[]}", "{\"schemaVersion\":3,\"entries\":{}}"}) {
            check(!bridge.writeState(invalid), "invalid/future format must be rejected");
            check(commits == writes, "invalid input must not reach commit");
            check(bridge.readState().equals(current), "invalid input must not replace existing data");
        }
        JSONArray many = new JSONArray();
        for (int i = 0; i < 10001; i++) many.put(new JSONObject());
        check(!bridge.writeState(new JSONObject().put("schemaVersion", 3).put("entries", many).toString()), "entry limit must be checked");
        String large = new JSONObject().put("schemaVersion", 3).put("entries", new JSONArray())
            .put("note", new String(new char[4000001]).replace('\0', 'я')).toString();
        check(!bridge.writeState(large), "byte limit must include UTF-8 multibyte characters");
        check(commits == writes, "limits must reject before commit");
        commitSucceeds = false;
        check(!bridge.writeState(legacy), "commit failure must reach the caller");
        check(bridge.readState().equals(current), "failed disk write must retain durable state in the test store");
        System.out.println("PASS: actual compiled NativeBridge accepts schemas 1/2/3/4/5/6, commits and reads separate schema-6 slots exactly, rejects invalid/future/oversized input and returns commit failure");
    }
}
