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
        registerPlugin(FileSaverPlugin.class);
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
        capTextZoom();
    }

    @Override
    public void onResume() {
        super.onResume();
        capTextZoom(); // she may have changed the phone's font size while away
    }

    /** Follow the phone's font size (Samsung "Font size" / Android "Display size and text"), but only up to 130%,
     *  so very large settings can't push cards, tiles and buttons out of shape. The web layer is built for 85–130%. */
    private void capTextZoom() {
        try {
            if (bridge == null || bridge.getWebView() == null) return;
            int z = Math.round(getResources().getConfiguration().fontScale * 100f);
            bridge.getWebView().getSettings().setTextZoom(Math.max(85, Math.min(130, z)));
        } catch (Exception ignored) { }
    }

    @Override
    public void onPause() {
        super.onPause();
        StreakWidgetProvider.refreshAll(this);
    }
}
