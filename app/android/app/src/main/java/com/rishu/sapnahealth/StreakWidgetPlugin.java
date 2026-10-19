package com.rishu.sapnahealth;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
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
        StreakWidgetProvider.refreshAll(ctx);
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
