package com.rishu.sapnahealth;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Water nudges, scheduled natively so "+ 250 ml" on the notification logs the glass right there —
 * no app opening. One alarm at a time: after each nudge (or drink) the next one is worked out again:
 * inside her hours, every N minutes counted from her last drink, none once today's goal is reached.
 * State = the water widget's state (WaterWidgetProvider prefs), kept current by the app and by every drink.
 */
final class WaterReminder {
    static final String ACTION_FIRE = "com.rishu.sapnahealth.WATER_FIRE";
    static final String ACTION_DRINK = "com.rishu.sapnahealth.WATER_NOTIF_DRINK";
    static final String ACTION_LATER = "com.rishu.sapnahealth.WATER_LATER";
    static final String CHANNEL = "water";
    static final int NOTIF_ID = 7400;
    private static final int RC_FIRE = 7401, RC_DRINK = 7402, RC_LATER = 7403, RC_OPEN = 7404;

    /** Pure: when the next nudge should come. dayStart = local midnight today. */
    static long next(int ml, int goal, long last, int everyMin, int fromMin, int toMin, long now, long dayStart) {
        long step = Math.max(30, everyMin) * 60_000L;
        if (toMin <= fromMin) toMin = fromMin + 720;
        long from = dayStart + fromMin * 60_000L, to = dayStart + toMin * 60_000L;
        if (ml < goal) {
            long n = from;
            if (last > 0) n = Math.max(n, last + step);
            int guard = 0;
            while (n <= now + 60_000L && guard++ < 200) n += step;
            if (n <= to) return n;
        }
        return dayStart + 86_400_000L + fromMin * 60_000L; // tomorrow, first thing in her hours
    }

    static int mins(String hhmm, int fallback) {
        try {
            String[] a = hhmm.split(":");
            return Integer.parseInt(a[0]) * 60 + Integer.parseInt(a[1]);
        } catch (Exception e) {
            return fallback;
        }
    }

    private static long dayStart() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    private static PendingIntent pi(Context c, String action, int rc) {
        Intent i = new Intent(c, WaterWidgetProvider.class).setAction(action);
        return PendingIntent.getBroadcast(c, rc, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Exact when the phone allows it, otherwise idle-safe (may be a few minutes late). */
    static void setAlarm(Context c, long at, PendingIntent p) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        }
    }

    /** Re-plan the single upcoming nudge from the current state. Safe to call often. */
    static void scheduleNext(Context c) {
        JSONObject j = WaterWidgetProvider.state(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent fire = pi(c, ACTION_FIRE, RC_FIRE);
        if (!j.optBoolean("enabled", false) || AppLock.on(c)) {
            if (am != null) am.cancel(fire);
            return;
        }
        long at = next(j.optInt("ml", 0), j.optInt("goal", 2000), j.optLong("last", 0), j.optInt("every", 120),
            mins(j.optString("from", "09:00"), 540), mins(j.optString("to", "21:00"), 1260), System.currentTimeMillis(), dayStart());
        setAlarm(c, at, fire);
    }

    static void snooze(Context c, int minutes) {
        NotificationManagerCompat.from(c).cancel(NOTIF_ID);
        setAlarm(c, System.currentTimeMillis() + minutes * 60_000L, pi(c, ACTION_FIRE, RC_FIRE));
    }

    /** "+ 250 ml" on the notification: log it (same queue as the widget), clear the nudge, plan the next one. */
    static void drinkFromNotification(Context c) {
        NotificationManagerCompat.from(c).cancel(NOTIF_ID);
        WaterWidgetProvider.drinkNow(c);
        scheduleNext(c);
    }

    static void fire(Context c) {
        JSONObject j = WaterWidgetProvider.state(c);
        if (!j.optBoolean("enabled", false) || AppLock.on(c)) return;
        int ml = j.optInt("ml", 0), goal = Math.max(250, j.optInt("goal", 2000)), cup = j.optInt("cup", 250);
        if (ml >= goal) { scheduleNext(c); return; }
        int left = goal - ml;
        String line = "Time for a glass of water.";
        JSONArray lines = j.optJSONArray("lines");
        if (lines != null && lines.length() > 0) line = lines.optString((int) ((System.currentTimeMillis() / 3_600_000L) % lines.length()), line);
        boolean first = ml == 0 && Calendar.getInstance().get(Calendar.HOUR_OF_DAY) < 12;
        String title = first ? "Good morning — water first 💧" : "Water break 💧";
        String body = line + " " + WaterMood.litres(left) + " to go today.";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Water", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("Water nudges — tap + to log a glass");
                nm.createNotificationChannel(ch);
            }
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(c.getString(R.string.custom_url_scheme) + "://water"), c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, RC_OPEN, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Bitmap big = null;
        try { big = BitmapFactory.decodeResource(c.getResources(), R.drawable.doodle_bottle); } catch (Exception ignored) {}
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_sapna)
            .setColor(0xFF4FD1FF)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(0, "+ " + cup + " ml 💧", pi(c, ACTION_DRINK, RC_DRINK))
            .addAction(0, "In 30 min", pi(c, ACTION_LATER, RC_LATER));
        if (big != null) b.setLargeIcon(big);
        try { NotificationManagerCompat.from(c).notify(NOTIF_ID, b.build()); } catch (SecurityException ignored) {}
        scheduleNext(c);
    }
}
