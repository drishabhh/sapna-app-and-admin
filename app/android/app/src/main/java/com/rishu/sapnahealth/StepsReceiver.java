package com.rishu.sapnahealth;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class StepsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (StepsReminder.ACTION_SNOOZE.equals(a)) {
            StepsReminder.snooze(c);
            return;
        }
        if (StepsReminder.ACTION_FIRE.equals(a)) {
            StepsReminder.fire(c);
            StepsReminder.scheduleDaily(c); // arm tomorrow (no-op for a snooze since it uses its own slot)
            return;
        }
        // BOOT_COMPLETED / MY_PACKAGE_REPLACED / TIME_SET: alarms are wiped, re-arm.
        StepsReminder.scheduleDaily(c);
        StreakWidgetProvider.refreshAll(c);
    }
}
