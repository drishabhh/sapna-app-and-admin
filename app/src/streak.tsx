import { Capacitor, registerPlugin } from '@capacitor/core';
import { DOW_LETTER, dow } from './lib/dates';
import { StreakInfo, StreakMood } from './lib/calc';
import { Icon } from './ui';

export type DoodleName = 'thumbsup' | 'dumbbell' | 'water' | 'planning' | 'stretch';

export function Doodle({ name, size = 120, alt = '', style }: { name: DoodleName; size?: number; alt?: string; style?: React.CSSProperties }) {
  return <img className="doodle" src={`./doodles/${name}.webp`} width={size} height={size} alt={alt} draggable={false} style={{ width: size, height: size, ...style }} />;
}

export const MOOD_DOODLE: Record<StreakMood, DoodleName> = {
  workout: 'dumbbell',
  done: 'thumbsup',
  pending: 'planning',
  late: 'water',
  fresh: 'stretch',
};

export function streakLine(s: StreakInfo): { title: string; sub: string } {
  switch (s.mood) {
    case 'workout':
      return { title: 'Workout done!', sub: 'Streak safe for today — you showed up.' };
    case 'done':
      return { title: 'Logged today', sub: 'Streak safe. See you tomorrow.' };
    case 'pending':
      return { title: 'Keep it going', sub: 'Log any meal today to add a day.' };
    case 'late':
      return { title: 'Still time tonight', sub: `One quick log keeps your ${s.streak}-day streak.` };
    default:
      return { title: 'Start a streak', sub: 'Log one meal today — that’s day one.' };
  }
}

export function StreakCard({ s, onLog }: { s: StreakInfo; onLog: () => void }) {
  const line = streakLine(s);
  return (
    <section className="card streak" aria-label={`${s.streak}-day streak`} data-acc="workout">
      <div className="streak-top">
        <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
            <span className="streak-flame" aria-hidden="true"><Icon name="flame" size={30} stroke={2.2} /></span>
            <span className="big" style={{ fontSize: 46 }}>{s.streak}</span>
          </div>
          <p className="eyebrow" style={{ color: 'var(--acc-t)' }}>day streak{s.best > s.streak ? ` · best ${s.best}` : ''}</p>
          <p className="h3" style={{ marginTop: 8 }}>{line.title}</p>
          <p className="small muted">{line.sub}</p>
        </div>
        <Doodle name={MOOD_DOODLE[s.mood]} size={128} style={{ marginTop: -26, marginRight: -8 }} />
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
  pin(): Promise<{ supported: boolean }>;
}
const StreakWidget = registerPlugin<StreakWidgetPlugin>('StreakWidget');

let lastSent = '';
export function syncWidget(s: StreakInfo, name: string) {
  if (!Capacitor.isNativePlatform()) return;
  const payload = JSON.stringify({
    name,
    streak: s.streak,
    best: s.best,
    lastActive: s.lastActive,
    workoutOn: s.mood === 'workout' ? s.week.find((w) => w.isToday)?.key ?? null : null,
    week: s.week.filter((w) => w.done).map((w) => w.key),
  });
  if (payload === lastSent) return;
  lastSent = payload;
  StreakWidget.update({ json: payload }).catch(() => {});
}

export async function pinWidget(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await StreakWidget.pin()).supported;
  } catch {
    return false;
  }
}
