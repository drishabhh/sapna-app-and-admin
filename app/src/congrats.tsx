import { ReactNode, useMemo, useState } from 'react';
import { streakInfo, weighStatus } from './lib/calc';
import { latestWeight } from './lib/home';
import { haptic } from './lib/native';
import { useStore } from './lib/store';
import { today } from './lib/dates';
import { Doodle, type DoodleName } from './streak';
import { Icon, Stepper, toast } from './ui';

export type Feel = 'easy' | 'right' | 'hard';

export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.2 + Math.random() * 1.6,
        rot: Math.random() * 360,
        color: ['var(--coral)', 'var(--lime)', 'var(--amber)', 'var(--pink)', 'var(--cyan)', 'var(--violet)'][i % 6],
        w: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, width: b.w, height: b.w * 1.6, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}

/** Weigh-in prompt: Friday ask, Monday nudge if she skipped. `force` shows it anyway (e.g. on the congrats screen). */
export function WeighCard({ force = false, compact = false }: { force?: boolean; compact?: boolean }) {
  const { data, update } = useStore();
  const status = weighStatus(data);
  const [kg, setKg] = useState(() => latestWeight(data));
  const [saved, setSaved] = useState(false);
  if (saved) return null;
  if (!status && !force) return null;
  const missed = status === 'missed';
  const doodle: DoodleName = missed ? 'confused' : 'bottle';
  function save() {
    const t = today();
    update((d) => ({ ...d, weighIns: [...d.weighIns.filter((w) => w.date !== t), { date: t, kg }], profile: { ...d.profile, weightKg: kg } }));
    haptic.success();
    toast('Weigh-in saved');
    setSaved(true);
  }
  return (
    <section className={`card weigh${missed ? ' tone-hot' : ''}`} aria-label="Weekly weigh-in" data-acc="progress">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <p className="eyebrow acc-t">{missed ? 'Missed Friday' : status === 'friday' ? 'Weigh-in Friday' : 'Quick weigh-in'}</p>
          <p className="h3">{missed ? 'You skipped Friday’s weigh-in' : 'How much do you weigh today?'}</p>
          {!compact ? <p className="small muted">Same morning routine: after the loo, before breakfast. Trends matter, not one number.</p> : null}
        </div>
        <Doodle name={doodle} size={86} style={{ marginTop: -18 }} />
      </div>
      <div className="row" style={{ gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1 }}><Stepper label="weight" value={kg} step={0.1} decimals={1} min={30} max={200} unit="kg" onChange={setKg} /></div>
        <button type="button" className="btn" onClick={save}><Icon name="check" size={18} stroke={2.6} /> Save</button>
      </div>
    </section>
  );
}

export function Congrats({ title, sub, stats, extra, onFeel, onDone, doodle = 'celebrate' }: {
  title: string;
  sub: string;
  stats: { label: string; value: string | number; unit?: string }[];
  extra?: ReactNode;
  onFeel?: (f: Feel) => void;
  onDone: () => void;
  doodle?: DoodleName;
}) {
  const { data } = useStore();
  const s = streakInfo(data);
  const [feel, setFeel] = useState<Feel | null>(null);
  return (
    <div className="screen no-nav congrats" data-acc="workout" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="glow" />
      <Confetti />
      <div className="stack" style={{ gap: 16, flex: 1 }}>
        <div className="doodle-hero"><Doodle name={doodle} size={190} /></div>
        <div className="stack" style={{ gap: 6, textAlign: 'center' }}>
          <p className="eyebrow acc-t">{sub}</p>
          <h1 className="h1" style={{ fontSize: 38 }}>{title}</h1>
          {s.streak > 0 ? <p className="pill" style={{ alignSelf: 'center' }}><Icon name="flame" size={14} /> {s.streak}-day streak</p> : null}
        </div>
        <div className="grid3">
          {stats.map((x) => (
            <div key={x.label} className="card tight" style={{ textAlign: 'center' }}>
              <p className="big" style={{ fontSize: 28 }}>{x.value}{x.unit ? <span className="small"> {x.unit}</span> : null}</p>
              <p className="eyebrow" style={{ marginTop: 4 }}>{x.label}</p>
            </div>
          ))}
        </div>
        {onFeel ? (
          <section className="card stack" style={{ gap: 10 }} aria-label="How did it feel?">
            <p className="h3">How did it feel?</p>
            <div className="grid3">
              {([['easy', 'Too easy', 'cheer'], ['right', 'Just right', 'thumbs'], ['hard', 'Too hard', 'sick']] as [Feel, string, DoodleName][]).map(([v, l, dd]) => (
                <button key={v} type="button" className="feel" aria-pressed={feel === v} onClick={() => { setFeel(v); onFeel(v); haptic.tap(); }}>
                  <Doodle name={dd} size={54} />
                  <span>{l}</span>
                </button>
              ))}
            </div>
            {feel ? <p className="small muted">{feel === 'easy' ? 'Got it — the next days get a bit tougher.' : feel === 'hard' ? 'Noted — we’ll ease off a little next time.' : 'Perfect. Same pace tomorrow.'}</p> : null}
          </section>
        ) : null}
        {extra}
        <WeighCard force={data.weighIns.length === 0 || weighStatus(data) !== null} compact />
        <span className="spacer" />
        <button type="button" className="btn lg block" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
