package com.rishu.sapnahealth;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home-screen streak widget. All state comes from the app (SharedPreferences); nothing leaves the phone. */
public class StreakWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "sapna_streak_widget";
    static final String KEY = "json";
    private static final int[] DOTS = { R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6 };
    private static final String[] LETTERS = { "M", "T", "W", "T", "F", "S", "S" };

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, StreakWidgetProvider.class));
        for (int id : ids) draw(ctx, mgr, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        draw(ctx, mgr, id);
    }

    private static String key(Calendar c) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime());
    }

    private static long daysBetween(String from, String to) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Calendar a = Calendar.getInstance(); a.setTime(f.parse(from)); a.set(Calendar.HOUR_OF_DAY, 12);
            Calendar b = Calendar.getInstance(); b.setTime(f.parse(to)); b.set(Calendar.HOUR_OF_DAY, 12);
            return Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86400000.0);
        } catch (Exception e) {
            return 9999;
        }
    }

    private static String str(JSONObject j, String k) {
        if (j.isNull(k)) return null;
        String v = j.optString(k, null);
        return (v == null || v.isEmpty() || "null".equals(v)) ? null : v;
    }

    static void draw(Context ctx, AppWidgetManager mgr, int id) {
        int streak = 0;
        String last = null, prev = null, workout = null;
        String name = "Sapna";
        Set<String> week = new HashSet<>();
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) {
                JSONObject j = new JSONObject(raw);
                streak = j.optInt("streak", 0);
                last = str(j, "lastActive");
                prev = str(j, "prevActive");
                workout = str(j, "workoutOn");
                String n = str(j, "name");
                if (n != null) name = n;
                JSONArray w = j.optJSONArray("week");
                if (w != null) for (int i = 0; i < w.length(); i++) week.add(w.optString(i));
            }
        } catch (Exception ignored) {}

        Calendar now = Calendar.getInstance();
        String today = key(now);
        Integer gap = last == null ? null : (int) Math.max(0, daysBetween(last, today));
        boolean done = gap != null && gap == 0;
        if (gap != null && gap >= 2) streak = 0; // streak broke while the app was closed
        boolean comeback = done && streak == 1 && prev != null && daysBetween(prev, today) >= 2;
        Calendar noon = (Calendar) now.clone();
        noon.set(Calendar.HOUR_OF_DAY, 12); noon.set(Calendar.MINUTE, 0); noon.set(Calendar.SECOND, 0); noon.set(Calendar.MILLISECOND, 0);
        // same as the app: whole days from epoch to local noon (UTC ms)
        int dayIndex = (int) Math.floor(noon.getTimeInMillis() / 86400000.0);
        MoodEngine.Mood mood = MoodEngine.compute(name, streak, done, done && today.equals(workout), gap, comeback, now.get(Calendar.HOUR_OF_DAY), dayIndex);

        int doodle = ctx.getResources().getIdentifier("doodle_" + mood.doodle, "drawable", ctx.getPackageName());
        if (doodle == 0) doodle = R.drawable.doodle_thumbs;
        int bg = "hot".equals(mood.tone) ? R.drawable.widget_bg_hot : "cool".equals(mood.tone) ? R.drawable.widget_bg_cool : R.drawable.widget_bg;

        Bundle opts = mgr.getAppWidgetOptions(id);
        int minW = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        boolean small = minW < 200;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), small ? R.layout.widget_streak_small : R.layout.widget_streak);
        v.setInt(R.id.root, "setBackgroundResource", bg);
        v.setImageViewResource(R.id.doodle, doodle);
        v.setTextViewText(R.id.count, String.valueOf(streak));
        v.setTextViewText(R.id.label, "day streak");
        v.setInt(R.id.flame, "setImageAlpha", mood.lit ? 255 : 90);
        if (!small) {
            v.setTextViewText(R.id.title, mood.title);
            v.setTextViewText(R.id.sub, mood.sub);
            Calendar mon = (Calendar) now.clone();
            int dow = mon.get(Calendar.DAY_OF_WEEK); // Sunday = 1
            mon.add(Calendar.DAY_OF_YEAR, dow == Calendar.SUNDAY ? -6 : Calendar.MONDAY - dow);
            for (int i = 0; i < 7; i++) {
                String k = key(mon);
                boolean on = week.contains(k);
                boolean isToday = k.equals(today);
                v.setTextViewText(DOTS[i], on ? "\u2713" : LETTERS[i]);
                v.setInt(DOTS[i], "setBackgroundResource", on ? R.drawable.widget_dot_on : isToday ? R.drawable.widget_dot_today : R.drawable.widget_dot_off);
                v.setTextColor(DOTS[i], ctx.getResources().getColor(on ? R.color.widget_on_dot : R.color.widget_muted, ctx.getTheme()));
                mon.add(Calendar.DAY_OF_YEAR, 1);
            }
        } else {
            v.setContentDescription(R.id.root, mood.title + ". " + mood.sub);
        }
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.root, pi);
        mgr.updateAppWidget(id, v);
    }
}
