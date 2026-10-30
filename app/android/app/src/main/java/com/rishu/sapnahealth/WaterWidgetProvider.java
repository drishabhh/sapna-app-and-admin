package com.rishu.sapnahealth;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
import android.widget.Toast;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen water widget: today's litres, a glass-style bar, a doodle that reacts — and "+ cup" that logs a drink
 * right from the home screen. Drinks tapped here wait in `pending` until the app opens and takes them (takeDrinks).
 * Everything stays on the phone.
 */
public class WaterWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "sapna_water_widget";
    static final String KEY = "json";
    static final String PENDING = "pending";
    static final String ACTION_DRINK = "com.rishu.sapnahealth.WATER_DRINK";

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, WaterWidgetProvider.class));
        for (int id : ids) draw(ctx, mgr, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Widgets.refreshAll(ctx);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        Widgets.refreshAll(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_DRINK.equals(intent.getAction())) drinkNow(ctx);
    }

    static String todayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
    }

    /** State for today; on a new day (app not opened yet) it starts from 0 with the base goal. */
    static JSONObject state(Context ctx) {
        JSONObject j;
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            j = raw != null ? new JSONObject(raw) : new JSONObject();
        } catch (Exception e) {
            j = new JSONObject();
        }
        try {
            if (!todayKey().equals(j.optString("date", ""))) {
                j.put("date", todayKey());
                j.put("ml", 0);
                j.put("goal", j.optInt("base", 2000));
            }
        } catch (Exception ignored) {}
        return j;
    }

    private static long lastTap = 0;

    static void drinkNow(Context ctx) {
        long now = System.currentTimeMillis();
        if (now - lastTap < 1200) return; // a double tap is one glass
        lastTap = now;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject j = state(ctx);
        int cup = Math.max(50, Math.min(1500, j.optInt("cup", 250)));
        int goal = j.optInt("goal", 2000);
        int before = j.optInt("ml", 0);
        try {
            j.put("ml", before + cup);
            JSONArray pend = new JSONArray(p.getString(PENDING, "[]"));
            JSONObject d = new JSONObject();
            d.put("at", now);
            d.put("ml", cup);
            pend.put(d);
            p.edit().putString(KEY, j.toString()).putString(PENDING, pend.toString()).apply();
        } catch (Exception ignored) {}
        Widgets.refreshAll(ctx);
        String msg = before < goal && before + cup >= goal ? "Goal hit! 💧 Hydrated queen." : "+" + cup + " ml 💧 " + WaterMood.litres(before + cup) + " today";
        try { Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show(); } catch (Exception ignored) {}
    }

    private static int mins(String hhmm, int fallback) {
        try {
            String[] a = hhmm.split(":");
            return Integer.parseInt(a[0]) * 60 + Integer.parseInt(a[1]);
        } catch (Exception e) {
            return fallback;
        }
    }

    static void draw(Context ctx, AppWidgetManager mgr, int id) {
        JSONObject j = state(ctx);
        int ml = j.optInt("ml", 0);
        int goal = Math.max(250, j.optInt("goal", 2000));
        int cup = j.optInt("cup", 250);
        String name = j.optString("name", "Sapna");
        Calendar now = Calendar.getInstance();
        Calendar noon = (Calendar) now.clone();
        noon.set(Calendar.HOUR_OF_DAY, 12); noon.set(Calendar.MINUTE, 0); noon.set(Calendar.SECOND, 0); noon.set(Calendar.MILLISECOND, 0);
        int dayIndex = (int) Math.floor(noon.getTimeInMillis() / 86400000.0);

        // The streak widget's doodle right now — only matters if that widget is on her home screen.
        String avoid = "";
        if (StreakWidgetProvider.ids(ctx).length > 0) {
            try { avoid = StreakWidgetProvider.current(ctx, now).mood.doodle; } catch (Exception ignored) {}
        }
        WaterMood.Mood mood = WaterMood.compute(ml, goal, name, now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE),
            mins(j.optString("from", "09:00"), 540), mins(j.optString("to", "21:00"), 1260), dayIndex, avoid);

        int doodle = ctx.getResources().getIdentifier("doodle_" + mood.doodle, "drawable", ctx.getPackageName());
        if (doodle == 0) doodle = R.drawable.doodle_bottle;
        int bg = "hot".equals(mood.tone) ? R.drawable.widget_water_bg_hot : "cool".equals(mood.tone) ? R.drawable.widget_water_bg_cool : R.drawable.widget_water_bg;
        int pct = Math.min(100, Math.round(ml * 100f / goal));

        Bundle opts = mgr.getAppWidgetOptions(id);
        int minW = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        boolean small = minW < 200;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), small ? R.layout.widget_water_small : R.layout.widget_water);
        v.setInt(R.id.root, "setBackgroundResource", bg);
        v.setImageViewResource(R.id.doodle, doodle);
        v.setTextViewText(R.id.amount, WaterMood.litres(ml));
        v.setProgressBar(R.id.progress, 100, pct, false);
        v.setTextViewText(R.id.add, "+ " + cup + " ml");
        if (!small) {
            v.setTextViewText(R.id.goal, "of " + WaterMood.litres(goal) + " · " + pct + "%");
            v.setTextViewText(R.id.title, mood.title);
            v.setTextViewText(R.id.sub, mood.sub);
        }
        v.setContentDescription(R.id.root, "Water: " + WaterMood.litres(ml) + " of " + WaterMood.litres(goal) + ". " + mood.title);

        // Tap the widget → the app's water sheet. Tap "+ cup" → log a drink here, no app needed.
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(ctx.getString(R.string.custom_url_scheme) + "://water"), ctx, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(ctx, 41, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent add = new Intent(ctx, WaterWidgetProvider.class).setAction(ACTION_DRINK);
        v.setOnClickPendingIntent(R.id.add, PendingIntent.getBroadcast(ctx, 42, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        mgr.updateAppWidget(id, v);
    }
}
