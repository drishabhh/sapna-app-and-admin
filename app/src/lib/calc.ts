import { addDays, diffDays, dow, keyOf, parseKey, today } from './dates';
import { computeMood, Mood } from './mood';
import { AppData, Content, FoodEntry, Meal, Plan, Session } from './types';

export const r1 = (n: number) => Math.round(n * 10) / 10;

export function entriesOn(d: AppData, date: string): FoodEntry[] {
  return d.food.filter((f) => f.date === date);
}

export function totalsOn(d: AppData, date: string) {
  const es = entriesOn(d, date);
  return {
    kcal: Math.round(es.reduce((s, e) => s + e.kcal, 0)),
    protein: r1(es.reduce((s, e) => s + e.protein, 0)),
    count: es.length,
  };
}

export function mealTotals(d: AppData, date: string, meal: Meal) {
  const es = d.food.filter((f) => f.date === date && f.meal === meal);
  return { kcal: Math.round(es.reduce((s, e) => s + e.kcal, 0)), protein: r1(es.reduce((s, e) => s + e.protein, 0)), entries: es };
}

/** Days she showed up: logged any food or finished a workout. */
export function activeDays(d: AppData): Set<string> {
  const s = new Set(d.food.map((f) => f.date));
  for (const x of d.sessions) if (x.sets.length) s.add(x.date);
  return s;
}

