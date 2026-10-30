package com.rishu.sapnahealth;

import android.content.Context;

/** Both home-screen widgets are always redrawn together, so their doodles are chosen at the same moment and never match. */
final class Widgets {
    private Widgets() {}

    static void refreshAll(Context ctx) {
        StreakWidgetProvider.refreshAll(ctx);
        WaterWidgetProvider.refreshAll(ctx);
    }
}
