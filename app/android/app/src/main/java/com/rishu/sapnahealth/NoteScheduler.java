package com.rishu.sapnahealth;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Notes Rishu schedules from the admin page ("at 7 am tomorrow: Good luck today!").
 * They arrive as a silent push (instant) or through the encrypted sync when the app opens (backup) —
 * both land here, keyed by id, so a note is never shown twice. Shown by an alarm, app open or not.
 */
public class NoteScheduler extends BroadcastReceiver {
    static final String PREFS = "sapna_notes";
    static final String ACTION_FIRE = "com.rishu.sapnahealth.NOTE_FIRE";
    static final String CHANNEL = "rishu";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONArray notes(Context c) {
        try { return new JSONArray(prefs(c).getString("notes", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static JSONArray cancelled(Context c) {
        try { return new JSONArray(prefs(c).getString("cancelled", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    private static boolean has(JSONArray a, String id) {
        for (int i = 0; i < a.length(); i++) if (id.equals(a.optString(i))) return true;
        return false;
    }

    private static PendingIntent pi(Context c, String id) {
        Intent i = new Intent(c, NoteScheduler.class).setAction(ACTION_FIRE).setData(Uri.parse("sapnanote://" + id));
        return PendingIntent.getBroadcast(c, 8800, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void save(Context c, JSONArray notes) {
        // keep upcoming notes and the last two days of shown ones
        JSONArray keep = new JSONArray();
        long cutoff = System.currentTimeMillis() - 2 * 86_400_000L;
        for (int i = 0; i < notes.length(); i++) {
            JSONObject n = notes.optJSONObject(i);
            if (n != null && (n.optLong("at") > cutoff || !n.optBoolean("fired"))) keep.put(n);
        }
        prefs(c).edit().putString("notes", keep.toString()).apply();
    }

    static synchronized void schedule(Context c, String id, long at, String title, String body) {
        if (id == null || id.isEmpty() || body == null || body.isEmpty()) return;
        if (has(cancelled(c), id)) return;
        JSONArray all = notes(c), out = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject n = all.optJSONObject(i);
            if (n == null) continue;
            if (id.equals(n.optString("id"))) {
                if (n.optBoolean("fired")) return; // already shown — a late duplicate must not show it again
                continue;
            }
            out.put(n);
        }
        try {
            JSONObject n = new JSONObject();
            n.put("id", id); n.put("at", at); n.put("title", title == null || title.isEmpty() ? "Rishu 💌" : title); n.put("body", body); n.put("fired", false);
            out.put(n);
        } catch (Exception ignored) {}
        save(c, out);
        if (at <= System.currentTimeMillis() + 5000) fire(c, id);
        else WaterReminder.setAlarm(c, at, pi(c, id));
    }

    static synchronized void cancel(Context c, String id) {
        if (id == null) return;
        JSONArray all = notes(c), out = new JSONArray();
        for (int i = 0; i < all.length(); i++) { JSONObject n = all.optJSONObject(i); if (n != null && !id.equals(n.optString("id"))) out.put(n); }
        save(c, out);
        JSONArray cx = cancelled(c);
        if (!has(cx, id)) cx.put(id);
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, cx.length() - 100); i < cx.length(); i++) trimmed.put(cx.optString(i));
        prefs(c).edit().putString("cancelled", trimmed.toString()).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pi(c, id));
    }

    /** After a reboot: re-arm upcoming notes; show any that came due while the phone was off. */
    static void rescheduleAll(Context c) {
        JSONArray all = notes(c);
        for (int i = 0; i < all.length(); i++) {
            JSONObject n = all.optJSONObject(i);
            if (n == null || n.optBoolean("fired")) continue;
            if (n.optLong("at") <= System.currentTimeMillis() + 5000) fire(c, n.optString("id"));
            else WaterReminder.setAlarm(c, n.optLong("at"), pi(c, n.optString("id")));
        }
    }

    static synchronized void fire(Context c, String id) {
        JSONArray all = notes(c);
        JSONObject note = null;
        for (int i = 0; i < all.length(); i++) { JSONObject n = all.optJSONObject(i); if (n != null && id.equals(n.optString("id"))) note = n; }
        if (note == null || note.optBoolean("fired")) return;
        try { note.put("fired", true); note.put("shownAt", System.currentTimeMillis()); } catch (Exception ignored) {}
        save(c, all);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "From Rishu", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("New plans and notes from Rishu");
                nm.createNotificationChannel(ch);
            }
        }
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, 8801, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Bitmap big = null;
        try { big = BitmapFactory.decodeResource(c.getResources(), R.drawable.doodle_love); } catch (Exception ignored) {}
        String body = note.optString("body");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_sapna)
            .setColor(0xFFFF7A59)
            .setContentTitle(note.optString("title", "Rishu 💌"))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openPi);
        if (big != null) b.setLargeIcon(big);
        try { NotificationManagerCompat.from(c).notify(8000 + Math.floorMod(id.hashCode(), 900), b.build()); } catch (SecurityException ignored) {}
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (ACTION_FIRE.equals(intent.getAction()) && intent.getData() != null) fire(c, intent.getData().getHost());
    }
}
