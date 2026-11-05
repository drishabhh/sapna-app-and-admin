import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Content } from './types';

/**
 * Rishu's on/off switch. Comes from two places — the published content (`lock`) and a silent push
 * that the phone stores natively — and the newer one wins. While on, the app shows only a blank
 * screen (with his one line of text, if any) and no reminders fire. Her data is never touched.
 */
export interface Lock { on: boolean; message: string; at: number }
const OFF: Lock = { on: false, message: '', at: 0 };
const P = registerPlugin<{ getLock(): Promise<Lock>; setLock(o: Lock): Promise<void> }>('StreakWidget');

export async function readNativeLock(): Promise<Lock | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try { const l = await P.getLock(); return { on: !!l.on, message: l.message || '', at: Number(l.at) || 0 }; } catch { return null; }
}

export function fromContent(c: Content): Lock {
  const l = c.lock;
  if (!l) return OFF;
  return { on: !!l.on, message: String(l.message || '').slice(0, 300), at: Date.parse(l.at || '') || 0 };
}

/** Newer wins; a tie goes to the published content. */
export function effectiveLock(c: Content, native: Lock | null): Lock {
  const pub = fromContent(c);
  return native && native.at > pub.at ? native : pub;
}

/** Keep the native copy in step (so reminders stop even if the app is closed). */
export async function storeNativeLock(l: Lock) {
  if (!Capacitor.isNativePlatform()) return;
  try { await P.setLock(l); } catch { /* older native build */ }
}

/** For Rishu's dashboard: confirmation that the switch reached her phone. */
let current: Lock = OFF;
export const setLockForReport = (l: Lock) => { current = l; };
export const lockForReport = () => ({ on: current.on, at: current.at });
