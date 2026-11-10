import { Capacitor } from '@capacitor/core';
import { Health } from '@capgo/capacitor-health';
import { addDays, keyOf, today } from './dates';
import type { AppData } from './types';

/**
 * Steps straight from Samsung Health (through Android's Health Connect) — no typing at 11:30 pm.
 * Reads the last 7 days each time the app opens, so the evening total lands the next morning too.
 * A day she (or Rishu) typed by hand is never overwritten.
 */
export type ConnectResult = 'ok' | 'denied' | 'missing' | 'web';

export const healthNative = () => Capacitor.getPlatform() === 'android';

export async function healthAvailable(): Promise<boolean> {
  if (!healthNative()) return false;
  try { return (await Health.isAvailable()).available; } catch { return false; }
}

export async function connectSteps(): Promise<ConnectResult> {
  if (!healthNative()) return 'web';
  if (!(await healthAvailable())) return 'missing';
  try {
    const r = await Health.requestAuthorization({ read: ['steps'] });
    return r.readAuthorized.includes('steps') ? 'ok' : 'denied';
  } catch { return 'denied'; }
}

export async function stepsAllowed(): Promise<boolean> {
  if (!healthNative()) return false;
  try { return (await Health.checkAuthorization({ read: ['steps'] })).readAuthorized.includes('steps'); } catch { return false; }
}

/** Health Connect settings (or the Play Store page when it's missing / needs an update). */
export async function openHealthSettings() {
  try { await Health.openHealthConnectSettings(); }
  catch { window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata', '_system'); }
}

/** Daily step totals for the last `days` days, keyed YYYY-MM-DD (local). */
export async function readSteps(days = 7): Promise<Record<string, number> | null> {
  if (!healthNative()) return null;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  try {
    const r = await Health.queryAggregated({ dataType: 'steps', startDate: start.toISOString(), endDate: new Date().toISOString(), bucket: 'day', aggregation: 'sum' });
    const out: Record<string, number> = {};
    for (const s of r.samples) { const k = keyOf(new Date(s.startDate)); out[k] = Math.round(s.value || 0); }
    return out;
  } catch { return null; }
}

/** Merge Health Connect totals into her log. Returns the new data, or null when nothing changed. */
export function mergeSteps(d: AppData, hc: Record<string, number>): AppData | null {
  const manual = d.stepsSrc || {};
  const steps = { ...d.steps };
  let changed = false;
  const oldest = addDays(today(), -13);
  for (const [k, v] of Object.entries(hc)) {
    if (k < oldest || k > today() || manual[k] === 'me' || !(v > 0) || steps[k] === v) continue;
    steps[k] = v; changed = true;
  }
  return changed ? { ...d, steps, health: { ...(d.health || { on: true }), at: Date.now() } } : null;
}
