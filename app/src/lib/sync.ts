import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { useEffect, useState } from 'react';

/**
 * Live sync with Rishu's admin page.
 *
 * Her dashboard (buildReport) is gzipped and encrypted on the phone (AES-256-GCM, key from
 * the pairing code) and written to ONE file in Rishu's PRIVATE GitHub repo. Each sync replaces
 * the previous one (a fresh parent-less commit, force-moved branch) so the repo never grows a
 * history of her data. The admin page holds the same key and decrypts it.
 *
 * The token in the pairing code can only touch that one private repo.
 * Credentials live in their own file, never in her backup export.
 */

export const SYNC_FILE = 'dashboard.enc.json';
const CFG_FILE = 'sync.json';
const LS_CFG = 'sapna_sync_v1';
const API = 'https://api.github.com';

export interface SyncCfg {
  o: string; // owner
  r: string; // repo
  b: string; // branch
  t: string; // token (fine-grained, this repo only)
  k: string; // base64url AES-256 key
  lastAt?: number;
  lastHash?: string;
  error?: string;
  /** seconds between checks while the app is open (default 20) */
  every?: number;
}

export const SYNC_EVERY_DEFAULT = 20;
export async function setSyncEvery(sec: number) {
  const c = cfg || (await loadSyncCfg());
  if (c) await saveCfg({ ...c, every: sec });
}

/* ---------------- config ---------------- */

const native = () => Capacitor.isNativePlatform();
let cfg: SyncCfg | null = null;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function loadSyncCfg(): Promise<SyncCfg | null> {
  if (loaded) return cfg;
  let text: string | null = null;
  if (native()) {
    try {
      const r = await Filesystem.readFile({ path: CFG_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      text = typeof r.data === 'string' ? r.data : null;
    } catch { /* not paired */ }
  } else {
    try { text = localStorage.getItem(LS_CFG); } catch { /* blocked */ }
  }
  try { cfg = text ? (JSON.parse(text) as SyncCfg) : null; } catch { cfg = null; }
  loaded = true;
  emit();
  return cfg;
}

async function saveCfg(c: SyncCfg | null) {
  cfg = c;
  emit();
  const text = c ? JSON.stringify(c) : '';
  if (native()) {
    try {
      if (c) await Filesystem.writeFile({ path: CFG_FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: text });
      else await Filesystem.deleteFile({ path: CFG_FILE, directory: Directory.Data });
    } catch { /* ignore */ }
  } else {
    try { if (c) localStorage.setItem(LS_CFG, text); else localStorage.removeItem(LS_CFG); } catch { /* ignore */ }
  }
}

export function useSyncCfg(): SyncCfg | null {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    loadSyncCfg();
    return () => { subs.delete(f); };
  }, []);
  return cfg;
}

