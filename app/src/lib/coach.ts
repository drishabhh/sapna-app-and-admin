import { cycleInfo } from './calc';
import { diffDays, today } from './dates';
import type { AppData, Exercise, Plan, PlanMove, SetEntry } from './types';

/**
 * Her gym coach. Classic double progression, the way good trainers run it:
 * get every planned rep at a weight → go up one small step; fall short → stay until it's solid;
 * fall well short → step back. Rishu's weekly program (if he set one) sets the pace and the easy weeks,
 * but the coach never jumps more than one step at a time and never pushes on heavy period days.
 */
export type TipKind = 'first' | 'up' | 'same' | 'down' | 'easy' | 'deload';
export interface Tip {
  kg: number;
  reps: number;
  sets: number;
  kind: TipKind;
  why: string;
  last?: { kg: number; reps: number[]; date: string };
  /** this week of Rishu's program */
  week?: number;
}

const r = (x: number, step: number) => Math.round(x / step) * step;
const fmt = (kg: number) => `${Number(kg.toFixed(2))} kg`;

/** Weight steps people can actually load: light dumbbells go up by 1 kg, everything else 2.5 kg. */
export function stepFor(ex: Exercise | undefined, kg: number): number {
  return ex?.equipment === 'dumbbell' && kg < 10 ? 1 : 2.5;
}

export function programWeek(plan: Plan | undefined, on = today()): { week: number; deload: boolean } | null {
  const p = plan?.program;
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.start)) return null;
  const week = Math.max(1, Math.floor(diffDays(on, p.start) / 7) + 1);
  return { week, deload: p.deloadEvery > 1 && week % p.deloadEvery === 0 };
}

/** Rishu's scheduled weight for this move this week (easy weeks at 80%), or null. */
export function programKg(plan: Plan | undefined, move: PlanMove, ex?: Exercise, on = today()): number | null {
  const w = programWeek(plan, on);
  if (!w || !plan?.program || !move.kg) return null;
  const D = plan.program.deloadEvery > 1 ? plan.program.deloadEvery : 0;
  const before = w.week - 1;
  const steps = D ? before - Math.floor(before / D) : before; // easy weeks don't add weight
  const kg = move.kg + steps * Math.max(0, plan.program.stepKg || 0);
  return w.deload ? r(kg * 0.8, stepFor(ex, kg)) : kg;
}

/** The sessions (newest first) that have sets of this move, excluding the one in progress. */
function history(d: AppData, exId: string, excludeSessionId?: string) {
  return d.sessions
    .filter((s) => s.id !== excludeSessionId && s.sets.some((x) => x.exId === exId))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((s) => {
      const sets = s.sets.filter((x) => x.exId === exId);
      const top = Math.max(...sets.map((x) => x.kg));
      const atTop = sets.filter((x) => x.kg === top);
      return { date: s.date, top, reps: atTop.map((x) => x.reps), auto: sets.every((x) => x.auto) };
    });
}

export function coach(d: AppData, ex: Exercise | undefined, move: PlanMove, plan?: Plan, opts: { excludeSessionId?: string; on?: string } = {}): Tip | null {
  if (!ex || ex.group === 'stretching' || move.unit === 'min' || move.unit === 'sec') return null;
  const on = opts.on || today();
  const target = move.reps;
  const pw = programWeek(plan, on);
  const pk = programKg(plan, move, ex, on);
  const sets = pw?.deload ? Math.max(1, move.sets - 1) : move.sets;
  const week = pw?.week;
  const h = history(d, ex.id, opts.excludeSessionId);
  const last = h[0] ? { kg: h[0].top, reps: h[0].reps, date: h[0].date } : undefined;

  if (!last || last.kg <= 0) {
    const kg = pk ?? move.kg ?? last?.kg ?? 0;
    return { kg, reps: target, sets, kind: 'first', week, last,
      why: kg ? `Rishu’s starting weight. If ${target} reps feel easy, go up a little.` : `First time — pick a weight you can lift ${target} times with good form.` };
  }

  const step = stepFor(ex, last.kg);
  const lo = Math.min(...last.reps), hi = Math.max(...last.reps);
  const tip = (kind: TipKind, kg: number, why: string): Tip => ({ kg: Math.max(0, kg), reps: target, sets, kind, why, last, week });

  // Period days: holding steady is the win.
  const c = d.profile.cycleEnabled ? cycleInfo(d, on) : null;
  const flow = d.cycle[on]?.flow;
  if (c && c.phase === 'period' && (c.day <= 2 || flow === 'heavy')) {
    return tip('easy', last.kg, `Period days — same as last time is a win. Go lighter if your body says so.`);
  }
  const sym = d.profile.cycleEnabled ? d.cycle[on]?.symptoms || [] : [];
  if (sym.includes('Low energy') || sym.includes('Cramps')) {
    return tip('easy', last.kg, `You logged ${sym.includes('Cramps') ? 'cramps' : 'low energy'} today — same weight as last time, and stop early if you need to.`);
  }
  if (pw?.deload) {
    return tip('deload', Math.min(pk ?? last.kg, r(last.kg * 0.85, step)), `Easy week ${pw.week} in Rishu’s plan — lighter on purpose, so you come back stronger.`);
  }
  if (lo < target - 4 || lo < target * 0.6) {
    return tip('down', last.kg - step, `Last time ${fmt(last.kg)} got ${last.reps.join(', ')} reps — one step lighter, and own all ${target}.`);
  }
  if (lo < target) {
    const plan = pk && pk > last.kg ? ` (Rishu’s plan says ${fmt(pk)} — get all reps first)` : '';
    return tip('same', last.kg, `Stay at ${fmt(last.kg)} until every set hits ${target}${plan}.`);
  }
  // Every rep done. Up if it was clearly easy, she counted them herself, or it's the second time in a row.
  const prev = h[1];
  const twice = prev && prev.top === last.kg && Math.min(...prev.reps) >= target;
  if (hi >= target + 2 || !h[0].auto || twice) {
    const next = pk != null ? Math.min(Math.max(pk, last.kg), last.kg + step) : last.kg + step;
    if (next > last.kg) return tip('up', next, `You got all ${target}s at ${fmt(last.kg)} — time to go up.`);
    return tip('same', last.kg, `Right on Rishu’s plan for week ${pw?.week}. Make every rep clean.`);
  }
  return tip('same', last.kg, `Done at ${fmt(last.kg)} — one more session here, then up.`);
}

/** All-time best weight and best reps at that weight, excluding the session in progress. */
export function bestOf(d: AppData, exId: string, excludeSessionId?: string): { kg: number; reps: number } {
  let kg = 0, reps = 0;
  for (const s of d.sessions) {
    if (s.id === excludeSessionId) continue;
    for (const x of s.sets) {
      if (x.exId !== exId) continue;
      if (x.kg > kg) { kg = x.kg; reps = x.reps; } else if (x.kg === kg && x.reps > reps) reps = x.reps;
    }
  }
  return { kg, reps };
}

/** Is this set a new best? 'kg' = heaviest ever, 'reps' = most reps ever at her top weight. */
export function isBest(set: SetEntry, best: { kg: number; reps: number }): 'kg' | 'reps' | null {
  if (best.kg <= 0 || set.kg <= 0) return null; // first time isn't a record yet
  if (set.kg > best.kg) return 'kg';
  if (set.kg === best.kg && set.reps > best.reps) return 'reps';
  return null;
}

export const restFor = (move: PlanMove) => Math.min(600, Math.max(15, move.rest || 75));
