import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { addDays, dow, keyOf, parseKey } from './dates';
import { lastFriday } from './calc';
import type { DoodleName } from './mood';
import type { AppData, Content } from './types';
import { fmtL, goalOn, mlOn, waterPrefs, waterSlots } from './water';

/** Rishu's targets, for water goals in notifications (kept current by the app shell). */
let targets: Pick<Content, 'targets'> = { targets: { kcal: 1300, protein: 100, water: 8 } };
export function setReminderContent(c: Pick<Content, 'targets'>) { if (c && c.targets) targets = c; }
export const WATER_ACTIONS = 'WATER';

/**
 * All reminders are scheduled as dated one-offs over a rolling window (re-planned every time the app opens),
 * so each day can carry a different line and the weigh-in nudge can disappear once she has weighed in.
 */

const CH = 'reminders';
const CH_PUNCH = 'gym-punch';
const WINDOW_DAYS = 14;

/** Two-liners for the daily gym nudge. {name} is filled in. Never about body shape — about showing up. */
export const PUNCH_LINES: { t: string; b: string; d: DoodleName }[] = [
  { t: "Don't you dare skip the gym.", b: 'You have a goal, {name}. Shoes on.', d: 'point' },
  { t: 'Excuses don’t burn calories.', b: 'Squats do. See you there.', d: 'fire' },
  { t: 'Future you is watching.', b: 'Make her proud today.', d: 'cheeks' },
  { t: 'Rain? Mood? Monday?', b: 'None of those are reasons. Go.', d: 'angry' },
  { t: 'One hour of effort.', b: 'Twenty-three hours of feeling amazing.', d: 'flex' },
  { t: 'You didn’t come this far', b: 'to only come this far.', d: 'fire' },
  { t: 'The couch will still be there.', b: 'Your streak might not.', d: 'shocked' },
  { t: 'Sweat now, glow later.', b: 'Gym first, everything else after.', d: 'bottle' },
  { t: 'Tired? Good.', b: 'Show up tired. Leave proud.', d: 'sick' },
  { t: 'Nobody is coming to do your reps.', b: 'Just you. Let’s go, {name}.', d: 'point' },
  { t: 'Discipline beats motivation.', b: 'Motivation is late today. You aren’t.', d: 'cap' },
  { t: 'Today’s plan:', b: 'Gym. Glow. Repeat.', d: 'plan' },
  { t: 'Strong is the new pretty.', b: 'Go collect some strong.', d: 'flex' },
  { t: 'Skip the gym?', b: 'In this economy? Absolutely not.', d: 'confused' },
  { t: 'Your goal called.', b: 'It said "don’t ghost me today".', d: 'phone' },
  { t: 'Small steps still move you.', b: 'Go take a few hundred.', d: 'thumbs' },
  { t: 'You’re one workout away', b: 'from a better mood. Guaranteed.', d: 'cheer' },
  { t: 'Be stubborn about your goals,', b: 'flexible about your methods. But go.', d: 'angry' },
  { t: 'No one regrets a workout.', b: 'Literally no one. Ever.', d: 'love' },
  { t: 'The weights miss you.', b: 'Don’t leave them on read.', d: 'phone' },
  { t: 'Make today count.', b: 'Every rep is a vote for the new you.', d: 'fire' },
  { t: 'Snooze button lost.', b: 'Gym bag won. Let’s move.', d: 'sleep' },
  { t: 'It’s not about perfect.', b: 'It’s about showing up. Show up.', d: 'thumbs' },
  { t: 'Queen energy only.', b: 'Crown on, sneakers on.', d: 'cap' },
  { t: 'Earn that dinner.', b: 'Thirty minutes. You’ve got this.', d: 'eating' },
  { t: 'Your body can do it.', b: 'It’s your mind you need to convince.', d: 'confused' },
  { t: 'Progress, not perfection.', b: 'One more workout of progress, please.', d: 'plan' },
  { t: 'Heavy days build light hearts.', b: 'Go lift something.', d: 'flex' },
  { t: 'Dear {name},', b: 'The gym is open. You have no excuse. Love, me.', d: 'point' },
  { t: 'Glow mode: loading…', b: 'Requires one workout to finish.', d: 'laptop' },
  { t: 'Stop scrolling.', b: 'Start squatting.', d: 'shocked' },
  { t: 'Your streak is a promise.', b: 'Keep it today.', d: 'fire' },
  { t: 'The hardest part is the door.', b: 'Walk through it. The rest is easy.', d: 'cap' },
  { t: 'Sore today,', b: 'strong tomorrow. Go get sore.', d: 'sick' },
  { t: 'Fit girls don’t wait for Monday.', b: 'Today works just fine.', d: 'cheer' },
  { t: 'Be the girl who did it anyway.', b: 'Even today. Especially today.', d: 'flex' },
  { t: 'Workout now,', b: 'Netflix guilt-free later.', d: 'laptop' },
  { t: 'Your goals don’t care', b: 'that you’re "not in the mood".', d: 'angry' },
  { t: 'Thirty minutes.', b: 'That’s one episode. You can do one episode of gym.', d: 'plan' },
  { t: 'Hydrate. Lift. Slay.', b: 'In that order.', d: 'bottle' },
  { t: 'Make Rishu jealous of your gains.', b: 'Go, go, go!', d: 'cheeks' },
  { t: 'You are stronger', b: 'than your excuses. Prove it today.', d: 'fire' },
  { t: 'Today’s mood:', b: 'Unstoppable. Now go act like it.', d: 'celebrate' },
  { t: 'If it doesn’t challenge you,', b: 'it doesn’t change you. Go get challenged.', d: 'flex' },
  { t: 'Don’t wish for it.', b: 'Work for it. Starting now.', d: 'point' },
  { t: 'Every champion was once', b: 'a girl who refused to skip.', d: 'celebrate' },
  { t: 'The bar is not going to lift itself.', b: 'Help it out, {name}.', d: 'confused' },
  { t: 'Bad day?', b: 'Squat it out. Works every time.', d: 'cry' },
  { t: 'Small effort, every day.', b: 'That’s the whole secret.', d: 'thumbs' },
  { t: 'Leggings on = half done.', b: 'Do the other half.', d: 'cap' },
  { t: 'Your future self says thanks.', b: 'In advance. Now go.', d: 'love' },
  { t: 'Main character energy.', b: 'Main characters train.', d: 'cheer' },
  { t: 'You promised yourself.', b: 'Keep promises to yourself first.', d: 'love' },
  { t: 'Lazy? Cute. Not today though.', b: 'Gym time, {name}.', d: 'sleep' },
  { t: 'Keep the streak alive.', b: 'Feed it one workout.', d: 'fire' },
  { t: 'Can’t? Or won’t?', b: 'Pick "will". See you at the gym.', d: 'angry' },
  { t: 'Results are on the other side', b: 'of the gym door. Open it.', d: 'cap' },
  { t: 'Turn "I should" into "I did".', b: 'Takes about an hour.', d: 'plan' },
  { t: 'You’re not starting over.', b: 'You’re starting stronger.', d: 'flex' },
  { t: 'Proud of you already.', b: 'Even prouder after today’s workout.', d: 'cheeks' },
];

