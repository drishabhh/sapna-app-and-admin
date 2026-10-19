/**
 * Streak "personality" — the doodle and the words change with how she is doing, Duolingo-style:
 * proud when she is regular, nudging as the day runs out, sulky then sleepy if she disappears,
 * and delighted when she comes back.
 *
 * KEEP IN SYNC with android/.../MoodEngine.java (the home-screen widget). A parity test compares both.
 */

export type DoodleName =
  | 'thumbs' | 'cheer' | 'love' | 'cheeks' | 'bottle' | 'flex' | 'fire'
  | 'plan' | 'confused' | 'shocked' | 'eating' | 'sleep' | 'sad' | 'angry'
  | 'sick' | 'point' | 'laptop' | 'cap' | 'phone' | 'cry' | 'celebrate';

/** warm = happy amber, hot = urgent/angry, cool = sad/sleepy */
export type Tone = 'warm' | 'hot' | 'cool';

export interface Mood {
  id: string;
  doodle: DoodleName;
  title: string;
  sub: string;
  tone: Tone;
  /** flame lit? false once the streak is gone */
  lit: boolean;
}

export interface MoodInput {
  name: string;
  /** streak that is still alive (0 if broken or never started) */
  streak: number;
  doneToday: boolean;
  workoutToday: boolean;
  /** whole days since she last logged anything; null = never */
  gap: number | null;
  /** logged today after a broken streak (first day back) */
  comeback: boolean;
  hour: number;
  /** days since 1970 — rotates the variants so the card is not the same every day */
  dayIndex: number;
}

const MILESTONES: Record<number, string> = {
  3: 'a habit is starting',
  7: 'one full week',
  14: 'two weeks strong',
  21: 'officially a habit',
  30: 'a whole month',
  50: 'unstoppable',
  75: 'unstoppable',
  100: 'a legend',
  150: 'a legend',
  200: 'a legend',
  365: 'a full year',
};

const fill = (s: string, name: string, n: number) => s.split('{name}').join(name).split('{n}').join(String(n));

export function milestoneLabel(streak: number): string | null {
  if (MILESTONES[streak]) return MILESTONES[streak];
  if (streak > 0 && streak % 100 === 0) return 'a legend';
  return null;
}

export function computeMood(i: MoodInput): Mood {
  const { name, streak, doneToday, workoutToday, gap, comeback, hour, dayIndex } = i;
  const m = (id: string, doodle: DoodleName, title: string, sub: string, tone: Tone, lit = true): Mood => ({
    id,
    doodle,
    title: fill(title, name, streak),
    sub: fill(sub, name, streak),
    tone,
    lit,
  });
  const pick = <T,>(list: T[]) => list[((dayIndex % list.length) + list.length) % list.length];

  // Never logged anything.
  if (gap === null) return m('fresh', 'eating', 'Fuel first', 'Log your first meal, {name}. That is day one.', 'warm', false);

  // ---- She has shown up today ----
  if (doneToday) {
    if (comeback) return m('comeback', 'love', 'Welcome back!', 'Day 1 again, {name}. We go again.', 'warm');
    const ms = milestoneLabel(streak);
    if (ms) return m('milestone', 'celebrate', '{n}-day streak!', '{name}, that is ' + ms + '.', 'warm');
    if (workoutToday) {
      return pick([
        m('workout-a', 'cheer', 'Beast mode, {name}!', 'Workout and a log. Unreal.', 'warm'),
        m('workout-b', 'flex', 'Strong work', 'Streak safe and muscles earned.', 'warm'),
      ]);
    }
    if (hour >= 21) return m('night', 'sleep', 'Sleep well', 'Day {n} done. See you tomorrow, {name}.', 'cool');
    if (streak >= 14) return m('locked', 'flex', 'Locked in', '{n} days and counting.', 'warm');
    if (streak >= 7) return m('fire', 'fire', 'On fire', '{n} days. Do not stop now.', 'warm');
    if (streak >= 3) {
      return pick([
        m('good-a', 'thumbs', 'Nice streak', '{n} days in a row.', 'warm'),
        m('good-b', 'bottle', 'Stay hydrated', 'Day {n} done. Keep sipping.', 'warm'),
      ]);
    }
    return pick([
      m('early-a', 'cheeks', 'Day {n} done', 'Small steps add up.', 'warm'),
      m('early-b', 'phone', 'Rishu will be proud', 'Day {n} is logged.', 'warm'),
    ]);
  }

  // ---- Streak alive, but today is still empty ----
  if (gap === 1 && streak > 0) {
    if (hour < 11) return m('morning', 'cap', 'Good morning!', 'Day {n} starts with one log.', 'warm');
    if (hour < 16) return m('midday', 'plan', 'Time to log a meal', 'Keep your {n}-day streak going.', 'warm');
    if (hour < 20) return m('evening', 'point', 'Hey {name}...', 'Your {n}-day streak needs you.', 'hot');
    return m('late', 'shocked', streak >= 7 ? 'Do not lose {n} days!' : 'Streak ends at midnight!', 'Log anything to save it.', 'hot');
  }

  // ---- Streak is gone: she has been away ----
  const g = gap;
  if (g <= 2) return m('missed', 'sad', 'We missed you', 'Streak reset. Log today for day 1.', 'cool', false);
  if (g === 3) return m('away3', 'cry', 'It has been 3 days', 'One meal log is all it takes.', 'cool', false);
  if (g <= 6) return m('away-mad', 'angry', 'Okay, I am mad now', g + ' days. Log something. Please.', 'hot', false);
  return m('away-long', 'sleep', 'Still hibernating?', 'No judgement. Come back whenever.', 'cool', false);
}
