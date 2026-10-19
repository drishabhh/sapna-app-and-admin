import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { activeDays, bestStreak, cycleInfo, last7, logStreak, PHASE_COPY, totalsOn } from './calc';
import { burnedOn, latestWeight, sessionKcal } from './burn';
import { workoutDays, workoutState } from './workoutStreak';
import { pushToken } from './push';
import { today } from './dates';
import { AppData, Content, MEALS } from './types';

const native = () => Capacitor.isNativePlatform();

export const haptic = {
  tap() {
    if (native()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  success() {
    if (native()) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
};

/* ---------- Files: save to Downloads / share as .txt ---------- */
// .txt (text/plain) is accepted by every app — WhatsApp, Telegram, Gmail, Drive, My Files.
// The content is still JSON, and Restore reads it whatever the file is called.

interface FileSaverPlugin { saveToDownloads(o: { fileName: string; text: string; mime: string }): Promise<{ path: string }> }
const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');

function webDownload(fileName: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Writes straight into Downloads/Sapna Health. Returns where it went, or null if it failed. */
export async function saveTextFile(fileName: string, text: string): Promise<string | null> {
  if (!native()) { webDownload(fileName, text); return `Downloads/${fileName}`; }
  try {
    return (await FileSaver.saveToDownloads({ fileName, text, mime: 'text/plain' })).path;
  } catch {
    return null;
  }
}

/** Opens the share sheet with the file attached (no message text, so WhatsApp/Telegram send it as a document). */
export async function shareTextFile(fileName: string, text: string, title: string): Promise<boolean> {
  if (!native()) { webDownload(fileName, text); return true; }
  try {
    const w = await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, encoding: Encoding.UTF8, data: text });
    await Share.share({ title, files: [w.uri], dialogTitle: title });
    return true;
  } catch {
    return false; // closed the share sheet
  }
}

const backupText = (d: AppData) => JSON.stringify({ type: 'sapna-health-backup', exportedAt: new Date().toISOString(), data: d }, null, 1);
const backupName = () => `sapna-health-backup-${today()}.txt`;
export const saveBackup = (d: AppData) => saveTextFile(backupName(), backupText(d));
export const shareBackup = (d: AppData) => shareTextFile(backupName(), backupText(d), 'Save Sapna Health backup');

export function readBackupFile(text: string): AppData | null {
  try {
    // Tolerate files that picked up a BOM or stray text from a messenger.
    const t = text.replace(/^\uFEFF/, '');
    const j = JSON.parse(t.slice(Math.max(0, t.indexOf('{')), t.lastIndexOf('}') + 1));
    if (j && j.type === 'sapna-health-backup' && j.data && typeof j.data === 'object') return j.data as AppData;
    if (j && j.v === 1 && Array.isArray(j.food)) return j as AppData;
    return null;
  } catch {
    return null;
  }
}

/* ---------- Dashboard file for Rishu (only leaves the phone when she shares it) ---------- */

/**
 * v2 = her whole history, so the admin page can show a full dashboard:
 * every food item, water, steps, weigh-ins, workout sessions (moves + sets) and burn.
 * `days` (last 7) is kept so older admin pages still open it.
 */
export function buildReport(d: AppData, c: Content) {
  const exName = (id: string) => c.exercises.find((e) => e.id === id)?.name || id;
  const kg = latestWeight(d);
  const days = last7().map((date) => {
    const t = totalsOn(d, date);
    const meals: Record<string, string[]> = {};
    MEALS.forEach((m) => {
      meals[m.id] = d.food.filter((f) => f.date === date && f.meal === m.id).map((f) => `${f.name}${f.mult !== 1 ? ` ×${f.mult}` : ''}`);
    });
    return { date, kcal: t.kcal, protein: t.protein, water: d.water[date] || 0, steps: d.steps[date] || 0, meals };
  });
  const from = days[0].date;
  const finished = d.sessions.filter((s) => s.sets.length && s.endedAt);
  const workouts = finished
    .filter((s) => s.date >= from)
    .map((s) => ({
      date: s.date,
      title: s.title,
      minutes: s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null,
      sets: s.sets.map((x) => ({ exId: x.exId, name: exName(x.exId), kg: x.kg, reps: x.reps })),
    }));
  const activity = new Set<string>([...Object.keys(d.steps), ...finished.map((s) => s.date)]);
  const burned: Record<string, number> = {};
  activity.forEach((k) => { const b = burnedOn(d, k); if (b > 0) burned[k] = b; });

  let cycle: unknown = undefined;
  if (d.profile.cycleEnabled && d.profile.shareCycle !== 'none') {
    const info = cycleInfo(d);
    if (info) {
      cycle = { phase: PHASE_COPY[info.phase].label, day: info.day, length: info.length, daysToNext: info.daysToNext };
      if (d.profile.shareCycle === 'all') (cycle as Record<string, unknown>).days = d.cycle;
    }
  }
  const wd = workoutDays(d.sessions);
  const ws = workoutState(wd, d.profile.gymDays, today());
  return {
    type: 'sapna-health-report',
    v: 2,
    generatedAt: new Date().toISOString(),
    name: d.profile.name,
    goal: d.profile.goal,
    profile: { heightCm: d.profile.heightCm, startKg: d.profile.weightKg, gymDays: d.profile.gymDays, diet: d.profile.diet, activity: d.profile.activity, since: d.createdAt, favFoods: d.profile.favFoods, avoid: d.profile.avoid, cycleEnabled: d.profile.cycleEnabled, shareCycle: d.profile.shareCycle },
    reminders: d.reminders,
    push: pushToken(),
    customFoods: d.customFoods.map((f) => ({ name: f.name, portion: f.portion, kcal: f.kcal, protein: f.protein })),
    activeSession: (() => { const a = d.sessions.find((s) => !s.endedAt && s.date === today()); return a ? { title: a.title, startedAt: a.startedAt, done: (a.completed || []).map(exName), sets: a.sets.length } : null; })(),
    targets: c.targets,
    weightKg: kg,
    streaks: { logging: logStreak(d), bestLogging: bestStreak(activeDays(d)), workout: ws.streak },
    food: d.food.map((f) => ({ date: f.date, meal: f.meal, name: f.name, portion: f.portion, mult: f.mult, kcal: f.kcal, protein: f.protein, at: f.at })),
    water: d.water,
    steps: d.steps,
    burned,
    weighIns: d.weighIns,
    sessions: finished.map((s) => ({
      date: s.date,
      title: s.title,
      startedAt: s.startedAt,
      minutes: Math.max(1, Math.round(((s.endedAt as number) - s.startedAt) / 60000)),
      kcal: s.kcal ?? sessionKcal(s, kg),
      done: (s.completed || []).map(exName),
      sets: s.sets.map((x) => ({ name: exName(x.exId), kg: x.kg, reps: x.reps })),
    })),
    days,
    workouts,
    cycle,
  };
}

export function shareReport(d: AppData, c: Content): Promise<boolean> {
  const r = buildReport(d, c);
  const logged = r.days.filter((x) => x.kcal > 0);
  const avgK = logged.length ? Math.round(logged.reduce((s, x) => s + x.kcal, 0) / logged.length) : 0;
  const avgP = logged.length ? Math.round(logged.reduce((s, x) => s + x.protein, 0) / logged.length) : 0;
  const text = `My week: ${avgK} kcal and ${avgP} g protein a day on average, ${r.workouts.length} workout${r.workouts.length === 1 ? '' : 's'}. Open the file in Admin for my full dashboard.`;
  void text;
  return shareTextFile(`sapna-dashboard-${today()}.txt`, JSON.stringify(r), 'Send Rishu my dashboard');
}

/* ---------- Reminders: see notify.ts ---------- */
export { notificationsAllowed, syncReminders } from './notify';