/** Short water nudges. */
export const WATER_LINES: string[] = [
  'Sip happens. Make it water.',
  'Hydrated girls glow different.',
  'Your skin just asked for a glass of water.',
  'Water first. Chai can wait five minutes.',
  'Tiny sips, big glow.',
  'Plants need water. So do queens.',
  'Thirsty for success? Start with water.',
  'A glass now, a better mood later.',
  'Drink up, buttercup.',
  'Hydrate like it’s your job.',
  'Water break! Your brain will thank you.',
  'Headache prevention: one glass, right now.',
  'Be like water: calm, clear, and frequent.',
  'Glow tip of the hour: drink water.',
  'Your bottle misses you.',
  'Stay hydrated, stay unbothered.',
  'Water is self-care in a glass.',
  'H₂O o’clock.',
  'Refill, refresh, repeat.',
  'Less snacking, more sipping.',
  'A glass of water a day keeps the cravings away.',
  'Tired? You might just be thirsty.',
  'Fuel the glow. Drink some water.',
  'Water you waiting for?',
  'Hydration station is open.',
  'Muscles are 75% water. Top them up.',
  'Glass half full? Finish it.',
  'Your future self is thirsty. Help her out.',
  'Sip, sip, hooray!',
  'One more glass towards today’s goal.',
  'Be the main character who drinks enough water.',
  'Water now = energy later.',
  'Don’t wait to feel thirsty. Drink now.',
  'Warm or room temperature — just drink it.',
  'Clear skin starts with a clear glass.',
  'Pause. Breathe. Sip.',
  'A hydrated body is a happy body.',
  'Let’s make it a two-glass afternoon.',
  'Small habit, big glow. Water time.',
  'Cheers to you — with water.',
];

