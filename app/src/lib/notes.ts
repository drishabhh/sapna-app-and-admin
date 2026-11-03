import { Capacitor, registerPlugin } from '@capacitor/core';

/** Notes Rishu scheduled for later. The phone keeps them natively (alarm + notification), keyed by id. */
export interface Note { id: string; at: number; title: string; body: string; fired?: boolean; shownAt?: number }
interface NotesPlugin {
  scheduleNote(o: { id: string; at: number; title: string; body: string }): Promise<void>;
  cancelNote(o: { id: string }): Promise<void>;
  listNotes(): Promise<{ notes: Note[] }>;
}
const P = registerPlugin<NotesPlugin>('StreakWidget');
let cache: Note[] = [];

export async function refreshNotes(): Promise<Note[]> {
  if (!Capacitor.isNativePlatform()) return cache;
  try { cache = (await P.listNotes()).notes || []; } catch { /* older native build */ }
  return cache;
}
/** For the encrypted dashboard: what's lined up on her phone (and what already showed). */
export const notesForReport = () => cache.map((n) => ({ id: n.id, at: n.at, title: n.title, body: n.body, fired: !!n.fired, shownAt: n.shownAt || 0 }));

export async function scheduleNote(n: { id: string; at: number; title: string; body: string }) {
  if (!Capacitor.isNativePlatform()) return;
  try { await P.scheduleNote(n); } catch { /* ignore */ }
  await refreshNotes();
}
export async function cancelNote(id: string) {
  if (!Capacitor.isNativePlatform()) return;
  try { await P.cancelNote({ id }); } catch { /* ignore */ }
  await refreshNotes();
}
