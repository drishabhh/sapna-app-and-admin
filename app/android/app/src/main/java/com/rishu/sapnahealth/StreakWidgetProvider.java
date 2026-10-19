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

    static void draw(Context ctx, AppWidgetManager mgr, int id) {
        String name = "Sapna";
        Set<Long> workouts = new HashSet<>();
        int[] gym = new int[0];
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) {
                JSONObject j = new JSONObject(raw);
                String n = j.optString("name", "");
                if (!n.isEmpty() && !"null".equals(n)) name = n;
                JSONArray w = j.optJSONArray("workouts");
                if (w != null) for (int i = 0; i < w.length(); i++) {
                    String k = w.optString(i, "");
                    if (k.length() >= 10) workouts.add(WorkoutStreak.epochDay(k));
                }
                JSONArray g = j.optJSONArray("gymDays");
                if (g != null) {
                    gym = new int[g.length()];
                    for (int i = 0; i < g.length(); i++) gym[i] = g.optInt(i);
                }
            }
        } catch (Exception ignored) {}

        Calendar now = Calendar.getInstance();
        String todayKey = key(now);
        long today = WorkoutStreak.epochDay(todayKey);
        Calendar noon = (Calendar) now.clone();
        noon.set(Calendar.HOUR_OF_DAY, 12); noon.set(Calendar.MINUTE, 0); noon.set(Calendar.SECOND, 0); noon.set(Calendar.MILLISECOND, 0);
        int dayIndex = (int) Math.floor(noon.getTimeInMillis() / 86400000.0);
        WorkoutStreak.State st = WorkoutStreak.state(workouts, gym, today);
        MoodEngine.Mood mood = WorkoutStreak.mood(st, name, now.get(Calendar.HOUR_OF_DAY), dayIndex);

        int doodle = ctx.getResources().getIdentifier("doodle_" + mood.doodle, "drawable", ctx.getPackageName());
        if (doodle == 0) doodle = R.drawable.doodle_thumbs;
        int bg = "hot".equals(mood.tone) ? R.drawable.widget_bg_hot : "cool".equals(mood.tone) ? R.drawable.widget_bg_cool : R.drawable.widget_bg;

        Bundle opts = mgr.getAppWidgetOptions(id);
        int minW = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        boolean small = minW < 200;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), small ? R.layout.widget_streak_small : R.layout.widget_streak);
        v.setInt(R.id.root, "setBackgroundResource", bg);
        v.setImageViewResource(R.id.doodle, doodle);
        v.setTextViewText(R.id.count, String.valueOf(st.streak));
        v.setTextViewText(R.id.label, small ? "workouts" : "workout streak");
        v.setInt(R.id.flame, "setImageAlpha", mood.lit ? 255 : 90);
        if (!small) {
            v.setTextViewText(R.id.title, mood.title);
            v.setTextViewText(R.id.sub, mood.sub);
            long mon = today - ((WorkoutStreak.dow(today) + 6) % 7); // Monday of this week
            for (int i = 0; i < 7; i++) {
                long k = mon + i;
                boolean on = workouts.contains(k);
                boolean isToday = k == today;
                boolean gymDay = gym.length == 0;
                for (int g : gym) if (g == WorkoutStreak.dow(k)) gymDay = true;
                v.setTextViewText(DOTS[i], on ? "\u2713" : LETTERS[i]);
                v.setInt(DOTS[i], "setBackgroundResource", on ? R.drawable.widget_dot_on : isToday ? R.drawable.widget_dot_today : gymDay ? R.drawable.widget_dot_off : R.drawable.widget_dot_rest);
                v.setTextColor(DOTS[i], ctx.getResources().getColor(on ? R.color.widget_on_dot : R.color.widget_muted, ctx.getTheme()));
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
