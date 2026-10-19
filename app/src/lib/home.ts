import MOVES from '../content/home-moves.json';
import type { DoodleName } from './mood';
import type { AppData, ProgramProgress } from './types';

export interface HomeMove {
  id: string;
  name: string;
  kind: 'time' | 'reps';
  amount: number;
  met: number;
  part: string;
  cue: string;
  gif: string;
}

export const HOME_MOVES = MOVES as HomeMove[];
export const MOVE_BY_ID: Record<string, HomeMove> = Object.fromEntries(HOME_MOVES.map((m) => [m.id, m]));

export interface Program {
  id: string;
  title: string;
  blurb: string;
  doodle: DoodleName;
  days: number;
  /** main-circuit pool */
  pool: string[];
  warmup: string[];
  cooldown: string[];
  color: string;
}

const W = (ids: string[]) => ids.map((i) => 'h-' + i);

export const PROGRAMS: Program[] = [
  {
    id: 'full-body',
    title: 'Full body burn',
    blurb: '30 days · no equipment · sweat a little every day',
    doodle: 'fire',
    days: 30,
    color: 'var(--coral)',
    warmup: W(['cardio-jack-jump-male', 'arm-circles', 'torso-rotations']),
    pool: W(['bodyweight-squats', 'pectorals-kneeling-push-up-male', 'cardio-mountain-climber', 'glutes-low-glute-bridge-on-floor', 'abs-crunch-floor', 'glutes-curtsey-squat', 'cardio-high-knee-against-wall', 'abs-kneeling-plank-tap-shoulder-male', 'triceps-bench-dip-knees-bent', 'cardio-skater-hops', 'glutes-forward-lunge-male', 'abs-russian-twist', 'cardio-burpee', 'abs-inchworm']),
    cooldown: W(['hamstrings-world-greatest-stretch', 'glutes-hug-keens-to-chest', 'lats-standing-lateral-stretch']),
  },
  {
    id: 'belly',
    title: 'Belly fat blast',
    blurb: '30 days · core + cardio · flatter, stronger middle',
    doodle: 'flex',
    days: 30,
    color: 'var(--amber)',
    warmup: W(['cardio-jack-jump-male', 'torso-rotations']),
    pool: W(['abs-crunch-floor', 'cardio-mountain-climber', 'abs-reverse-crunch', 'abs-russian-twist', 'glutes-flutter-kicks', 'abs-dead-bug', 'abs-cross-body-crunch', 'cardio-high-knee-against-wall', 'abs-front-plank-with-twist', 'abs-side-to-side-toe-touch-male', 'abs-twisted-leg-raise-female', 'abs-side-bridge-v-2', 'cardio-scissor-jumps-male']),
    cooldown: W(['glutes-bent-knee-lying-twist-male', 'glutes-hug-keens-to-chest', 'lats-standing-lateral-stretch']),
  },
  {
    id: 'butt-legs',
    title: 'Butt & legs lift',
    blurb: '30 days · glutes, thighs, calves · shape and strength',
    doodle: 'cheer',
    days: 30,
    color: 'var(--pink)',
    warmup: W(['leg-swings', 'cardio-jack-jump-male']),
    pool: W(['bodyweight-squats', 'glutes-low-glute-bridge-on-floor', 'glutes-curtsey-squat', 'glutes-glute-bridge-march', 'abductors-side-bridge-hip-abduction', 'glutes-forward-lunge-male', 'glutes-swimmer-kicks-v-2-male', 'glutes-march-sit-wall', 'glutes-single-leg-bridge-with-outstretched-leg', 'quads-split-squats', 'calves-bodyweight-standing-calf-raise', 'cardio-semi-squat-jump-male', 'glutes-pelvic-tilt-into-bridge']),
    cooldown: W(['glutes-seated-glute-stretch', 'quads-lying-side-quads-stretch', 'adductors-butterfly-yoga-pose', 'glutes-rocking-frog-stretch']),
  },
  {
    id: 'arms',
    title: 'Toned arms',
    blurb: '30 days · arms, back and shoulders · no weights needed',
    doodle: 'flex',
    days: 30,
    color: 'var(--violet)',
    warmup: W(['arm-circles', 'cardio-jack-jump-male']),
    pool: W(['pectorals-push-up-wall', 'triceps-bench-dip-knees-bent', 'delts-left-hook-boxing', 'pectorals-kneeling-push-up-male', 'abs-kneeling-plank-tap-shoulder-male', 'triceps-close-grip-push-up-on-knees', 'abs-inchworm', 'arm-circles']),
    cooldown: W(['triceps-overhead-triceps-stretch', 'lats-standing-lateral-stretch', 'glutes-hug-keens-to-chest']),
  },
  {
    id: 'stretch',
    title: 'Daily stretch',
    blurb: '8 minutes · loosen up, breathe, recover',
    doodle: 'love',
    days: 0,
    color: 'var(--cyan)',
    warmup: [],
    pool: W(['hamstrings-world-greatest-stretch', 'glutes-hug-keens-to-chest', 'glutes-bent-knee-lying-twist-male', 'adductors-butterfly-yoga-pose', 'glutes-seated-glute-stretch', 'hamstrings-hamstring-stretch', 'triceps-overhead-triceps-stretch', 'lats-standing-lateral-stretch', 'quads-lying-side-quads-stretch', 'glutes-rocking-frog-stretch']),
    cooldown: [],
  },
];
export const PROGRAM_BY_ID: Record<string, Program> = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));

