import { Capacitor, registerPlugin } from '@capacitor/core';
import { DOW_LETTER, dow } from './lib/dates';
import { StreakInfo } from './lib/calc';
import type { DoodleName } from './lib/mood';
import { Icon } from './ui';

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
            <span className="big" style={{ fontSize: 46 }}>{s.streak}</span>
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
    prevActive: s.prevActive,
    workoutOn: s.workoutToday ? s.lastActive : null,
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
