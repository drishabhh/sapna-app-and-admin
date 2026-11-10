import { guideFor, symptomTips } from './lib/cycletips';
import { cycleInfo } from './lib/calc';
import { haptic } from './lib/native';
import { today } from './lib/dates';
import { useStore } from './lib/store';
import { useNav } from './nav';

const QUICK = ['Low energy', 'Cramps', 'Bloating', 'Cravings'];

/** Quick "how are you today?" — logs straight into her cycle, and the gym coach listens. */
export function useToggleSymptom() {
  const { update } = useStore();
  return (s: string) => {
    haptic.tap();
    const t = today();
    update((d) => {
      const cur = d.cycle[t]?.symptoms || [];
      const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
      return { ...d, cycle: { ...d.cycle, [t]: { ...(d.cycle[t] || {}), symptoms: next } } };
    });
  };
}

/** Today screen: phase, one line for today, quick symptoms. */
export function CycleTodayCard() {
  const { data } = useStore();
  const nav = useNav();
  const toggle = useToggleSymptom();
  const info = cycleInfo(data);
  const g = guideFor(data);
  if (!info || !g) return null;
  const sym = data.cycle[today()]?.symptoms || [];
  return (
    <section className="card stack" data-acc="cycle" style={{ gap: 8 }} aria-label="Cycle today">
      <div className="between"><p className="eyebrow" style={{ color: 'var(--acc-t)' }}>Cycle · day {info.day}</p><span className="pill">{g.label}</span></div>
      <p className="h3" style={{ fontSize: 18 }}>{g.headline}</p>
      <p className="small">{g.train}</p>
      <div className="chips" role="group" aria-label="How are you today?" style={{ marginTop: 2 }}>
        {QUICK.map((s) => <button key={s} type="button" className="chip sm" aria-pressed={sym.includes(s)} onClick={() => toggle(s)}>{s}</button>)}
      </div>
      <button type="button" className="btn quiet sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => nav.go('cycle')}>Today’s full guide →</button>
    </section>
  );
}

/** Cycle screen: train / eat / feel for today, plus help for what she logged. */
export function GuideCard() {
  const { data } = useStore();
  const g = guideFor(data);
  if (!g) return null;
  const tips = symptomTips(data);
  const rows: [string, string, string][] = [['🏋️', 'Train', g.train], ['🥗', 'Eat', g.eat], ['🌿', 'Feel better', g.feel]];
  return (
    <section className="card stack guide" style={{ gap: 12 }} aria-label="Today's guide">
      <div className="stack" style={{ gap: 2 }}>
        <p className="eyebrow acc-t">Today’s guide · {g.label}</p>
        <h2 className="h2" style={{ fontSize: 21 }}>{g.headline}</h2>
      </div>
      {rows.map(([ic, t, body]) => (
        <div key={t} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <span className="guide-ic" aria-hidden="true">{ic}</span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}><strong>{t}</strong><span className="small">{body}</span></div>
        </div>
      ))}
      {tips.length ? (
        <div className="stack" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <strong className="small">For what you logged today</strong>
          {tips.map((x) => <p key={x.s} className="small"><b>{x.s}:</b> {x.tip}</p>)}
        </div>
      ) : null}
      <p className="small muted">Why: {g.why} Everyone’s different — your body has the final say.</p>
    </section>
  );
}

/** Workout tab: one line on how the cycle shapes today's session. */
export function CycleGymLine() {
  const { data } = useStore();
  const g = guideFor(data);
  if (!g) return null;
  const line = g.ease ? 'The coach keeps today’s weights where they were — showing up is the win.'
    : g.stage === 'follicular' ? 'Your strong window — a good week to chase a new best.'
    : g.stage === 'ovulation' ? 'Peak energy — take an extra warm-up set.'
    : g.stage === 'pms' ? 'Pre-period days — hold your weights, rest a bit longer.' : null;
  if (!line) return null;
  return <p className="small row cycle-line" data-acc="cycle" style={{ marginTop: 12, alignItems: 'flex-start' }}><span aria-hidden="true">🌙</span> <span><b>{g.label}:</b> {line}</span></p>;
}
