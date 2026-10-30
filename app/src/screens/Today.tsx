import { useEffect, useState } from 'react';
import { cycleInfo, isGymDay, mealFor, streakInfo, mealTotals, planBrief, todayPlan, PHASE_COPY, sessionsOn, totalsOn } from '../lib/calc';
import { greeting, longLabel, today } from '../lib/dates';
import { useStore } from '../lib/store';
import { Food, Meal, MEALS } from '../lib/types';
import { useNav } from '../nav';
import { Bar, Icon, Ring, Sheet, toast } from '../ui';
import { StreakCard } from '../streak';
import { WeighCard } from '../congrats';
import { burnedOn, latestWeight, stepsKcal } from '../lib/burn';
import { takeStepsRequest } from '../lib/intents';
import { Num } from '../anim';
import { TTL, useDraft } from '../lib/drafts';
import { InstantNudge } from '../power';
import { MealSheet } from '../foodedit';
import { WaterCard, WaterSheet } from '../water';
import { takeWaterRequest } from '../lib/intents';

export default function Today() {
  const { data, content, foods, update, exById, contentFresh } = useStore();
  const nav = useNav();
  const d = today();
  const t = totalsOn(data, d);
  const burned = burnedOn(data, d);
  // Exercise earns back half of what it burned — enough to fuel her, not enough to stall fat loss.
  const earned = Math.round(burned / 2);
  const left = content.targets.kcal + earned - t.kcal;
  const protLeft = Math.max(0, Math.round(content.targets.protein - t.protein));
  const steps = data.steps[d] || 0;
  const streak = streakInfo(data);
  const plan = todayPlan(data, content);
  const done = sessionsOn(data, d).some((s) => s.endedAt && s.sets.length && (!plan || s.planId === plan.id));
  const gym = isGymDay(data);
  const cyc = data.profile.cycleEnabled ? cycleInfo(data) : null;
  const [mealOpen, setMealOpen] = useState<Meal | null>(null);
  const [stepsOpen, setStepsOpen] = useDraft('today.stepsOpen', false);
  const [stepsVal, setStepsVal] = useDraft('today.stepsVal', '', TTL.text);
  const [waterOpen, setWaterOpen] = useDraft('today.waterOpen', false);
  // Opened from a water reminder.
  useEffect(() => {
    const open = () => { if (takeWaterRequest()) setWaterOpen(true); };
    open();
    document.addEventListener('open-water', open);
    return () => document.removeEventListener('open-water', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const kg = latestWeight(data);
  // Opened from the 11:30 pm "How many steps today?" notification.
  useEffect(() => {
    const open = () => { if (takeStepsRequest()) { setStepsVal(String(data.steps[today()] || '')); setStepsOpen(true); } };
    open();
    document.addEventListener('open-steps', open);
    return () => document.removeEventListener('open-steps', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestion = suggest(foods, left, protLeft);

  return (
    <div className="screen" data-acc="today">
      <div className="glow" />
      <div className="stack" style={{ gap: 16 }}>
        <header className="between" style={{ alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: 2 }}>
            <p className="eyebrow">{greeting()}, {data.profile.name}</p>
            <h1 className="h1">Today</h1>
            <p className="muted">{longLabel(d)}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Settings and backup" onClick={nav.openSettings}><Icon name="settings" /></button>
        </header>

        {content.message ? (
          <div className="card tight row" style={{ alignItems: 'flex-start' }}>
            <span className="acc-t"><Icon name="spark" size={20} /></span>
            <p><strong>From Rishu:</strong> {content.message}</p>
          </div>
        ) : contentFresh ? (
          <div className="card tight row"><span className="acc-t"><Icon name="spark" size={20} /></span><p>New plan from Rishu just arrived.</p></div>
        ) : null}

        <section className="card hero" aria-label="Calories and protein">
          <div className="row" style={{ gap: 18 }}>
            <Ring value={t.kcal} max={content.targets.kcal + earned} label={`${t.kcal} of ${content.targets.kcal} kcal eaten`} color={left < 0 ? 'var(--danger)' : 'var(--acc)'}>
              <span className="big" style={{ fontSize: 40 }}><Num value={Math.abs(left)} duration={1100} /></span>
              <span className="small muted">{left >= 0 ? 'kcal left' : 'kcal over'}</span>
            </Ring>
            <div className="stack" style={{ gap: 12, minWidth: 0 }}>
              <div><p className="eyebrow">Eaten</p><p className="big" style={{ fontSize: 26 }}><Num value={t.kcal} /></p></div>
              <div><p className="eyebrow">Target</p><p className="big" style={{ fontSize: 26 }}><Num value={content.targets.kcal} /></p></div>
              {burned ? <div data-acc="workout"><p className="eyebrow acc-t">Burned</p><p className="big" style={{ fontSize: 22 }}><Num value={burned} /><span className="small muted" style={{ fontFamily: 'var(--body)', fontWeight: 600 }}> · +{earned} to eat</span></p></div> : null}
            </div>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 18 }} data-acc="food">
            <div className="between"><strong>Protein</strong><span className="small muted"><strong className="acc-t">{t.protein} g</strong> / {content.targets.protein} g{protLeft > 0 ? ` · ${protLeft} g to go` : ' · done'}</span></div>
            <Bar value={t.protein} max={content.targets.protein} label={`Protein ${t.protein} of ${content.targets.protein} grams`} />
          </div>
        </section>

        <InstantNudge />
        <WeighCard />

        <StreakCard s={streak} onLog={() => nav.openLogger(mealFor())} />

        {suggestion ? (
          <section className="card ink" aria-label="Suggestion" data-acc="food">
            <p className="eyebrow row" style={{ color: 'var(--acc-t)', gap: 6 }}><Icon name="spark" size={16} /> {suggestion.title}</p>
            <p className="h3" style={{ fontSize: 18, marginTop: 8 }}>{suggestion.food.name} <span className="muted" style={{ fontWeight: 500 }}>({suggestion.food.portion})</span></p>
            <p className="muted" style={{ marginTop: 2 }}>{suggestion.food.kcal} kcal · {suggestion.food.protein} g protein — {suggestion.why}</p>
            <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={() => nav.openLogger(mealFor())}>Log it</button>
          </section>
        ) : null}

        <section aria-label="Meals" className="stack" style={{ gap: 10 }}>
          <div className="between"><h2 className="h2">Meals</h2><button type="button" className="btn quiet" onClick={() => nav.go('food')}>See day</button></div>
          {MEALS.map((m) => {
            const mt = mealTotals(data, d, m.id);
            const names = mt.entries.map((e) => e.name + (e.mult !== 1 ? ` ×${e.mult}` : '')).join(', ');
            return (
              <div key={m.id} className="list-row" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => (mt.entries.length ? setMealOpen(m.id) : nav.openLogger(m.id))}
                onKeyDown={(ev) => { if (ev.key === 'Enter') (mt.entries.length ? setMealOpen(m.id) : nav.openLogger(m.id)); }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{m.label}</strong>
                  <span className="small muted" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names || 'Nothing yet'}</span>
                </span>
                {mt.kcal ? <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{mt.kcal} <span className="small muted">kcal</span></span> : null}
                <button type="button" className="icon-btn acc" aria-label={`Add to ${m.label}`} onClick={(ev) => { ev.stopPropagation(); nav.openLogger(m.id); }}><Icon name="plus" size={20} stroke={2.4} /></button>
              </div>
            );
          })}
        </section>

        <MealSheet date={d} meal={mealOpen} onClose={() => setMealOpen(null)} />

        <section className="grid2" aria-label="Water and steps">
          <WaterCard onOpen={() => setWaterOpen(true)} />
          <button type="button" className="card tight stack" style={{ gap: 10, textAlign: 'left', color: 'var(--text)' }} data-acc="today" onClick={() => { setStepsVal(steps ? String(steps) : ''); setStepsOpen(true); }}>
            <strong className="row" style={{ gap: 6 }}><Icon name="steps" size={18} /> Steps</strong>
            <p className="big" style={{ fontSize: 30 }}><Num value={steps} /></p>
            <p className="small muted">{steps ? `≈ ${stepsKcal(steps, kg)} kcal burned` : 'Log tonight at 11:30 pm'}</p>
          </button>
        </section>

        <section className="card" data-acc="workout" aria-label="Workout">
          <div className="between"><p className="eyebrow" style={{ color: 'var(--acc-t)' }}>{done ? 'Workout done' : gym ? 'Gym day' : 'Rest day'}</p>{plan ? <span className="pill">{plan.moves.length} moves</span> : null}</div>
          {plan ? (
            <>
              <p className="h2" style={{ marginTop: 6 }}>{plan.title}</p>
              <p className="muted" style={{ marginTop: 4 }}>{planBrief(plan, exById)}</p>
              <button type="button" className="btn block" style={{ marginTop: 14 }} onClick={() => (done ? nav.go('workout') : nav.startWorkout())}>
                {done ? 'See what you lifted' : <><Icon name="play" size={18} /> {gym ? 'Start workout' : 'Train anyway'}</>}
              </button>
            </>
          ) : <p className="muted" style={{ marginTop: 6 }}>Rishu is designing today’s plan — it shows up here once he publishes it.</p>}
        </section>

        {cyc ? (
          <button type="button" className="card" data-acc="cycle" style={{ textAlign: 'left', color: 'var(--text)' }} onClick={() => nav.go('cycle')}>
            <div className="between"><p className="eyebrow" style={{ color: 'var(--acc-t)' }}>Cycle · day {cyc.day}</p><span className="pill">{PHASE_COPY[cyc.phase].label}</span></div>
            <p style={{ marginTop: 8 }}>{PHASE_COPY[cyc.phase].tip}</p>
          </button>
        ) : null}
      </div>

      <WaterSheet open={waterOpen} onClose={() => setWaterOpen(false)} />
      <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} label="Log steps">
        <div className="stack" style={{ gap: 14 }} data-acc="today">
          <h2 className="h2">Steps today</h2>
          <p className="muted small">Your whole day, night walk included — copy the number from Samsung Health. Calories are worked out for you.</p>
          <input className="input" inputMode="numeric" autoFocus value={stepsVal} onChange={(e) => setStepsVal(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="e.g. 6500" style={{ fontSize: 26, fontFamily: 'var(--display)', fontWeight: 800 }} />
          <div className="chips" aria-label="Quick add">
            {[1000, 2000, 3000].map((n) => <button key={n} type="button" className="chip" onClick={() => setStepsVal(String(Number(stepsVal || 0) + n))}>+{n.toLocaleString('en-IN')} night walk</button>)}
          </div>
          <p className="small" style={{ fontWeight: 700 }}>{Number(stepsVal || 0) ? `≈ ${stepsKcal(Number(stepsVal), kg)} kcal burned · ${(Number(stepsVal) * 0.00072).toFixed(1)} km` : '\u00a0'}</p>
          <button type="button" className="btn lg block" onClick={() => {
            const n = Number(stepsVal || 0);
            update((x) => ({ ...x, steps: { ...x.steps, [d]: n } }));
            setStepsOpen(false);
            toast('Steps saved');
          }}>Save</button>
        </div>
      </Sheet>
    </div>
  );
}

function suggest(foods: Food[], kcalLeft: number, protLeft: number): { title: string; food: Food; why: string } | null {
  if (kcalLeft < 60 || protLeft < 8) return null;
  const fits = foods.filter((f) => f.kcal > 0 && f.kcal <= kcalLeft && f.protein >= 6);
  if (!fits.length) return null;
  const best = fits.sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)[0];
  return { title: 'Fits what’s left', food: best, why: `closes ${Math.min(100, Math.round((best.protein / protLeft) * 100))}% of your protein gap.` };
}
