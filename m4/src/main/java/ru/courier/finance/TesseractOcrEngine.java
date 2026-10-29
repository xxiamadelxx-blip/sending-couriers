package ru.courier.finance;

import android.content.Context;
import android.graphics.Bitmap;
import android.content.res.AssetManager;

import com.googlecode.tesseract.android.TessBaseAPI;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/** Bundled, network-free Russian + English OCR. All methods run off the UI thread. */
public final class TesseractOcrEngine implements AutoCloseable {
    public static final String VERSION = "tesseract4android-4.9.0-tessdata-fast-87416418";
    private final TessBaseAPI engine;

    public TesseractOcrEngine(Context context) throws Exception {
        File dataRoot = new File(context.getFilesDir(), "m4-ocr");
        File tessdata = new File(dataRoot, "tessdata");
        if (!tessdata.isDirectory() && !tessdata.mkdirs()) throw new IllegalStateException("Cannot create OCR data directory");
        AssetManager assets = context.getAssets();
        copyModelIfMissing(assets, "tessdata/rus.traineddata", new File(tessdata, "rus.traineddata"));
        copyModelIfMissing(assets, "tessdata/eng.traineddata", new File(tessdata, "eng.traineddata"));
        engine = new TessBaseAPI();
        if (!engine.init(dataRoot.getAbsolutePath() + File.separator, "rus+eng", TessBaseAPI.OEM_LSTM_ONLY)) {
            engine.recycle();
            throw new IllegalStateException("Bundled Russian/English OCR models could not be loaded");
        }
        engine.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO);
    }

    private static void copyModelIfMissing(AssetManager assets, String asset, File target) throws Exception {
        if (target.isFile() && target.length() > 1_000_000L) return;
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (InputStream input = assets.open(asset); FileOutputStream output = new FileOutputStream(temp)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.getFD().sync();
        }
        if (temp.length() < 1_000_000L) {
            temp.delete();
            throw new IllegalStateException("Bundled OCR model is incomplete: " + asset);
        }
        if(target.exists() && !target.delete()) { temp.delete(); throw new IllegalStateException("Cannot replace incomplete OCR model: " + asset); }
        if(!temp.renameTo(target)) { temp.delete(); throw new IllegalStateException("Cannot install OCR model: " + asset); }
    }

    public synchronized Recognition recognize(Bitmap bitmap) {
        engine.setImage(bitmap);
        String text = engine.getUTF8Text();
        float confidence = Math.max(0f, Math.min(1f, engine.meanConfidence() / 100f));
        return new Recognition(text == null ? "" : text.trim(), confidence);
    }

    @Override public void close() { engine.recycle(); }

    public static final class Recognition {
        public final String text;
        public final float confidence;
        Recognition(String text, float confidence) { this.text = text; this.confidence = confidence; }
    }
}
