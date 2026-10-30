import { Capacitor, registerPlugin } from '@capacitor/core';
import { addDays, DOW_LETTER, dow, today } from './lib/dates';
import { workoutDays } from './lib/workoutStreak';
import type { AppData, Content } from './lib/types';
import { GLASS_ML, goalOn, mlOn, waterPrefs } from './lib/water';
import { StreakInfo } from './lib/calc';
import type { DoodleName } from './lib/mood';
import { Icon } from './ui';
import { Num } from './anim';

export type { DoodleName };

export function Doodle({ name, size = 120, alt = '', style }: { name: DoodleName; size?: number; alt?: string; style?: React.CSSProperties }) {
  return <img className="doodle" src={`./doodles/${name}.webp`} width={size} height={size} alt={alt} draggable={false} style={{ width: size, height: size, ...style }} />;
}

export function StreakCard({ s, onLog }: { s: StreakInfo; onLog: () => void }) {
  const mood = s.mood;
  return (
    <section className={`card streak tone-${mood.tone}`} aria-label={`${s.streak}-day streak`} data-acc="workout">
      <div className="streak-top">
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
            <span className={`streak-flame${mood.lit ? '' : ' out'}`} aria-hidden="true"><Icon name="flame" size={30} stroke={2.2} /></span>
            <span className="big" style={{ fontSize: 46 }}><Num value={s.streak} duration={800} /></span>
          </div>
          <p className="eyebrow" style={{ color: 'var(--acc-t)' }}>day streak{s.best > s.streak ? ` · best ${s.best}` : ''}</p>
          <p className="h3" style={{ marginTop: 8 }}>{mood.title}</p>
          <p className="small muted">{mood.sub}</p>
        </div>
        <Doodle key={mood.doodle} name={mood.doodle} size={132} style={{ marginTop: -28, marginRight: -8 }} />
      </div>
      <div className="streak-week" role="list" aria-label="This week">
        {s.week.map((w) => (
          <div key={w.key} role="listitem" className={`sday${w.done ? ' on' : ''}${w.isToday ? ' today' : ''}${w.future ? ' future' : ''}`} aria-label={`${w.key}${w.done ? ' logged' : ''}`}>
            <span className="sdot">{w.done ? <Icon name="check" size={14} stroke={3} /> : null}</span>
            <span className="sletter">{DOW_LETTER[dow(w.key)]}</span>
          </div>
        ))}
      </div>
      {!s.doneToday ? (
        <button type="button" className="btn block sm" style={{ marginTop: 14 }} onClick={onLog}>Log a meal</button>
      ) : null}
    </section>
  );
}

/* ---------- Home-screen widget bridge (Android) ---------- */

interface StreakWidgetPlugin {
  update(o: { json: string }): Promise<void>;
  configureSteps(o: { enabled: boolean; time: string; name: string; loggedOn: string }): Promise<void>;
  pin(): Promise<{ supported: boolean }>;
  updateWater(o: { json: string }): Promise<void>;
  takeDrinks(): Promise<{ drinks: { at: number; ml: number }[] }>;
  pinWater(): Promise<{ supported: boolean }>;
}
const StreakWidget = registerPlugin<StreakWidgetPlugin>('StreakWidget');

let lastSent = '';
/** The widget shows the WORKOUT streak; it recomputes mood/time-of-day itself, so we only send facts. */
export function syncWidget(d: AppData) {
  if (!Capacitor.isNativePlatform()) return;
  const cutoff = addDays(today(), -150);
  const payload = JSON.stringify({
    v: 2,
    name: d.profile.name || 'Sapna',
    gymDays: d.profile.gymDays,
    workouts: [...workoutDays(d.sessions)].filter((k) => k >= cutoff).sort(),
  });
  if (payload === lastSent) return;
  lastSent = payload;
  StreakWidget.update({ json: payload }).catch(() => {});
}

let lastSteps = '';
/** Native 11:30 pm steps prompt (works with the app closed). Skips tonight once steps are logged. */
export function syncNightSteps(d: AppData) {
  if (!Capacitor.isNativePlatform()) return;
  const t = today();
  const o = { enabled: d.reminders.steps !== false, time: '23:30', name: d.profile.name || 'Sapna', loggedOn: (d.steps[t] || 0) > 0 ? t : '' };
  const key = JSON.stringify(o);
  if (key === lastSteps) return;
  lastSteps = key;
  StreakWidget.configureSteps(o).catch(() => {});
}

export async function pinWidget(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await StreakWidget.pin()).supported;
  } catch {
    return false;
  }
}

let lastWater = '';
/** The water widget redraws itself through the day; we send today's facts whenever they change. */
export function syncWaterWidget(d: AppData, c: Content) {
  if (!Capacitor.isNativePlatform()) return;
  const t = today();
  const p = waterPrefs(d.reminders);
  const payload = JSON.stringify({ v: 1, date: t, ml: mlOn(d, t), goal: goalOn(d, c, t).ml, base: Math.max(1, c.targets.water || 8) * GLASS_ML, cup: p.cup, from: p.from, to: p.to, name: d.profile.name || 'Sapna' });
  if (payload === lastWater) return;
  lastWater = payload;
  StreakWidget.updateWater({ json: payload }).catch(() => {});
}

/** Drinks tapped on the widget while the app was closed. */
export async function takeWidgetDrinks(): Promise<{ at: number; ml: number }[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const r = await StreakWidget.takeDrinks();
    lastWater = ''; // make sure the widget gets the merged numbers back
    return (r.drinks || []).filter((x) => x && typeof x.at === 'number' && typeof x.ml === 'number' && x.ml > 0 && x.ml <= 3000);
  } catch {
    return [];
  }
}

export async function pinWaterWidget(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await StreakWidget.pinWater()).supported;
  } catch {
    return false;
  }
}
