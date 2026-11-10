import { useEffect, useState } from 'react';

/**
 * Exercise GIFs Rishu publishes live online. Gyms often have no signal, so every GIF in her plans is
 * downloaded once into a small on-phone store and shown from there — instantly, online or not.
 * Only https media is stored (GIFs shipped inside the app are already local).
 */
const DB = 'sapna-media', STORE = 'files';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((ok, bad) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
  return dbp;
}
const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise((ok, bad) => { const r = fn(d.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
};

const urls = new Map<string, string>(); // remote url → object URL (this session)

async function cachedUrl(src: string): Promise<string | null> {
  if (urls.has(src)) return urls.get(src)!;
  try {
    const blob = await tx<Blob | undefined>('readonly', (s) => s.get(src) as IDBRequest<Blob | undefined>);
    if (!blob) return null;
    const u = URL.createObjectURL(blob); urls.set(src, u); return u;
  } catch { return null; }
}

/** Download what isn't stored yet; forget media no plan uses any more. Quietly does nothing offline. */
export async function cacheMedia(list: string[]) {
  if (typeof indexedDB === 'undefined') return;
  const want = [...new Set(list.filter((u) => /^https:\/\//.test(u)))];
  try {
    const have = new Set((await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String));
    for (const k of have) if (!want.includes(k)) await tx('readwrite', (s) => s.delete(k));
    for (const u of want) {
      if (have.has(u)) continue;
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size > 0 && blob.size < 12 * 1024 * 1024) await tx('readwrite', (s) => s.put(blob, u));
      } catch { /* offline — try again next time */ }
    }
  } catch { /* storage unavailable */ }
}

/** The stored copy when there is one, otherwise the online address. */
export function useCachedSrc(src: string): string {
  const [u, setU] = useState(() => urls.get(src) || src);
  useEffect(() => {
    let alive = true;
    setU(urls.get(src) || src);
    if (/^https:\/\//.test(src)) cachedUrl(src).then((c) => { if (alive && c) setU(c); });
    return () => { alive = false; };
  }, [src]);
  return u;
}