export const pickByDay = <T,>(list: T[], key: string, salt = 0) => {
  const idx = Math.floor(parseKey(key).getTime() / 86400000) + salt;
  return list[((idx % list.length) + list.length) % list.length];
};

const at = (key: string, hour: number, minute: number) => {
  const d = parseKey(key);
  d.setHours(hour, minute, 0, 0);
  return d;
};

export function punchFor(key: string, name: string) {
  const p = pickByDay(PUNCH_LINES, key);
  return { title: p.t.replace('{name}', name), body: p.b.replace('{name}', name), doodle: p.d };
}

type N = Parameters<typeof LocalNotifications.schedule>[0]['notifications'][number];

/** Pure planner (unit-testable): what should be scheduled from `now` for the next WINDOW_DAYS. */
export function planReminders(d: AppData, now = new Date()): N[] {
  const rem = d.reminders;
  const name = d.profile.name || 'Sapna';
  const out: N[] = [];
  const base = { channelId: CH, smallIcon: 'ic_stat_sapna', iconColor: '#FF7A59' };
  const start = keyOf(now);
  const [ph, pm] = (rem.punchTime || '07:10').split(':').map((x) => parseInt(x, 10));
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(start, i);
    const n = i + 1; // ids: day slot * 100 + kind
    const push = (id: number, when: Date, x: Partial<N>) => {
      if (when.getTime() <= now.getTime() + 30000) return;
      out.push({ ...base, id, schedule: { at: when, allowWhileIdle: true }, title: '', body: '', ...x } as N);
    };
    if (rem.punch) {
      const p = punchFor(day, name);
      push(n * 100 + 1, at(day, ph || 7, isNaN(pm) ? 10 : pm), { channelId: CH_PUNCH, title: p.title, body: p.body, largeBody: p.body, largeIcon: 'doodle_' + p.doodle, summaryText: 'Sapna Health' } as Partial<N>);
    }
    if (rem.water) {
      // Smart: only inside her hours, counted from her last drink, nothing more once today's goal is hit.
      const c = targets as Content;
      const left = i === 0 ? Math.max(0, goalOn(d, c, day).ml - mlOn(d, day)) : 0;
      waterSlots(d, c, day, now.getTime()).forEach((ts, k) => {
        const line = pickByDay(WATER_LINES, day, k * 7);
        const title = k === 0 && i > 0 ? 'Good morning — water first 💧' : 'Water break 💧';
        const body = i === 0 ? `${line} ${fmtL(left)} to go today.` : line;
        push(n * 100 + 50 + k, new Date(ts), { title, body, largeIcon: 'doodle_bottle', actionTypeId: WATER_ACTIONS, extra: { kind: 'water' } } as Partial<N>);
      });
    }
    if (rem.meals) {
      push(n * 100 + 20, at(day, 13, 30), { title: 'Lunch time', body: `${name}, log lunch in two taps.`, largeIcon: 'doodle_eating' } as Partial<N>);
      push(n * 100 + 21, at(day, 20, 30), { title: 'Dinner check-in', body: 'Add dinner so today’s numbers are complete.', largeIcon: 'doodle_plan' } as Partial<N>);
    }
    if (rem.gym && d.profile.gymDays.includes(dow(day))) {
      push(n * 100 + 30, at(day, 18, 30), { title: 'Workout day', body: 'Your plan is ready — GIFs included.', largeIcon: 'doodle_flex' } as Partial<N>);
    }
    if (rem.weigh) {
      const wd = dow(day);
      if (wd === 5) {
        const done = d.weighIns.some((w) => w.date >= day);
        if (!done) push(n * 100 + 40, at(day, 8, 0), { title: 'Weigh-in Friday', body: 'After the loo, before breakfast — 10 seconds.', largeIcon: 'doodle_bottle' } as Partial<N>);
      }
      if (wd === 1) {
        const fri = lastFriday(day);
        const done = d.weighIns.some((w) => w.date >= fri && w.date <= day);
        if (!done) push(n * 100 + 41, at(day, 9, 30), { title: 'You skipped Friday’s weigh-in', body: 'No stress — step on the scale this morning and log it.', largeIcon: 'doodle_confused' } as Partial<N>);
      }
    }
  }
  return out;
}