/** Consecutive active days ending today (or yesterday, if today has nothing yet — the streak is still alive). */
export function logStreak(d: AppData, days = activeDays(d)): number {
  let k = today();
  if (!days.has(k)) k = addDays(k, -1);
  let n = 0;
  while (days.has(k)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export function bestStreak(days: Set<string>): number {
  let best = 0;
  for (const k of days) {
    if (days.has(addDays(k, -1))) continue; // only start counting at the first day of a run
    let n = 0;
    let c = k;
    while (days.has(c)) { n++; c = addDays(c, 1); }
    best = Math.max(best, n);
  }
  return best;
}

export interface StreakInfo {
  streak: number;
  best: number;
  doneToday: boolean;
  workoutToday: boolean;
  lastActive: string | null;
  /** the active day before today (null if none) — lets the widget tell a comeback from a normal day */
  prevActive: string | null;
  /** whole days since she last logged anything; null = never */
  gap: number | null;
  comeback: boolean;
  week: { key: string; done: boolean; isToday: boolean; future: boolean }[];
  mood: Mood;
}

export function streakInfo(d: AppData, now = new Date()): StreakInfo {
  const days = activeDays(d);
  const t = keyOf(now);
  const streak = logStreak(d, days);
  const doneToday = days.has(t);
  const workoutToday = d.sessions.some((x) => x.date === t && x.sets.length > 0);
  const sorted = [...days].filter((k) => k <= t).sort();
  const lastActive = sorted.length ? sorted[sorted.length - 1] : null;
  const before = sorted.filter((k) => k < t);
  const prevActive = before.length ? before[before.length - 1] : null;
  const gap = lastActive === null ? null : diffDays(t, lastActive);
  const comeback = doneToday && streak === 1 && prevActive !== null && diffDays(t, prevActive) >= 2;
  const dayIndex = Math.floor(parseKey(t).getTime() / 86400000);
  const mood = computeMood({ name: d.profile.name || 'Sapna', streak, doneToday, workoutToday, gap, comeback, hour: now.getHours(), dayIndex });
  return {
    streak,
    best: Math.max(bestStreak(days), streak),
    doneToday,
    workoutToday,
    lastActive,
    prevActive,
    gap,
    comeback,
    week: weekKeys(t).map((key) => ({ key, done: days.has(key), isToday: key === t, future: key > t })),
    mood,
  };
}

function weekKeys(k: string): string[] {
  const dw = dow(k);
  const mon = addDays(k, dw === 0 ? -6 : 1 - dw);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

export function mealFor(hour = new Date().getHours()): Meal {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snacks';
  return 'dinner';
}

/* ---------- Workouts ---------- */

export function sessionsOn(d: AppData, date: string): Session[] {
  return d.sessions.filter((s) => s.date === date);
}

/** Next plan in rotation after her most recent finished session. */
export function nextPlan(d: AppData, c: Content): Plan | null {
  if (!c.plans.length) return null;
  const last = [...d.sessions].filter((s) => s.sets.length > 0).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!last) return c.plans[0];
  const i = c.plans.findIndex((p) => p.id === last.planId);
  if (last.date === today()) return c.plans[Math.max(0, i)] || c.plans[0];
  return c.plans[(i + 1) % c.plans.length] || c.plans[0];
}

/** Today's plan: one Rishu pinned to this weekday, else the next undated plan in rotation, else none. */
export function todayPlan(d: AppData, c: Content, date = today()): Plan | null {
  const active = d.sessions.find((s) => !s.endedAt && s.date === date);
  const act = active && c.plans.find((p) => p.id === active.planId);
  if (act) return act;
  // A plan Rishu pinned to this weekday wins — even if she already did something else today.
  const pinned = c.plans.filter((p) => p.days?.includes(dow(date)));
  if (pinned.length) return pinned.find((p) => !d.sessions.some((s) => s.date === date && s.endedAt && s.sets.length && s.planId === p.id)) || pinned[0];
  const doneToday = [...d.sessions].filter((s) => s.date === date && s.sets.length).sort((a, b) => b.startedAt - a.startedAt)[0];
  const did = doneToday && c.plans.find((p) => p.id === doneToday.planId);
  if (did) return did;
  const floating = c.plans.filter((p) => !p.days || !p.days.length);
  return floating.length ? nextPlan(d, { ...c, plans: floating }) : null;
}

/** "Warm-up stretches, then chest · back · shoulders" — used when Rishu didn't write a brief. */
export function planBrief(p: Plan, exById: Record<string, { group: string; part: string } | undefined>): string {
  if (p.focus?.trim()) return p.focus.trim();
  const ex = p.moves.map((m) => exById[m.exId]).filter(Boolean) as { group: string; part: string }[];
  const parts = [...new Set(ex.filter((e) => e.group !== 'stretching').map((e) => e.part).filter(Boolean))];
  const warm = ex.some((e) => e.group === 'stretching');
  const hit = parts.length ? parts.slice(0, 4).join(' · ') : 'a full session';
  return warm ? `Warm-up stretches, then ${hit}` : hit[0].toUpperCase() + hit.slice(1);
}

export function isGymDay(d: AppData, date = today()): boolean {
  return d.profile.gymDays.includes(dow(date));
}

/** Most recent weight she lifted for an exercise (before the given session). */
export function lastWeight(d: AppData, exId: string, excludeSessionId?: string): { kg: number; reps: number; date: string } | null {
  const ss = [...d.sessions].filter((s) => s.id !== excludeSessionId).sort((a, b) => b.startedAt - a.startedAt);
  for (const s of ss) {
    const sets = s.sets.filter((x) => x.exId === exId);
    if (sets.length) {
      const best = sets.reduce((a, b) => (b.kg > a.kg ? b : a));
      return { kg: best.kg, reps: best.reps, date: s.date };
    }
  }
  return null;
}

export function exerciseHistory(d: AppData, exId: string) {
  return [...d.sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const sets = s.sets.filter((x) => x.exId === exId);
      if (!sets.length) return null;
      return { date: s.date, best: Math.max(...sets.map((x) => x.kg)), sets: sets.length };
    })
    .filter((x): x is { date: string; best: number; sets: number } => !!x);
}

export function sessionsPerWeek(d: AppData, weeks = 4): number[] {
  const t = today();
  const out: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(t, -7 * w);
    const start = addDays(end, -6);
    out.push(new Set(d.sessions.filter((s) => s.sets.length && s.date >= start && s.date <= end).map((s) => s.date)).size);
  }
  return out;
}

/* ---------- Cycle ---------- */

export type Phase = 'period' | 'follicular' | 'ovulation' | 'luteal';

