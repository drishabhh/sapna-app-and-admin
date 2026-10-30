import { useEffect, useRef, useState } from 'react';
import { addDays, DOW_LETTER, dow, timeLabel, today } from './lib/dates';
import { haptic, syncReminders } from './lib/native';
import { useStore } from './lib/store';
import type { AppData, Content, Reminders } from './lib/types';
import { addDrink, CUPS, drinksOf, EVERY_CHOICES, fmtL, goalOn, mlOn, removeDrink, waterPrefs, waterSlots, waterStreak } from './lib/water';
import { Doodle, pinWaterWidget } from './streak';
import type { DoodleName } from './lib/mood';
import { Icon, Seg, Sheet, Toggle, toast } from './ui';

/** One drink, with the little moments the good hydration apps get right: haptic, progress, a cheer at the goal. */
export function drink(get: () => AppData, update: (fn: (d: AppData) => AppData) => void, c: Content, ml: number) {
  const d = today();
  const before = mlOn(get(), d);
  const goal = goalOn(get(), c, d).ml;
  update((x) => addDrink(x, d, ml));
  const after = before + ml;
  if (before < goal && after >= goal) { haptic.success(); toast('Goal hit! 💧 Hydrated queen.'); }
  else { haptic.tap(); toast(`+${ml} ml · ${fmtL(after)} of ${fmtL(goal)}`); }
}

const moodFor = (pct: number): DoodleName => (pct >= 100 ? 'celebrate' : pct >= 70 ? 'thumbs' : pct >= 35 ? 'bottle' : pct > 0 ? 'confused' : 'sleep');
const lineFor = (pct: number, left: number) =>
  pct >= 100 ? 'Goal done. Your skin says thank you.' : pct >= 70 ? `Almost there — ${fmtL(left)} to go.` : pct >= 35 ? `Nice pace. ${fmtL(left)} to go.` : pct > 0 ? `Good start. ${fmtL(left)} to go.` : 'First glass of the day?';
