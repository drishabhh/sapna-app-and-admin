package com.rishu.sapnahealth;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves a text file straight into the phone's public Downloads/Sapna Health folder
 * (visible in My Files / Files by Google) — no permission needed on Android 10+.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    /** True when this build contains the Firebase config (google-services.json from the CI secret). */
    @PluginMethod
    public void firebaseReady(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject r = new JSObject();
        r.put("ready", id != 0);
        call.resolve(r);
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String name = call.getString("fileName", "sapna-health.txt");
        String text = call.getString("text", "");
        String mime = call.getString("mime", "text/plain");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("unsupported");
            return;
        }
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Downloads.DISPLAY_NAME, name);
        v.put(MediaStore.Downloads.MIME_TYPE, mime);
        v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Sapna Health");
        v.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = null;
        try {
            uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("Could not create the file");
            try (OutputStream out = cr.openOutputStream(uri)) {
                if (out == null) throw new Exception("Could not open the file");
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            cr.update(uri, done, null, null);
            JSObject r = new JSObject();
            r.put("path", Environment.DIRECTORY_DOWNLOADS + "/Sapna Health/" + name);
            r.put("uri", uri.toString());
            call.resolve(r);
        } catch (Exception e) {
            if (uri != null) {
                try { cr.delete(uri, null, null); } catch (Exception ignored) {}
            }
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not save");
        }
    }
}