export function periodStarts(d: AppData): string[] {
  const days = Object.keys(d.cycle)
    .filter((k) => d.cycle[k]?.flow && d.cycle[k].flow !== 'none')
    .sort();
  const set = new Set(days);
  return days.filter((k) => !set.has(addDays(k, -1)));
}

export function avgCycleLen(d: AppData): number {
  const s = periodStarts(d);
  const gaps: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const g = diffDays(s[i], s[i - 1]);
    if (g >= 18 && g <= 45) gaps.push(g);
  }
  if (!gaps.length) return d.profile.cycleLen;
  const recent = gaps.slice(-4);
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

export interface CycleInfo {
  hasData: boolean;
  day: number;
  length: number;
  phase: Phase;
  nextStart: string;
  daysToNext: number;
  fertile: [string, string];
  lastStart: string;
}

export function cycleInfo(d: AppData, on = today()): CycleInfo | null {
  const starts = periodStarts(d).filter((s) => s <= on);
  if (!starts.length) return null;
  const lastStart = starts[starts.length - 1];
  const length = avgCycleLen(d);
  let day = diffDays(on, lastStart) + 1;
  const nextStart = addDays(lastStart, length); // may be in the past when late
  if (day < 1) day = 1;
  const ovu = addDays(nextStart, -14);
  const fertile: [string, string] = [addDays(ovu, -4), addDays(ovu, 1)];
  const inPeriod = !!d.cycle[on]?.flow && d.cycle[on].flow !== 'none';
  let phase: Phase;
  if (inPeriod || day <= d.profile.periodLen) phase = 'period';
  else if (on >= addDays(ovu, -2) && on <= addDays(ovu, 1)) phase = 'ovulation';
  else if (on < ovu) phase = 'follicular';
  else phase = 'luteal';
  return { hasData: true, day, length, phase, nextStart, daysToNext: diffDays(nextStart, on), fertile, lastStart };
}

export function isPredictedPeriod(d: AppData, k: string, info: CycleInfo | null): boolean {
  if (!info) return false;
  if (k < today()) return false;
  const off = diffDays(k, info.nextStart);
  return off >= 0 && off < d.profile.periodLen;
}

export const PHASE_COPY: Record<Phase, { label: string; tip: string; gym: string }> = {
  period: {
    label: 'Period',
    tip: 'Go gentle. Warm water, iron-rich food like dal, spinach and chana help.',
    gym: 'Lighter weights or just stretching and a walk are perfectly fine today.',
  },
  follicular: {
    label: 'Follicular',
    tip: 'Energy usually climbs this week — a good time to push a little.',
    gym: 'Try adding 2.5 kg on a move that felt easy last time.',
  },
  ovulation: {
    label: 'Ovulation',
    tip: 'Often your strongest days. Stay hydrated.',
    gym: 'Great days for your best sets — keep form tight.',
  },
  luteal: {
    label: 'Luteal',
    tip: 'Energy and mood can dip before your period. Cravings are normal.',
    gym: "Keep weights where they are and add an extra stretch.",
  },
};

/* ---------- Misc ---------- */

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function last7(): string[] {
  const t = today();
  return Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
}

export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1, 12);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let i = 1; i <= days; i++) cells.push(keyOf(new Date(year, month, i, 12)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function weekdayOf(k: string) {
  return parseKey(k).getDay();
}

/* ---------- Weekly weigh-in: Friday, with a Monday catch-up ---------- */

/** most recent Friday on/before `t` */
export function lastFriday(t: string): string {
  const dw = dow(t);
  return addDays(t, -((dw - 5 + 7) % 7));
}

/**
 * 'friday'  — it is Friday and she has not weighed in yet today/this week
 * 'missed'  — Monday–Thursday and nothing since last Friday
 * null      — nothing to ask
 */
export function weighStatus(d: AppData, t = today()): 'friday' | 'missed' | null {
  const fri = lastFriday(t);
  if (d.weighIns.some((w) => w.date >= fri)) return null;
  const dw = dow(t);
  if (dw === 5) return 'friday';
  if (dw >= 1 && dw <= 4) return 'missed';
  return null;
}
