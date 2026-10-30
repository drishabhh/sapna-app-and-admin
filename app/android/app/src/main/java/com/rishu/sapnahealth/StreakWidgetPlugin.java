package com.rishu.sapnahealth;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the streak summary from the app and redraws the home-screen widgets. */
@CapacitorPlugin(name = "StreakWidget")
public class StreakWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.length() > 20000) {
            call.reject("bad payload");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(StreakWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putString(StreakWidgetProvider.KEY, json).apply();
        Widgets.refreshAll(ctx);
        call.resolve();
    }

    /** enabled, time ("HH:MM"), name, loggedOn ("YYYY-MM-DD" when today's steps are in) */
    @PluginMethod
    public void configureSteps(PluginCall call) {
        Context ctx = getContext();
        StepsReminder.prefs(ctx).edit()
            .putBoolean("enabled", Boolean.TRUE.equals(call.getBoolean("enabled", true)))
            .putString("time", call.getString("time", "23:30"))
            .putString("name", call.getString("name", "Sapna"))
            .putString("loggedOn", call.getString("loggedOn", ""))
            .apply();
        StepsReminder.scheduleDaily(ctx);
        call.resolve();
    }

    /** Today's water facts for the water widget: {date, ml, goal, base, cup, from, to, name}. */
    @PluginMethod
    public void updateWater(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.length() > 5000) {
            call.reject("bad payload");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(WaterWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putString(WaterWidgetProvider.KEY, json).apply();
        Widgets.refreshAll(ctx);
        call.resolve();
    }

    /** Drinks she logged from the widget while the app was closed — handed over once, then cleared. */
    @PluginMethod
    public void takeDrinks(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(WaterWidgetProvider.PREFS, Context.MODE_PRIVATE);
        JSObject ret = new JSObject();
        try {
            ret.put("drinks", new JSArray(p.getString(WaterWidgetProvider.PENDING, "[]")));
        } catch (Exception e) {
            ret.put("drinks", new JSArray());
        }
        p.edit().putString(WaterWidgetProvider.PENDING, "[]").apply();
        call.resolve(ret);
    }

    @PluginMethod
    public void pinWater(PluginCall call) {
        call.resolve(pinFor(WaterWidgetProvider.class));
    }

    private JSObject pinFor(Class<?> cls) {
        JSObject ret = new JSObject();
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager mgr = getContext().getSystemService(AppWidgetManager.class);
            if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
                supported = mgr.requestPinAppWidget(new ComponentName(getContext(), cls), null, null);
            }
        }
        ret.put("supported", supported);
        return ret;
    }

    @PluginMethod
    public void pin(PluginCall call) {
        JSObject ret = new JSObject();
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager mgr = getContext().getSystemService(AppWidgetManager.class);
            if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
                supported = mgr.requestPinAppWidget(new ComponentName(getContext(), StreakWidgetProvider.class), null, null);
            }
        }
        ret.put("supported", supported);
        call.resolve(ret);
    }
}
