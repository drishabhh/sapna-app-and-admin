import { addDays, keyOf, parseKey } from './dates';
import type { AppData, Content, Drink, Reminders } from './types';

/**
 * Water, the way the best hydration apps do it — but simple:
 * every drink is logged in ml with its time; the day's goal comes from Rishu's target
 * (glasses × 250 ml) plus a little extra on workout days; reminders follow her day.
 * `water[date]` (glasses) is kept in step for the dashboard, widget and older code.
 */
export const GLASS_ML = 250;
export const CUPS = [150, 250, 350, 500, 750];
export const WORKOUT_BONUS_ML = 500;
export const EVERY_CHOICES = [60, 90, 120, 180];

export const waterPrefs = (r: Reminders) => ({
  every: EVERY_CHOICES.includes(r.waterEvery as number) ? (r.waterEvery as number) : 120,
  from: /^\d{2}:\d{2}$/.test(r.waterFrom || '') ? (r.waterFrom as string) : '09:00',
  to: /^\d{2}:\d{2}$/.test(r.waterTo || '') ? (r.waterTo as string) : '21:00',
  cup: Math.max(50, Math.min(1500, Math.round(r.waterCup || GLASS_ML))),
});

/** Drinks of a day; an untimed older glass count shows as one "earlier" entry. */
export function drinksOf(d: AppData, date: string): Drink[] {
  const list = d.drinks?.[date];
  if (list) return list;
  const g = d.water[date] || 0;
  return g > 0 ? [{ at: 0, ml: Math.round(g * GLASS_ML) }] : [];
}
export const mlOn = (d: AppData, date: string) => drinksOf(d, date).reduce((s, x) => s + x.ml, 0);
const glasses = (ml: number) => Math.round((ml / GLASS_ML) * 10) / 10;

function withDrinks(d: AppData, date: string, list: Drink[]): AppData {
  const ml = list.reduce((s, x) => s + x.ml, 0);
  const water = { ...d.water };
  if (ml > 0) water[date] = glasses(ml); else delete water[date];
  return { ...d, water, drinks: { ...(d.drinks || {}), [date]: list } };
}
export function addDrink(d: AppData, date: string, ml: number, at = Date.now()): AppData {
  const amt = Math.max(10, Math.min(3000, Math.round(ml)));
  return withDrinks(d, date, [...drinksOf(d, date), { at, ml: amt }].sort((a, b) => a.at - b.at));
}
export function removeDrink(d: AppData, date: string, index: number): AppData {
  const list = drinksOf(d, date).slice(); list.splice(index, 1);
  return withDrinks(d, date, list);
}
/** Set a day's total in glasses (Rishu's admin edit) — keeps her timed drinks where possible. */
export function setGlassesOn(d: AppData, date: string, g: number, now = Date.now()): AppData {
  const target = Math.round(Math.max(0, g) * GLASS_ML);
  const list = drinksOf(d, date).slice();
  let sum = list.reduce((s, x) => s + x.ml, 0);
  while (list.length && sum > target) sum -= (list.pop() as Drink).ml;
  if (target > sum) list.push({ at: date === keyOf(new Date(now)) ? now : parseKey(date).getTime(), ml: target - sum, by: 'rishu' });
  return withDrinks(d, date, list.sort((a, b) => a.at - b.at));
}

/** Today's goal: Rishu's target, +0.5 L on a day she trained. */
export function goalOn(d: AppData, c: Content, date: string): { ml: number; bonus: number } {
  const base = Math.max(1, c.targets.water || 8) * GLASS_ML;
  const trained = d.sessions.some((s) => s.date === date && s.sets.length > 0);
  const bonus = trained ? WORKOUT_BONUS_ML : 0;
  return { ml: base + bonus, bonus };
}
/** Days in a row she hit the goal (today counts once it's hit; an unfinished today doesn't break it). */
export function waterStreak(d: AppData, c: Content, day: string): number {
  let n = 0;
  let k = mlOn(d, day) >= goalOn(d, c, day).ml ? day : addDays(day, -1);
  while (mlOn(d, k) >= goalOn(d, c, k).ml && n < 3650) { n++; k = addDays(k, -1); }
  return n;
}
export const fmtL = (ml: number) => (ml >= 1000 ? `${Math.round(ml / 10) / 100} L` : `${Math.round(ml)} ml`);

/** Reminder times (ms) for one day: every N minutes inside her hours, counted from her last drink; none once she hits the goal. */
export function waterSlots(d: AppData, c: Content, date: string, now = Date.now()): number[] {
  const p = waterPrefs(d.reminders);
  const t = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); const x = parseKey(date); x.setHours(h, m, 0, 0); return x.getTime(); };
  const from = t(p.from); let to = t(p.to); if (to <= from) to = from + 12 * 3600000;
  const step = p.every * 60000;
  const isToday = date === keyOf(new Date(now));
  if (isToday && mlOn(d, date) >= goalOn(d, c, date).ml) return [];
  let next = from;
  if (isToday) {
    const last = Math.max(0, ...drinksOf(d, date).map((x) => x.at));
    if (last) next = Math.max(next, last + step);
    while (next <= now + 60000) next += step;
  }
  const out: number[] = [];
  for (let x = next; x <= to && out.length < 30; x += step) out.push(x);
  return out;
}
