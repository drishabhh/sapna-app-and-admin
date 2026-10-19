import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { cycleInfo, last7, PHASE_COPY, totalsOn } from './calc';
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

/* ---------- Files: share / save ---------- */

async function shareJsonFile(fileName: string, json: unknown, title: string, text?: string): Promise<boolean> {
  const body = JSON.stringify(json, null, 1);
  if (native()) {
    const w = await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, encoding: Encoding.UTF8, data: body });
    try {
      await Share.share({ title, text, files: [w.uri], dialogTitle: title });
      return true;
    } catch {
      return false; // user closed the share sheet
    }
  }
  const blob = new Blob([body], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
  return true;
}

export function exportBackup(d: AppData): Promise<boolean> {
  return shareJsonFile(
    `sapna-health-backup-${today()}.json`,
    { type: 'sapna-health-backup', exportedAt: new Date().toISOString(), data: d },
    'Save Sapna Health backup',
    'Keep this file safe — it restores all your logs.',
  );
}

export function readBackupFile(text: string): AppData | null {
  try {
    const j = JSON.parse(text);
    if (j && j.type === 'sapna-health-backup' && j.data && typeof j.data === 'object') return j.data as AppData;
    if (j && j.v === 1 && Array.isArray(j.food)) return j as AppData;
    return null;
  } catch {
    return null;
  }
}

/* ---------- Weekly report for Rishu (only leaves the phone when she shares it) ---------- */

export function buildReport(d: AppData, c: Content) {
  const days = last7().map((date) => {
    const t = totalsOn(d, date);
    const meals: Record<string, string[]> = {};
    MEALS.forEach((m) => {
      meals[m.id] = d.food.filter((f) => f.date === date && f.meal === m.id).map((f) => `${f.name}${f.mult !== 1 ? ` ×${f.mult}` : ''}`);
    });
    return { date, kcal: t.kcal, protein: t.protein, water: d.water[date] || 0, steps: d.steps[date] || 0, meals };
  });
  const from = days[0].date;
  const workouts = d.sessions
    .filter((s) => s.date >= from && s.sets.length)
    .map((s) => ({
      date: s.date,
      title: s.title,
      minutes: s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null,
      sets: s.sets.map((x) => ({ exId: x.exId, name: c.exercises.find((e) => e.id === x.exId)?.name || x.exId, kg: x.kg, reps: x.reps })),
    }));
  let cycle: unknown = undefined;
  if (d.profile.cycleEnabled && d.profile.shareCycle !== 'none') {
    const info = cycleInfo(d);
    if (info) {
      cycle = { phase: PHASE_COPY[info.phase].label, day: info.day, daysToNext: info.daysToNext };
      if (d.profile.shareCycle === 'all') {
        const recent: Record<string, unknown> = {};
        Object.keys(d.cycle)
          .filter((k) => k >= from)
          .forEach((k) => (recent[k] = d.cycle[k]));
        (cycle as Record<string, unknown>).days = recent;
      }
    }
  }
  return {
    type: 'sapna-health-report',
    v: 1,
    generatedAt: new Date().toISOString(),
    name: d.profile.name,
    goal: d.profile.goal,
    targets: c.targets,
    days,
    workouts,
    weighIns: d.weighIns.slice(-8),
    cycle,
  };
}

export function shareReport(d: AppData, c: Content): Promise<boolean> {
  const r = buildReport(d, c);
  const logged = r.days.filter((x) => x.kcal > 0);
  const avgK = logged.length ? Math.round(logged.reduce((s, x) => s + x.kcal, 0) / logged.length) : 0;
  const avgP = logged.length ? Math.round(logged.reduce((s, x) => s + x.protein, 0) / logged.length) : 0;
  const text = `My week: ${avgK} kcal and ${avgP} g protein a day on average, ${r.workouts.length} workout${r.workouts.length === 1 ? '' : 's'}. Open the file in Admin for the full picture.`;
  return shareJsonFile(`sapna-week-${today()}.json`, r, 'Send Rishu my week', text);
}

/* ---------- Reminders: see notify.ts ---------- */
export { notificationsAllowed, syncReminders } from './notify';
