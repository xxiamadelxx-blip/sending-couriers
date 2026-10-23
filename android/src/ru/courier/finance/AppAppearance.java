package ru.courier.finance;

/** Colors shared by the activity, WebView, launch view and system bars. */
final class AppAppearance {
    static int background(boolean dark) { return dark ? 0xff000000 : 0xfff4f7f3; }
    static int foreground(boolean dark) { return dark ? 0xffedf2ee : 0xff18291f; }
}
