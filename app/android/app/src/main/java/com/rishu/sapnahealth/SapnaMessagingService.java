package com.rishu.sapnahealth;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Pushes from Rishu. Silent "schedule"/"unschedule" messages set up a note for later right on the phone
 * (works with the app closed); everything else goes to the normal push handling.
 */
public class SapnaMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        String kind = d.get("kind");
        if ("schedule".equals(kind)) {
            long at = 0;
            try { at = Long.parseLong(d.get("at")); } catch (Exception ignored) {}
            NoteScheduler.schedule(this, d.get("id"), at, d.get("title"), d.get("body"));
            return;
        }
        if ("lock".equals(kind)) {
            long at = 0;
            try { at = Long.parseLong(d.get("at")); } catch (Exception ignored) {}
            AppLock.save(this, "1".equals(d.get("on")) || "true".equals(d.get("on")), d.get("message"), at);
            super.onMessageReceived(msg); // if the app is open, it switches right away
            return;
        }
        if ("unschedule".equals(kind)) {
            NoteScheduler.cancel(this, d.get("id"));
            return;
        }
        super.onMessageReceived(msg);
    }
}
