import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

/**
 * Drafts = half-finished UI state (onboarding answers, an open sheet, text she typed).
 *
 * Android (Samsung especially) kills apps in the background to free memory. When she
 * comes back the app cold-starts, so anything that only lived in React state is gone.
 * Every draft is written to localStorage on each change and to a small file whenever the
 * app is hidden. On launch we restore them before the first screen renders.
 *
 * Her real logs are NOT drafts — they live in the data file (see storage.ts).
 */

const LS = 'sapna_ui_v1';
const FILE = 'ui-state.json';
const HOUR = 3600_000;
/** UI position (tab, open sheets) is only worth restoring for a while; typed text lasts longer. */
export const TTL = { nav: 6 * HOUR, text: 3 * 24 * HOUR, forever: 0 };

interface Entry { v: unknown; t: number; ttl: number }
interface Snapshot { savedAt: number; e: Record<string, Entry> }

// Synchronous first read so even components that render before initDrafts() see her drafts.
let snap: Snapshot = (() => {
  try { const s = parse(localStorage.getItem(LS)); return s ? prune(s) : { savedAt: 0, e: {} }; } catch { return { savedAt: 0, e: {} }; }
})();
let fileTimer: number | undefined;

const native = () => Capacitor.isNativePlatform();

function parse(text: string | null): Snapshot | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text) as Snapshot;
    return s && typeof s === 'object' && s.e && typeof s.e === 'object' ? s : null;
  } catch {
    return null;
  }
}

function prune(s: Snapshot): Snapshot {
  const now = Date.now();
  const e: Record<string, Entry> = {};
  for (const [k, x] of Object.entries(s.e)) if (!x.ttl || now - x.t < x.ttl) e[k] = x;
  return { savedAt: s.savedAt, e };
}

/** Load before the first render. Uses whichever copy (localStorage / file) is newer. */
export async function initDrafts(): Promise<void> {
  let a: Snapshot | null = null;
  try { a = parse(localStorage.getItem(LS)); } catch { /* blocked */ }
  let b: Snapshot | null = null;
  if (native()) {
    try {
      const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      b = parse(typeof r.data === 'string' ? r.data : null);
    } catch { /* first run */ }
  }
  const best = [a, b].filter(Boolean).sort((x, y) => y!.savedAt - x!.savedAt)[0];
  snap = best ? prune(best) : { savedAt: 0, e: {} };
}

function persist() {
  snap.savedAt = Date.now();
  const text = JSON.stringify(snap);
  try { localStorage.setItem(LS, text); } catch { /* full / blocked */ }
  if (native()) {
    if (fileTimer) window.clearTimeout(fileTimer);
    fileTimer = window.setTimeout(flushDrafts, 800);
  }
}

/** Write the file copy now (called when the app goes to the background). */
export function flushDrafts(): void {
  if (fileTimer) window.clearTimeout(fileTimer);
  fileTimer = undefined;
  if (!native()) return;
  Filesystem.writeFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: JSON.stringify(snap) }).catch(() => {});
}

export function getDraft<T>(key: string, fallback: T): T {
  const x = snap.e[key];
  if (!x) return fallback;
  if (x.ttl && Date.now() - x.t >= x.ttl) return fallback;
  return x.v as T;
}

export function hasDraft(key: string): boolean {
  return getDraft<unknown>(key, undefined) !== undefined;
}

export function setDraft(key: string, v: unknown, ttl = TTL.nav): void {
  snap.e[key] = { v, t: Date.now(), ttl };
  persist();
}

/** Forget every draft whose key starts with `prefix` (e.g. 'onb.' once onboarding is done). */
export function clearDrafts(prefix: string): void {
  let changed = false;
  for (const k of Object.keys(snap.e)) if (k.startsWith(prefix)) { delete snap.e[k]; changed = true; }
  if (changed) persist();
}

/** useState that survives the app being killed in the background. */
export function useDraft<T>(key: string, init: T | (() => T), ttl = TTL.nav): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => getDraft<T>(key, typeof init === 'function' ? (init as () => T)() : init));
  const ref = useRef(v);
  ref.current = v;
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const val = typeof next === 'function' ? (next as (p: T) => T)(ref.current) : next;
    ref.current = val;
    setDraft(key, val, ttl);
    setV(val);
  }, [key, ttl]);
  return [v, set];
}
