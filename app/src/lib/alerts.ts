import type { AlertPrefs, AppData } from './types';

/**
 * Pings to Rishu's phone through ntfy (free app; he subscribes to a long secret topic his admin page made).
 * Only short lines go out — "Sapna finished Legs · 48 min · 2 new bests". If she's offline they wait and
 * go the next time the app is open.
 */
const Q = 'sapna_alert_q';
export type AlertKind = 'workout' | 'pr';
interface Msg { topic: string; title: string; message: string; tags: string[]; at: number }

export const validTopic = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(t);
export const alertsOn = (a: AlertPrefs | undefined, kind: AlertKind) => !!(a && validTopic(a.topic) && a[kind]);

function queue(): Msg[] { try { return JSON.parse(localStorage.getItem(Q) || '[]'); } catch { return []; } }
function save(q: Msg[]) { try { localStorage.setItem(Q, JSON.stringify(q.slice(-20))); } catch { /* full */ } }

async function post(m: Msg): Promise<boolean> {
  try {
    // plain-text body (no preflight); ntfy reads JSON posted to its root
    const res = await fetch('https://ntfy.sh/', { method: 'POST',
      body: JSON.stringify({ topic: m.topic, title: m.title, message: m.message, tags: m.tags }) });
    return res.ok;
  } catch { return false; }
}

export async function sendAlert(d: AppData, kind: AlertKind, title: string, message: string, tags: string[] = []) {
  if (!alertsOn(d.alerts, kind)) return;
  const m: Msg = { topic: d.alerts!.topic, title, message, tags, at: Date.now() };
  if (!(await post(m))) save([...queue(), m]);
}

let flushing = false;
/** Send what waited while she was offline (older than a day = stale, dropped). */
export async function flushAlerts() {
  if (flushing) return; flushing = true;
  try {
    const q = queue().filter((m) => Date.now() - m.at < 86_400_000);
    const left: Msg[] = [];
    for (const m of q) if (!(await post(m))) left.push(m);
    save(left);
  } finally { flushing = false; }
}
