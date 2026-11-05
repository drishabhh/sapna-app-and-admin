package com.rishu.sapnahealth;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.core.app.NotificationManagerCompat;

/**
 * Rishu's on/off switch for the app. While off, the app shows a blank screen (optionally one line of text)
 * and no reminders fire. Her data is never touched. Set by a silent push (instant) and by the published
 * content (the app keeps both in step; the newer one wins).
 */
final class AppLock {
    static final String PREFS = "sapna_lock";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean on(Context c) { return prefs(c).getBoolean("on", false); }

    /** Only applied when newer than what the phone already has. */
    static void save(Context c, boolean on, String message, long at) {
        SharedPreferences p = prefs(c);
        if (at > 0 && at < p.getLong("at", 0)) return;
        p.edit().putBoolean("on", on).putString("message", message == null ? "" : message).putLong("at", at > 0 ? at : System.currentTimeMillis()).commit();
        if (on) {
            try { NotificationManagerCompat.from(c).cancel(WaterReminder.NOTIF_ID); } catch (Exception ignored) {}
            try { NotificationManagerCompat.from(c).cancel(StepsReminder.NOTIF_ID); } catch (Exception ignored) {}
        }
        WaterReminder.scheduleNext(c); // cancels the water chain while off, re-plans it when back on
    }
}