let running: Promise<unknown> | null = null;

export async function notificationsAllowed(ask = true): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    if (!ask) return false;
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch {
    return false;
  }
}

/** Cancel everything we own and schedule the next window. Safe to call often. */
export async function syncReminders(d: AppData, opts: { ask?: boolean } = {}): Promise<'ok' | 'denied' | 'web'> {
  if (!Capacitor.isNativePlatform()) return 'web';
  const job = (async () => {
    try {
      const pending = await LocalNotifications.getPending();
      const ours = pending.notifications.filter((x) => x.id < 900000); // keep pushes and "in 30 min" snoozes
      if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((x) => ({ id: x.id })) });
    } catch {
      /* nothing pending */
    }
    const r = d.reminders;
    if (!(r.meals || r.water || r.gym || r.weigh || r.punch)) return 'ok' as const;
    if (!(await notificationsAllowed(opts.ask !== false))) return 'denied' as const;
    try {
      await LocalNotifications.createChannel({ id: CH, name: 'Reminders', description: 'Meals, water and weigh-ins', importance: 3, vibration: true });
      await LocalNotifications.createChannel({ id: CH_PUNCH, name: 'Gym punch lines', description: 'Your daily kick to get to the gym', importance: 4, vibration: true });
    } catch {
      /* channels exist */
    }
    try {
      const cup = waterPrefs(d.reminders).cup;
      await LocalNotifications.registerActionTypes({ types: [{ id: WATER_ACTIONS, actions: [{ id: 'drink', title: `+${cup} ml 💧` }, { id: 'later', title: 'In 30 min' }] }] });
    } catch {
      /* older Android: plain notification still works */
    }
    try {
      const list = planReminders(d);
      if (list.length) await LocalNotifications.schedule({ notifications: list });
      return 'ok' as const;
    } catch {
      return 'denied' as const;
    }
  })();
  running = job;
  return job;
}

export const isSyncing = () => running;

/** "In 30 min" from a water notification. */
export async function snoozeWater(d: AppData, minutes = 30) {
  if (!Capacitor.isNativePlatform()) return;
  const left = Math.max(0, goalOn(d, targets as Content, keyOf(new Date())).ml - mlOn(d, keyOf(new Date())));
  await LocalNotifications.schedule({ notifications: [{ id: 990000 + Math.floor(Math.random() * 9000), channelId: CH, smallIcon: 'ic_stat_sapna', iconColor: '#FF7A59', title: 'Water break 💧', body: `As promised — a glass now. ${fmtL(left)} to go today.`, largeIcon: 'doodle_bottle', actionTypeId: WATER_ACTIONS, extra: { kind: 'water' }, schedule: { at: new Date(Date.now() + minutes * 60000), allowWhileIdle: true } } as N] }).catch(() => {});
}