const fmt12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`; };
const hrs = (m: number) => (m % 60 ? `${Math.floor(m / 60)}½` : `${m / 60}`);

/** The glass with water in it (animated fill + gentle wave). */
export function WaterGlass({ pct, w = 120, h = 168, label = true }: { pct: number; w?: number; h?: number; label?: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = window.setTimeout(() => setShown(Math.min(100, Math.max(0, pct))), 60); return () => window.clearTimeout(t); }, [pct]);
  return (
    <div className="wglass" style={{ width: w, height: h }} role="img" aria-label={`${Math.round(pct)}% of today’s water`}>
      <div className="wfill" style={{ height: `${shown}%` }}><span className="wave" /><span className="wave w2" /></div>
      {label ? <span className="wpct">{Math.round(pct)}%</span> : null}
    </div>
  );
}

/** Today screen: one tap logs her usual cup; tapping the card opens the water sheet. */
export function WaterCard({ onOpen }: { onOpen: () => void }) {
  const { data, content, update } = useStore();
  const latest = useRef(data); latest.current = data;
  const d = today();
  const ml = mlOn(data, d);
  const g = goalOn(data, content, d);
  const pct = (ml / g.ml) * 100;
  const cup = waterPrefs(data.reminders).cup;
  return (
    <div className="card tight stack water-card" style={{ gap: 10, cursor: 'pointer' }} data-acc="progress" role="button" tabIndex={0}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} aria-label={`Water: ${fmtL(ml)} of ${fmtL(g.ml)}. Open water`}>
      <div className="between"><strong className="row" style={{ gap: 6 }}><Icon name="drop" size={18} /> Water</strong>{pct >= 100 ? <span className="acc-t small" style={{ fontWeight: 800 }}>Done ✓</span> : null}</div>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
        <WaterGlass pct={pct} w={34} h={48} label={false} />
        <p className="big" style={{ fontSize: 24, whiteSpace: 'nowrap' }}>{fmtL(ml)}<span className="small muted" style={{ fontFamily: 'var(--body)', fontWeight: 600 }}> / {fmtL(g.ml)}</span></p>
      </div>
      <button type="button" className="btn sm" style={{ whiteSpace: 'nowrap', padding: '0 8px' }} aria-label={`Drink ${cup} ml`}
        onClick={(e) => { e.stopPropagation(); drink(() => latest.current, update, content, cup); }}>
        <Icon name="plus" size={18} stroke={2.6} /> {cup} ml
      </button>
    </div>
  );
}

/** Everything water: the glass, cup sizes, today's sips, the week, and her reminder hours. */
export function WaterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, content, update } = useStore();
  const latest = useRef(data); latest.current = data;
  const [other, setOther] = useState('');
  const [showOther, setShowOther] = useState(false);
  if (!open) return null;
  const d = today();
  const p = waterPrefs(data.reminders);
  const ml = mlOn(data, d);
  const g = goalOn(data, content, d);
  const pct = (ml / g.ml) * 100;
  const left = Math.max(0, g.ml - ml);
  const list = drinksOf(data, d);
  const streak = waterStreak(data, content, d);
  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));

  const setRem = async (patch: Partial<Reminders>) => {
    const next = { ...latest.current, reminders: { ...latest.current.reminders, ...patch } };
    update((x) => ({ ...x, reminders: { ...x.reminders, ...patch } }));
    if (patch.water === true) { const r = await syncReminders(next); if (r === 'denied') toast('Allow notifications for Sapna Health in phone Settings.'); }
  };
  const setCup = (c: number) => { haptic.tap(); setRem({ waterCup: c }); };
  const nextAt = data.reminders.water ? waterSlots(data, content, d)[0] : undefined;
  const tomorrowFirst = data.reminders.water ? waterSlots(data, content, addDays(d, 1))[0] : undefined;

  return (
    <Sheet open onClose={onClose} label="Water">
      <div className="stack" style={{ gap: 16 }} data-acc="progress">
        <div className="between"><h2 className="h2">Water</h2>{streak ? <span className="pill">🔥 {streak}-day streak</span> : null}</div>

        <div className="row" style={{ gap: 18, alignItems: 'center', justifyContent: 'center' }}>
          <WaterGlass pct={pct} />
          <div className="stack" style={{ gap: 4, minWidth: 0 }}>
            <p className="big" style={{ fontSize: 40 }}>{fmtL(ml)}</p>
            <p className="small muted">of {fmtL(g.ml)}{g.bonus ? <><br />+0.5 L — you trained 💪</> : null}</p>
            <Doodle name={moodFor(pct)} size={84} />
          </div>
        </div>
        <p style={{ textAlign: 'center', fontWeight: 700 }}>{lineFor(pct, left)}</p>

        <div className="stack" style={{ gap: 10 }}>
          <div className="chips" role="group" aria-label="Cup size" style={{ justifyContent: 'center' }}>
            {CUPS.map((c) => <button key={c} type="button" className="chip" aria-pressed={p.cup === c} onClick={() => setCup(c)}>{c} ml</button>)}
            <button type="button" className="chip" aria-pressed={!CUPS.includes(p.cup)} onClick={() => setShowOther(true)}>{CUPS.includes(p.cup) ? 'Other' : `${p.cup} ml`}</button>
          </div>
          {showOther ? (
            <div className="row" style={{ gap: 8 }}>
              <input className="input" inputMode="numeric" autoFocus placeholder="ml, e.g. 400" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <button type="button" className="btn ghost" onClick={() => { const v = Number(other); if (v >= 50 && v <= 1500) { setCup(v); setShowOther(false); setOther(''); } else toast('Between 50 and 1500 ml'); }}>Use</button>
            </div>
          ) : null}
          <button type="button" className="btn lg block" onClick={() => drink(() => latest.current, update, content, p.cup)}>
            <Icon name="drop" size={20} /> Drink {p.cup} ml
          </button>
        </div>

        <section className="stack" style={{ gap: 6 }} aria-label="Today’s drinks">
          <div className="between"><strong>Today</strong><span className="small muted">{list.length} drink{list.length === 1 ? '' : 's'}</span></div>
          {list.length ? list.slice().reverse().map((x, ri) => {
            const i = list.length - 1 - ri;
            return (
              <div key={`${x.at}-${i}`} className="list-row" style={{ padding: '8px 12px' }}>
                <span className="acc-t"><Icon name="drop" size={18} /></span>
                <span style={{ flex: 1 }}><strong>{x.ml} ml</strong> <span className="small muted">{x.at ? timeLabel(x.at) : 'earlier'}{x.by === 'rishu' ? ' · added by Rishu' : ''}</span></span>
                <button type="button" className="icon-btn" aria-label={`Remove ${x.ml} ml`} onClick={() => { haptic.tap(); update((y) => removeDrink(y, d, i)); }}><Icon name="trash" size={17} /></button>
              </div>
            );
          }) : <p className="small muted">Nothing yet — tap the button above after your first glass.</p>}
        </section>

        <section className="stack" style={{ gap: 8 }} aria-label="This week">
          <strong>This week</strong>
          <div className="wweek">
            {week.map((k) => {
              const v = mlOn(data, k); const gg = goalOn(data, content, k).ml; const pp = Math.min(100, (v / gg) * 100);
              return (
                <div key={k} className="wcol" aria-label={`${k}: ${fmtL(v)}`}>
                  <span className="wbar"><i style={{ height: `${pp}%` }} className={pp >= 100 ? 'met' : ''} /></span>
                  <span className={`small ${k === d ? 'acc-t' : 'muted'}`} style={{ fontWeight: 700 }}>{DOW_LETTER[dow(k)]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card tight stack" style={{ gap: 12 }} aria-label="Water reminders">
          <div className="between">
            <div><strong>Reminders</strong><p className="small muted">{!data.reminders.water ? 'Off' : nextAt ? `Next at ${timeLabel(nextAt)}` : pct >= 100 ? `Done for today — back ${tomorrowFirst ? 'at ' + timeLabel(tomorrowFirst) + ' tomorrow' : 'tomorrow'}` : 'No more today'}</p></div>
            <Toggle label="Water reminders" on={data.reminders.water} onChange={(v) => setRem({ water: v })} />
          </div>
          {data.reminders.water ? (
            <>
              <Seg<string> label="How often" value={String(p.every)} onChange={(v) => setRem({ waterEvery: Number(v) })} options={EVERY_CHOICES.map((m) => ({ v: String(m), l: `${hrs(m)} h` }))} />
              <div className="grid2">
                <label className="field">From<input className="input" type="time" value={p.from} onChange={(e) => e.target.value && setRem({ waterFrom: e.target.value })} /></label>
                <label className="field">Until<input className="input" type="time" value={p.to} onChange={(e) => e.target.value && setRem({ waterTo: e.target.value })} /></label>
              </div>
              <p className="small muted">Every {hrs(p.every)} h between {fmt12(p.from)} and {fmt12(p.to)}, counted from your last drink. They stop once you hit your goal. Tap <b>+{p.cup} ml</b> on a notification to log it in one go.</p>
            </>
          ) : null}
        </section>

        <button type="button" className="btn ghost block" onClick={async () => { if (!(await pinWaterWidget())) toast('Long-press your home screen → Widgets → Sapna Health → Sapna water'); }}>
          <Icon name="plus" size={18} /> Put water on my home screen
        </button>
      </div>
    </Sheet>
  );
}

export { fmt12 as waterTime, hrs as waterHours };