export interface DayStep {
  move: HomeMove;
  /** seconds for timed moves, reps otherwise */
  amount: number;
  phase: 'warmup' | 'main' | 'cooldown';
}
export interface DayPlan {
  day: number;
  rest: boolean;
  steps: DayStep[];
  restSecs: number;
  minutes: number;
  kcal: number;
}

/** small deterministic PRNG so a given day is always the same workout */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export const isRestDay = (p: Program, day: number) => p.days > 0 && day % 4 === 0;

const SECS_PER_REP = 3;

export function stepSeconds(s: DayStep) {
  return s.move.kind === 'time' ? s.amount : s.amount * SECS_PER_REP;
}

export function kcalFor(steps: DayStep[], kg: number) {
  return Math.round(steps.reduce((a, s) => a + (s.move.met * kg * stepSeconds(s)) / 3600, 0));
}

export function buildDay(p: Program, day: number, adjust = 1, kg = 60): DayPlan {
  if (isRestDay(p, day)) return { day, rest: true, steps: [], restSecs: 0, minutes: 0, kcal: 0 };
  const week = p.days > 0 ? Math.min(3, Math.floor((day - 1) / 7)) : 0;
  const r = rng(hash(p.id) + day * 101);
  const pool = [...p.pool].sort(() => r() - 0.5);
  const count = p.id === 'stretch' ? 8 : Math.min(pool.length, 6 + week);
  const scale = (m: HomeMove, phase: DayStep['phase']) => {
    const grow = phase === 'main' ? 1 + week * 0.2 : 1;
    const raw = m.amount * grow * (phase === 'main' ? adjust : 1);
    return m.kind === 'time' ? Math.max(15, Math.round(raw / 5) * 5) : Math.max(5, Math.round(raw));
  };
  const steps: DayStep[] = [
    ...p.warmup.map((id) => MOVE_BY_ID[id]).filter(Boolean).map((m) => ({ move: m, amount: scale(m, 'warmup'), phase: 'warmup' as const })),
    ...pool.slice(0, count).map((id) => MOVE_BY_ID[id]).filter(Boolean).map((m) => ({ move: m, amount: scale(m, 'main'), phase: 'main' as const })),
    ...p.cooldown.map((id) => MOVE_BY_ID[id]).filter(Boolean).map((m) => ({ move: m, amount: scale(m, 'cooldown'), phase: 'cooldown' as const })),
  ];
  const restSecs = p.id === 'stretch' ? 8 : [25, 20, 20, 15][week];
  const total = steps.reduce((a, s) => a + stepSeconds(s), 0) + restSecs * Math.max(0, steps.length - 1) + 10;
  return { day, rest: false, steps, restSecs, minutes: Math.max(1, Math.round(total / 60)), kcal: kcalFor(steps, kg) };
}

export function progressOf(d: AppData, id: string): ProgramProgress {
  return d.programs[id] || { done: [], adjust: 1, startedOn: '' };
}

/** next day to do (1-based); 0-day programs (daily stretch) are always "day 1" */
export function nextDay(p: Program, pr: ProgramProgress): number {
  if (p.days === 0) return 1;
  for (let i = 1; i <= p.days; i++) if (!pr.done.includes(i)) return i;
  return p.days;
}

export function latestWeight(d: AppData): number {
  const w = [...d.weighIns].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].kg : d.profile.weightKg || 60;
}

/** kcal for a gym session without a stored estimate: ~5 METs for the time spent */
export function sessionKcal(s: { kcal?: number; startedAt: number; endedAt?: number; sets: unknown[] }, kg: number): number {
  if (typeof s.kcal === 'number') return s.kcal;
  if (!s.endedAt || !s.sets.length) return 0;
  const hours = Math.min(2.5, (s.endedAt - s.startedAt) / 3600000);
  return Math.round(5 * kg * hours);
}

export function burnedOn(d: AppData, date: string): number {
  const kg = latestWeight(d);
  return d.sessions.filter((s) => s.date === date && s.endedAt).reduce((a, s) => a + sessionKcal(s, kg), 0);
}
