package ru.courier.finance;

/** One owner for system, camera-cutout and keyboard padding. Values are pixels. */
public final class SafeArea {
    private SafeArea() { }
    public static int[] padding(int left, int top, int right, int bottom, int imeBottom) {
        return new int[] { Math.max(0, left), Math.max(0, top),
            Math.max(0, right), Math.max(Math.max(0, bottom), imeBottom) };
    }
}
