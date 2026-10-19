package com.rishu.sapnahealth;

import android.os.Build;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.annotation.RequiresApi;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StreakWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Draw behind the status and navigation bars on every Android version; the web layer
        // pads itself with the injected safe-area insets, so bars always match the app's background.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Android may kill the WebView's renderer while the app sits in the background (low memory).
        // Unhandled, that takes the whole app down. Instead rebuild the screen; the web layer
        // restores her place (drafts + data are on disk).
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            @RequiresApi(api = Build.VERSION_CODES.O)
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                runOnUiThread(() -> {
                    if (!isFinishing() && !isDestroyed()) recreate();
                });
                return true;
            }
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        StreakWidgetProvider.refreshAll(this);
    }
}
