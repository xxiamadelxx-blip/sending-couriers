package ru.courier.finance;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

public final class ExportProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private File resolve(Uri uri) throws FileNotFoundException {
        try {
            List<String> parts = uri.getPathSegments();
            if (!"ru.courier.finance.exports".equals(uri.getAuthority()) || parts.size() != 2 || !parts.get(0).matches("[a-f0-9-]{36}") || !parts.get(1).matches("courier-(report|backup)-[0-9-]+\\.(md|json)")) throw new FileNotFoundException();
            File dir = new File(getContext().getCacheDir(), "exports");
            File file = new File(new File(dir, parts.get(0)), parts.get(1));
            if (!file.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator) || !file.isFile()) throw new FileNotFoundException();
            return file;
        } catch (Exception e) { throw new FileNotFoundException("Файл не найден"); }
    }
    @Override public String getType(Uri uri) { return uri.getLastPathSegment() != null && uri.getLastPathSegment().endsWith(".json") ? "application/json" : "text/markdown"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Только чтение");
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File file = resolve(uri);
            String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns, 1);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = file.getName();
                else if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
            }
            cursor.addRow(values);
            return cursor;
        } catch (FileNotFoundException e) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
