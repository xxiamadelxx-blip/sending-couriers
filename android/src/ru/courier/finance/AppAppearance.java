package ru.courier.finance;

/** Colors shared by the activity, WebView, launch view and system bars. */
final class AppAppearance {
    static int background(boolean dark) { return dark ? 0xff10151a : 0xffeae7de; }
    static int foreground(boolean dark) { return dark ? 0xfff4f1e9 : 0xff1c252c; }
}
