package com.rishu.sapnahealth;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * 11:30 pm "How many steps today?" — scheduled natively so the 15-minute snooze works even when the app is closed.
 * State lives in SharedPreferences, written by the app through StreakWidgetPlugin.configureSteps().
 */
final class StepsReminder {
    static final String PREFS = "sapna_steps";
    static final String ACTION_FIRE = "com.rishu.sapnahealth.STEPS_FIRE";
    static final String ACTION_SNOOZE = "com.rishu.sapnahealth.STEPS_SNOOZE";
    static final String CHANNEL = "steps-night";
    static final int NOTIF_ID = 7300;
    private static final int RC_DAILY = 7301, RC_SNOOZE = 7302, RC_OPEN = 7303, RC_SNOOZE_BTN = 7304;
    static final int SNOOZE_MIN = 15;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
    }

    private static PendingIntent fireIntent(Context c, int rc) {
        Intent i = new Intent(c, StepsReceiver.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(c, rc, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void setAlarm(Context c, long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        // Inexact-but-idle-safe: no exact-alarm permission needed; Android may deliver a few minutes late.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    /** (Re)arm the next daily prompt, or cancel everything when turned off. */
    static void scheduleDaily(Context c) {
        SharedPreferences p = prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (!p.getBoolean("enabled", true)) {
            if (am != null) { am.cancel(fireIntent(c, RC_DAILY)); am.cancel(fireIntent(c, RC_SNOOZE)); }
            return;
        }
        String[] hm = p.getString("time", "23:30").split(":");
        int h = 23, m = 30;
        try { h = Integer.parseInt(hm[0]); m = Integer.parseInt(hm[1]); } catch (Exception ignored) {}
        Calendar at = Calendar.getInstance();
        at.set(Calendar.HOUR_OF_DAY, h);
        at.set(Calendar.MINUTE, m);
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        if (at.getTimeInMillis() <= System.currentTimeMillis() + 5000) at.add(Calendar.DAY_OF_YEAR, 1);
        setAlarm(c, at.getTimeInMillis(), fireIntent(c, RC_DAILY));
    }

    static void snooze(Context c) {
        NotificationManagerCompat.from(c).cancel(NOTIF_ID);
        setAlarm(c, System.currentTimeMillis() + SNOOZE_MIN * 60_000L, fireIntent(c, RC_SNOOZE));
    }

    /** Post the prompt unless she already logged steps today. */
    static void fire(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("enabled", true)) return;
        if (today().equals(p.getString("loggedOn", ""))) return;
        String name = p.getString("name", "Sapna");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Night steps", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("11:30 pm check-in for today's steps");
                nm.createNotificationChannel(ch);
            }
        }

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("com.rishu.sapnahealth://steps"), c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, RC_OPEN, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent sn = new Intent(c, StepsReceiver.class).setAction(ACTION_SNOOZE);
        PendingIntent snoozePi = PendingIntent.getBroadcast(c, RC_SNOOZE_BTN, sn, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Bitmap big = null;
        try { big = BitmapFactory.decodeResource(c.getResources(), R.drawable.doodle_phone); } catch (Exception ignored) {}

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_sapna)
            .setColor(0xFFFF7A59)
            .setContentTitle("How many steps today, " + name + "?")
            .setContentText("Night walk included. Log it — calories are worked out for you.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText("Night walk included. Open Samsung Health, copy today's steps and log them — calories are worked out for you."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(0, "Log steps", openPi)
            .addAction(0, "Remind in " + SNOOZE_MIN + " min", snoozePi);
        if (big != null) b.setLargeIcon(big);
        try {
            NotificationManagerCompat.from(c).notify(NOTIF_ID, b.build());
        } catch (SecurityException ignored) {
            // notifications not allowed — nothing to do
        }
    }
}
