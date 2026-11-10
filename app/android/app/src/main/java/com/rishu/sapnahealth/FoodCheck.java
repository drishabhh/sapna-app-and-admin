package com.rishu.sapnahealth;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Evening check for Rishu: at his chosen time, if Sapna hasn't logged any food today, ping his phone
 * (ntfy topic from his admin page). Runs natively, so it works even if she never opened the app today.
 * The app keeps "lastLogged" current; nothing is sent while the app is switched off.
 */
public class FoodCheck extends BroadcastReceiver {
    static final String PREFS = "sapna_foodcheck";
    static final String ACTION = "com.rishu.sapnahealth.FOOD_CHECK";
    private static final int RC = 7501;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    private static PendingIntent pi(Context c) {
        Intent i = new Intent(c, FoodCheck.class).setAction(ACTION);
        return PendingIntent.getBroadcast(c, RC, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean active(Context c) {
        SharedPreferences p = prefs(c);
        return p.getBoolean("enabled", false) && p.getString("topic", "").matches("[A-Za-z0-9_-]{12,64}") && !AppLock.on(c);
    }

    /** Arm the next check (today if the time hasn't passed, else tomorrow). Safe to call often. */
    static void schedule(Context c) {
        android.app.AlarmManager am = (android.app.AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (!active(c)) { if (am != null) am.cancel(pi(c)); return; }
        int mins = WaterReminder.mins(prefs(c).getString("time", "20:30"), 1230);
        Calendar at = Calendar.getInstance();
        at.set(Calendar.HOUR_OF_DAY, mins / 60); at.set(Calendar.MINUTE, mins % 60); at.set(Calendar.SECOND, 0); at.set(Calendar.MILLISECOND, 0);
        if (at.getTimeInMillis() <= System.currentTimeMillis() + 30_000L) at.add(Calendar.DAY_OF_YEAR, 1);
        WaterReminder.setAlarm(c, at.getTimeInMillis(), pi(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (!ACTION.equals(intent != null ? intent.getAction() : null)) return;
        final PendingResult done = goAsync();
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                SharedPreferences p = prefs(app);
                String t = today();
                if (active(app) && !t.equals(p.getString("lastLogged", "")) && !t.equals(p.getString("sentOn", ""))) {
                    String name = p.getString("name", "Sapna");
                    JSONObject body = new JSONObject()
                        .put("topic", p.getString("topic", ""))
                        .put("title", "No food logged today")
                        .put("message", name + " hasn’t logged any meals today — maybe a gentle check-in? 💛")
                        .put("tags", new JSONArray().put("plate_with_cutlery"));
                    if (post(body.toString())) p.edit().putString("sentOn", t).apply();
                }
            } catch (Exception ignored) {
            } finally {
                schedule(app); // tomorrow
                done.finish();
            }
        }).start();
    }

    private static boolean post(String json) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL("https://ntfy.sh/").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15_000); h.setReadTimeout(15_000);
            h.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = h.getOutputStream()) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
            int code = h.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (h != null) h.disconnect();
        }
    }
}
