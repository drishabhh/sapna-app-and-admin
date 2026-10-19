import type { AppData } from './types';

/** Most recent weigh-in, falling back to the profile weight. */
export function latestWeight(d: AppData): number {
  const w = [...d.weighIns].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].kg : d.profile.weightKg || 60;
}

/** kcal for a gym session without a stored estimate: ~5 METs for the time spent (capped at 2.5 h). */
export function sessionKcal(s: { kcal?: number; startedAt: number; endedAt?: number; sets: unknown[] }, kg: number): number {
  if (typeof s.kcal === 'number') return s.kcal;
  if (!s.endedAt || !s.sets.length) return 0;
  const hours = Math.min(2.5, (s.endedAt - s.startedAt) / 3600000);
  return Math.round(5 * kg * hours);
}

/** Walking: about 0.5 kcal per kg of body weight per 1,000 steps (≈30 kcal / 1k steps at 60 kg). */
export function stepsKcal(steps: number, kg: number): number {
  return Math.round(Math.max(0, steps) * kg * 0.0005);
}

export function workoutKcalOn(d: AppData, date: string): number {
  const kg = latestWeight(d);
  return d.sessions.filter((s) => s.date === date && s.endedAt).reduce((a, s) => a + sessionKcal(s, kg), 0);
}

export function burnedOn(d: AppData, date: string): number {
  return workoutKcalOn(d, date) + stepsKcal(d.steps[date] || 0, latestWeight(d));
}
