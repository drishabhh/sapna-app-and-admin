import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Instant notifications from Rishu (Firebase Cloud Messaging).
 * Her device address ("FCM token") travels to his admin page inside the encrypted live sync.
 * When he publishes a plan, his admin sends a push; tapping it opens the Workout tab with the
 * plan fetched straight from GitHub.
 */

const LS = 'sapna_push_token';
export const PUSH_CHANNEL = 'rishu';
let token: string | null = (() => { try { return localStorage.getItem(LS); } catch { return null; } })();
let tokenAt = 0;

const LS_SEEN = 'sapna_push_seen';
function seen(): { at: number; title?: string } | null { try { return JSON.parse(localStorage.getItem(LS_SEEN) || 'null'); } catch { return null; } }
function markSeen(title?: string) { try { localStorage.setItem(LS_SEEN, JSON.stringify({ at: Date.now(), title })); } catch { /* ignore */ } }

/** Goes into the encrypted sync so Rishu's admin can push to this phone and see it arrived. */
export function pushToken(): { token: string; at: number; seen: { at: number; title?: string } | null } | null {
  return token ? { token, at: tokenAt || 0, seen: seen() } : null;
}

export interface PushHandlers {
  /** a push arrived while the app is open */
  onReceived: (data: Record<string, string>, title?: string, body?: string) => void;
  /** she tapped a push notification */
  onTapped: (data: Record<string, string>) => void;
}

const FileSaver = registerPlugin<{ firebaseReady(): Promise<{ ready: boolean }> }>('FileSaver');

let started = false;
export async function initPush(h: PushHandlers): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  // A build without the Firebase config must never touch FCM (it would crash).
  try { if (!(await FileSaver.firebaseReady()).ready) return; } catch { return; }
  try {
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL, name: 'From Rishu', description: 'New plans and notes from Rishu',
      importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#FF7A59',
    });
  } catch { /* older Android */ }
  await PushNotifications.addListener('registration', (t) => {
    token = t.value; tokenAt = Date.now();
    try { localStorage.setItem(LS, t.value); } catch { /* ignore */ }
  });
  await PushNotifications.addListener('registrationError', () => { /* no Play services / offline — local reminders still work */ });
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    const data = (n.data || {}) as Record<string, string>;
    markSeen(n.title);
    // Android doesn't show a push banner while the app is open — show it ourselves.
    LocalNotifications.schedule({ notifications: [{ id: 900000 + Math.floor(Math.random() * 9999), title: n.title || 'From Rishu', body: n.body || '', channelId: PUSH_CHANNEL, smallIcon: 'ic_stat_sapna', iconColor: '#FF7A59', extra: data }] }).catch(() => {});
    h.onReceived(data, n.title, n.body);
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => { markSeen(a.notification.title); h.onTapped((a.notification.data || {}) as Record<string, string>); });
  // our own in-app copy of a push, when tapped
  await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const extra = (a.notification.extra || {}) as Record<string, string>;
    if (extra.kind) h.onTapped(extra);
  });
  try {
    let p = await PushNotifications.checkPermissions();
    if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await PushNotifications.requestPermissions();
    if (p.receive === 'granted') await PushNotifications.register();
  } catch { /* ignore */ }
}
