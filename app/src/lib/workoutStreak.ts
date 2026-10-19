/**
 * Workout-only streak for the home-screen widget.
 *  - a day with a finished workout adds 1
 *  - a scheduled gym day without a workout (once it is over) breaks the streak
 *  - rest days neither add nor break; a bonus workout on a rest day still counts
 * KEEP IN SYNC with android/.../WorkoutStreak.java — a parity test compares both.
 */
import { addDays, dow } from './dates';
import type { DoodleName, Mood, Tone } from './mood';

export interface WorkoutState {
  streak: number;
  doneToday: boolean;
  gymToday: boolean;
  /** scheduled gym days missed since the last workout (null = never worked out) */
  missed: number | null;
  comeback: boolean;
}

const isGym = (k: string, gymDays: number[]) => gymDays.length === 0 || gymDays.includes(dow(k));

function missedBetween(from: string, to: string, gymDays: number[]): number {
  // gym days strictly after `from` and strictly before `to`
  let n = 0;
  for (let k = addDays(from, 1), i = 0; k < to && i < 400; k = addDays(k, 1), i++) if (isGym(k, gymDays)) n++;
  return n;
}

export function workoutState(days: Set<string>, gymDays: number[], today: string): WorkoutState {
  let streak = 0;
  for (let k = today, i = 0; i < 400; k = addDays(k, -1), i++) {
    if (days.has(k)) streak++;
    else if (k !== today && isGym(k, gymDays)) break;
  }
  const doneToday = days.has(today);
  const past = [...days].filter((k) => k < today).sort();
  const lastBefore = past.length ? past[past.length - 1] : null;
  const missed = doneToday ? 0 : lastBefore === null ? null : missedBetween(lastBefore, today, gymDays);
  const comeback = doneToday && lastBefore !== null && missedBetween(lastBefore, today, gymDays) >= 1;
  return { streak, doneToday, gymToday: isGym(today, gymDays), missed, comeback };
}

const MILESTONES: Record<number, string> = {
  3: 'a habit forming',
  5: 'five in a row',
  10: 'double digits',
  20: 'twenty strong',
  30: 'thirty strong',
  50: 'unstoppable',
  75: 'unstoppable',
  100: 'a legend',
};
const milestone = (n: number) => MILESTONES[n] || (n > 0 && n % 50 === 0 ? 'a legend' : null);

export function workoutMood(st: WorkoutState, name: string, hour: number, dayIndex: number): Mood {
  const { streak, doneToday, gymToday, missed, comeback } = st;
  const fill = (s: string) => s.split('{name}').join(name).split('{n}').join(String(streak));
  const m = (id: string, doodle: DoodleName, title: string, sub: string, tone: Tone, lit = true): Mood => ({ id, doodle, title: fill(title), sub: fill(sub), tone, lit });

  if (missed === null && !doneToday) return m('w-fresh', 'cap', 'First workout loading', 'Hit the gym once, {name}. That is day one.', 'warm', false);

  if (doneToday) {
    if (comeback) return m('w-comeback', 'love', 'Welcome back!', 'Back in the gym. We go again.', 'warm');
    const ms = milestone(streak);
    if (ms) return m('w-milestone', 'celebrate', '{n} workouts strong!', '{name}, that is ' + ms + '.', 'warm');
    if (hour >= 21) return m('w-night', 'sleep', 'Rest those muscles', 'Workout {n} done. Sleep well.', 'cool');
    if (streak >= 10) return m('w-locked', 'flex', 'Locked in', '{n} workouts in a row.', 'warm');
    if (streak >= 5) return m('w-fire', 'fire', 'On fire', '{n} workouts. Keep stacking.', 'warm');
    return ((dayIndex % 2) + 2) % 2 === 0
      ? m('w-done-a', 'cheer', 'Workout done!', 'That is {n} in a row.', 'warm')
      : m('w-done-b', 'thumbs', 'Nailed it', 'Workout {n} in the bag.', 'warm');
  }

  if (streak > 0) {
    if (!gymToday) return m('w-rest', 'love', 'Rest day', 'Recover well. Your streak is safe.', 'cool');
    if (hour < 11) return m('w-morning', 'cap', 'Gym day!', 'Your {n}-workout streak is waiting.', 'warm');
    if (hour < 16) return m('w-midday', 'plan', 'Plan your gym slot', 'Keep the {n}-workout streak going.', 'warm');
    if (hour < 20) return m('w-evening', 'point', 'Hey {name}...', 'Do not skip the gym today.', 'hot');
    return m('w-late', 'shocked', streak >= 5 ? 'Do not lose {n} workouts!' : 'Still time for the gym!', 'A quick session saves the streak.', 'hot');
  }

  const g = missed ?? 1;
  if (g <= 1) return m('w-missed', 'sad', 'You missed a gym day', 'Streak reset. Next session starts it again.', 'cool', false);
  if (g === 2) return m('w-missed2', 'cry', 'Two gym days missed', 'One workout fixes everything.', 'cool', false);
  if (g <= 5) return m('w-mad', 'angry', 'Okay, I am mad now', g + ' gym days skipped. Go.', 'hot', false);
  return m('w-long', 'sleep', 'Still hibernating?', 'The gym misses you. No judgement.', 'cool', false);
}

/** dates (YYYY-MM-DD) with at least one finished/logged workout */
export function workoutDays(sessions: { date: string; sets: unknown[]; endedAt?: number }[]): Set<string> {
  return new Set(sessions.filter((s) => s.sets.length > 0).map((s) => s.date));
}