/** "SAPNA-SYNC-1:<base64url json>" made by the admin page. */
export function parsePairing(code: string): SyncCfg | null {
  const m = code.trim().match(/SAPNA-SYNC-1:([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const j = JSON.parse(new TextDecoder().decode(b64uDec(m[1])));
    if (!j.o || !j.r || !j.t || !j.k) return null;
    return { o: String(j.o), r: String(j.r), b: String(j.b || 'main'), t: String(j.t), k: String(j.k) };
  } catch {
    return null;
  }
}

/* ---------------- crypto ---------------- */

function b64uEnc(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64Std(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64uDec(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(bytes: Uint8Array): Promise<{ data: Uint8Array; z: boolean }> {
  if (typeof CompressionStream === 'undefined') return { data: bytes, z: false };
  const cs = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return { data: new Uint8Array(await new Response(cs).arrayBuffer()), z: true };
}

async function sha256(text: string): Promise<string> {
  return b64uEnc(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function encrypt(json: string, keyB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b64uDec(keyB64) as BufferSource, 'AES-GCM', false, ['encrypt']);
  const { data, z } = await gzip(new TextEncoder().encode(json));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource);
  return JSON.stringify({ type: 'sapna-sync', v: 1, alg: 'A256GCM', z, iv: b64uEnc(iv), ct: b64uEnc(ct), at: new Date().toISOString() });
}

/* ---------------- GitHub ---------------- */

class SyncError extends Error {
  constructor(msg: string, public status = 0) { super(msg); }
}

async function gh(c: SyncCfg, path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}/repos/${c.o}/${c.r}${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new SyncError((j as { message?: string }).message || `GitHub ${res.status}`, res.status);
  return j as Record<string, unknown>;
}

/** Replace the one file with a fresh parent-less commit — no history of her data piles up. */
async function putFile(c: SyncCfg, text: string) {
  let blob: Record<string, unknown>;
  try {
    blob = await gh(c, '/git/blobs', 'POST', { content: text, encoding: 'utf-8' });
  } catch (e) {
    // Brand-new empty repo: the git data API needs a first commit — make it with the contents API.
    if (e instanceof SyncError && e.status === 409) {
      await gh(c, `/contents/${SYNC_FILE}`, 'PUT', { message: 'sync', content: b64Std(new TextEncoder().encode(text)), branch: c.b });
      return;
    }
    throw e;
  }
  const tree = await gh(c, '/git/trees', 'POST', { tree: [{ path: SYNC_FILE, mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await gh(c, '/git/commits', 'POST', { message: 'sync', tree: tree.sha, parents: [] });
  try {
    await gh(c, `/git/refs/heads/${c.b}`, 'PATCH', { sha: commit.sha, force: true });
  } catch (e) {
    if (e instanceof SyncError && (e.status === 404 || e.status === 422)) await gh(c, '/git/refs', 'POST', { ref: `refs/heads/${c.b}`, sha: commit.sha });
    else throw e;
  }
}

function friendly(e: unknown): string {
  if (e instanceof SyncError) {
    if (e.status === 401) return 'The sync key expired or was removed. Ask Rishu for a new code.';
    if ((e.status === 403 && !/rate limit/i.test(e.message)) || e.status === 404) return 'No access to Rishu’s sync repo. Ask him for a new code.';
    return e.message;
  }
  return navigator.onLine === false ? 'Offline — will sync when you are back online.' : 'Could not reach GitHub — will retry.';
}

/* ---------------- push ---------------- */

let inflight: Promise<boolean> | null = null;
let lastTry = 0;
let backoffUntil = 0; // GitHub said "slow down" — wait before trying again

/**
 * Upload her dashboard. Skips when nothing changed since the last upload (unless forced).
 * `minGapMs` keeps uploads from piling up while she is tapping around.
 */
export function pushReport(report: Record<string, unknown>, opts: { force?: boolean; minGapMs?: number } = {}): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const c = cfg || (await loadSyncCfg());
    if (!c) return false;
    const { generatedAt: _g, ...stable } = report;
    const hash = await sha256(JSON.stringify(stable));
    if (!opts.force && hash === c.lastHash && !c.error) return true;
    if (!opts.force && opts.minGapMs && Date.now() - lastTry < opts.minGapMs) return false;
    if (!opts.force && Date.now() < backoffUntil) return false;
    lastTry = Date.now();
    try {
      await putFile(c, await encrypt(JSON.stringify(report), c.k));
      await saveCfg({ ...c, lastAt: Date.now(), lastHash: hash, error: undefined });
      return true;
    } catch (e) {
      // Rate limited (403 with "rate limit" / 429): pause 5 min quietly instead of erroring.
      if (e instanceof SyncError && (e.status === 429 || (e.status === 403 && /rate limit|abuse|secondary/i.test(e.message)))) {
        backoffUntil = Date.now() + 5 * 60_000;
        return false;
      }
      await saveCfg({ ...c, error: friendly(e) });
      return false;
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Pair with the code Rishu sent, and prove it works with a first upload. */
export async function connectSync(code: string, report: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const c = parsePairing(code);
  if (!c) return { ok: false, error: 'That doesn’t look like Rishu’s sync code. Copy the whole message.' };
  if (!globalThis.crypto?.subtle) return { ok: false, error: 'This phone’s browser engine can’t encrypt. Update Android System WebView.' };
  try {
    await putFile(c, await encrypt(JSON.stringify(report), c.k));
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
  const { generatedAt: _g, ...stable } = report;
  await saveCfg({ ...c, lastAt: Date.now(), lastHash: await sha256(JSON.stringify(stable)) });
  return { ok: true };
}

export async function disconnectSync() {
  await saveCfg(null);
}
