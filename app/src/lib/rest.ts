import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Rest timer alarm: if she locks the phone between sets, it buzzes when rest is over.
 * Only scheduled while the app is in the background (in the app, the timer itself buzzes),
 * so she never gets both. Id ≥ 900000 so the daily reminder re-plan leaves it alone.
 */
const ID = 980_001;
let pending: { at: number; next: string } | null = null;

async function arm() {
  if (!pending || pending.at <= Date.now() + 1500) return;
  try {
    await LocalNotifications.schedule({ notifications: [{ id: ID, channelId: 'rest', title: 'Rest over 💪', body: pending.next, smallIcon: 'ic_stat_sapna', iconColor: '#C6F432', schedule: { at: new Date(pending.at), allowWhileIdle: true } }] });
  } catch { /* notifications off */ }
}
async function disarm() { try { await LocalNotifications.cancel({ notifications: [{ id: ID }] }); } catch { /* none */ } }

let wired = false;
function wire() {
  if (wired || !Capacitor.isNativePlatform()) return;
  wired = true;
  LocalNotifications.createChannel({ id: 'rest', name: 'Rest timer', description: 'Buzzes when rest between sets is over', importance: 4, vibration: true }).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') arm(); else disarm(); });
}

export function scheduleRestAlarm(at: number, next: string) {
  pending = { at, next }; wire();
  if (document.visibilityState === 'hidden') arm();
}
export function cancelRestAlarm() {
  pending = null;
  if (Capacitor.isNativePlatform()) disarm();
}
