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
        int streak = 0;
        String last = null;
        String workout = null;
        String name = "Sapna";
        Set<String> week = new HashSet<>();
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) {
                JSONObject j = new JSONObject(raw);
                streak = j.optInt("streak", 0);
                last = j.optString("lastActive", null);
                workout = j.optString("workoutOn", null);
                name = j.optString("name", name);
                JSONArray w = j.optJSONArray("week");
                if (w != null) for (int i = 0; i < w.length(); i++) week.add(w.optString(i));
            }
        } catch (Exception ignored) {}

        Calendar now = Calendar.getInstance();
        String today = key(now);
        Calendar y = (Calendar) now.clone();
        y.add(Calendar.DAY_OF_YEAR, -1);
        String yesterday = key(y);

        boolean done = today.equals(last);
        if (!done && !yesterday.equals(last)) streak = 0; // streak broke while the app was closed

        int doodle;
        String title;
        String sub;
        int hour = now.get(Calendar.HOUR_OF_DAY);
        if (done && today.equals(workout)) {
            doodle = R.drawable.doodle_dumbbell; title = "Workout done!"; sub = "Streak safe today";
        } else if (done) {
            doodle = R.drawable.doodle_thumbsup; title = "Streak safe"; sub = "See you tomorrow, " + name;
        } else if (streak == 0) {
            doodle = R.drawable.doodle_stretch; title = "Start a streak"; sub = "Log one meal today";
        } else if (hour >= 18) {
            doodle = R.drawable.doodle_water; title = "Still time!"; sub = "One log keeps it alive";
        } else {
            doodle = R.drawable.doodle_planning; title = "Keep it going"; sub = "Log a meal today";
        }

        Bundle opts = mgr.getAppWidgetOptions(id);
        int minW = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        boolean small = minW < 200;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), small ? R.layout.widget_streak_small : R.layout.widget_streak);
        v.setImageViewResource(R.id.doodle, doodle);
        v.setTextViewText(R.id.count, String.valueOf(streak));
        v.setTextViewText(R.id.label, streak == 1 ? "day streak" : "day streak");
        v.setInt(R.id.flame, "setImageAlpha", done ? 255 : 110);
        if (!small) {
            v.setTextViewText(R.id.title, title);
            v.setTextViewText(R.id.sub, sub);
            Calendar mon = (Calendar) now.clone();
            int dow = mon.get(Calendar.DAY_OF_WEEK); // Sunday = 1
            mon.add(Calendar.DAY_OF_YEAR, dow == Calendar.SUNDAY ? -6 : Calendar.MONDAY - dow);
            for (int i = 0; i < 7; i++) {
                String k = key(mon);
                boolean on = week.contains(k);
                boolean isToday = k.equals(today);
                v.setTextViewText(DOTS[i], on ? "✓" : LETTERS[i]);
                v.setInt(DOTS[i], "setBackgroundResource", on ? R.drawable.widget_dot_on : isToday ? R.drawable.widget_dot_today : R.drawable.widget_dot_off);
                v.setTextColor(DOTS[i], ctx.getResources().getColor(on ? R.color.widget_on_dot : R.color.widget_muted, ctx.getTheme()));
                mon.add(Calendar.DAY_OF_YEAR, 1);
            }
        }
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.root, pi);
        mgr.updateAppWidget(id, v);
    }
}
