import { useEffect, useMemo, useRef } from 'react';
import { exerciseHistory, isGymDay, lastWeight, planBrief, sessionsPerWeek, todayPlan, uid } from '../lib/calc';
import { latestWeight, sessionKcal } from '../lib/burn';
import { Congrats } from '../congrats';
import { gifSrc, ytLink } from '../lib/content';
import { dow, parseKey, shortLabel, today, DOW_FULL, DOW_SHORT } from '../lib/dates';
import { haptic } from '../lib/native';
import { useStore } from '../lib/store';
import { Plan, PlanMove, Session } from '../lib/types';
import { FullSheet, Gif, Icon, Seg, Sheet, Stepper, toast } from '../ui';
import { Doodle } from '../streak';
import { Num } from '../anim';
import { useDraft } from '../lib/drafts';

export default function WorkoutScreen({ autoStart, onAutoStartHandled }: { autoStart: boolean; onAutoStartHandled: () => void }) {
  const { data, content } = useStore();
  const plan = todayPlan(data, content);
  const [view, setView] = useDraft<'plan' | 'history'>('wk.view', 'plan');
  const [sessionOpen, setSessionOpen] = useDraft('wk.sessionOpen', false);

  useEffect(() => {
    if (autoStart) {
      setView('plan');
      if (plan) setSessionOpen(true);
      onAutoStartHandled();
    }
  }, [autoStart, onAutoStartHandled, plan]);

  return (
    <div className="screen" data-acc="workout">
      <div className="glow" />
      <div className="stack" style={{ gap: 16 }}>
        <header className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">Workout</p>
          <h1 className="h1">{view === 'plan' ? 'Today' : 'Your progress'}</h1>
        </header>
        <Seg<'plan' | 'history'> label="View" value={view} onChange={setView} options={[{ v: 'plan', l: 'Gym' }, { v: 'history', l: 'History' }]} />
        {view === 'plan' ? <TodayTile plan={plan} onStart={() => setSessionOpen(true)} /> : <History />}
      </div>
      {plan ? <SessionView open={sessionOpen} plan={plan} onClose={() => setSessionOpen(false)} /> : null}
    </div>
  );
}

/** The one tile she sees: what today is, not the whole exercise list. */
function TodayTile({ plan, onStart }: { plan: Plan | null; onStart: () => void }) {
  const { data, exById } = useStore();
  const d = today();
  const gym = isGymDay(data, d) || data.profile.gymDays.length === 0;
  const active = data.sessions.find((s) => !s.endedAt && s.date === d);
  // Done = THIS plan was finished today (another session earlier today doesn't count).
  const done = !!plan && data.sessions.some((s) => s.endedAt && s.date === d && s.sets.length && s.planId === plan.id);
  const dayLabel = `${DOW_FULL[dow(d)]}`;

  if (!plan) {
    return (
      <section className="card hero today-plan" aria-label="Today's workout plan">
        <div className="between"><p className="eyebrow acc-t">Today · {dayLabel}</p><span className="pill neutral">Coming soon</span></div>
        <div className="row" style={{ alignItems: 'center', gap: 6, marginTop: 6 }}>
          <div className="stack" style={{ flex: 1, gap: 6 }}>
            <h2 className="h2">Rishu is designing today’s plan</h2>
            <p className="muted">It shows up right here as soon as he publishes it.{gym ? '' : ' Today is a rest day anyway.'}</p>
          </div>
          <Doodle name="laptop" size={110} style={{ flex: 'none', marginRight: -8 }} />
        </div>
      </section>
    );
  }

  const moves = plan.moves.filter((m) => exById[m.exId]);
  const stretches = moves.filter((m) => exById[m.exId]?.group === 'stretching').length;
  const lifts = moves.length - stretches;
  const mins = Math.max(10, Math.round((stretches * 1.5 + moves.filter((m) => exById[m.exId]?.group !== 'stretching').reduce((a, m) => a + m.sets * 2.5, 0)) / 5) * 5);
  const doneCount = active?.completed?.length ?? 0;

  return (
    <section className="card hero today-plan" aria-label="Today's workout plan">
      <div className="between">
        <p className="eyebrow acc-t">{done ? 'Done today' : gym ? `Today · ${dayLabel}` : `Rest day · bonus session`}</p>
        <span className="pill">by Rishu</span>
      </div>
      <h2 className="h1" style={{ fontSize: 30, marginTop: 6 }}>{plan.title}</h2>
      <p style={{ fontSize: 17, marginTop: 6 }}><span className="muted">You’re hitting:</span> <strong>{planBrief(plan, exById)}</strong></p>
      <div className="chips" style={{ marginTop: 12 }} aria-label="Plan size">
        {lifts ? <span className="chip static">{lifts} exercise{lifts === 1 ? '' : 's'}</span> : null}
        {stretches ? <span className="chip static">{stretches} stretch{stretches === 1 ? '' : 'es'}</span> : null}
        <span className="chip static">~{mins} min</span>
      </div>
      {plan.note ? <p className="small muted row" style={{ marginTop: 12, alignItems: 'flex-start' }}><Icon name="glass" size={18} /> {plan.note}</p> : null}
      {done && !active ? (
        <p className="ok-t" style={{ fontWeight: 700, marginTop: 14 }}><Icon name="check" size={16} stroke={3} /> Workout logged. Rest up.</p>
      ) : (
        <button type="button" className="btn lg block" style={{ marginTop: 16 }} onClick={onStart}>
          <Icon name="play" size={18} /> {active ? `Resume · ${doneCount}/${moves.length} done` : 'Start session'}
        </button>
      )}
      <p className="small muted" style={{ marginTop: 10, textAlign: 'center' }}>Moves show one by one once you start.</p>
    </section>
  );
}

/* ---------------- Live session ---------------- */

function SessionView({ open, plan, onClose }: { open: boolean; plan: Plan; onClose: () => void }) {
  const { data, update, exById } = useStore();
  const d = today();
  const session = data.sessions.find((s) => !s.endedAt && s.date === d && s.planId === plan.id);
  const [idx, setIdx] = useDraft('wk.idx', 0);
  const [kg, setKg] = useDraft('wk.kg', 0);
  const [reps, setReps] = useDraft('wk.reps', 10);
  // Was this session screen restored after Android killed the app? Then keep her place, don't reset.
  const restored = useRef(open);
  const restoredPrefill = useRef(open);
  const [summary, setSummary] = useDraft<Session | null>('wk.summary', null);
  const moves = plan.moves.filter((m) => exById[m.exId]);
  const move = moves[Math.min(idx, moves.length - 1)];
  const ex = move ? exById[move.exId] : undefined;
  const isStretch = ex?.group === 'stretching';
  const sets = session ? session.sets.filter((x) => x.exId === move?.exId) : [];
  const doneMove = (m: PlanMove) => !!session?.completed?.includes(m.exId);
  const [logOpen, setLogOpen] = useDraft('wk.logOpen', false);
  const [listOpen, setListOpen] = useDraft('wk.listOpen', false);
  const yt = ex ? ytLink(ex, move) : null;

  // Create (or resume) the session when opened.
  useEffect(() => {
    if (!open) return;
    if (restored.current) {
      restored.current = false;
      if (summary || session) return; // back on the same move / the same congrats screen
    }
    setSummary(null);
    if (!session) {
      const s: Session = { id: uid(), date: d, planId: plan.id, title: plan.title, startedAt: Date.now(), sets: [], completed: [], kind: 'gym' };
      update((x) => ({ ...x, sessions: [...x.sessions, s] }));
      setIdx(0);
    } else {
      const firstOpen = moves.findIndex((m) => !doneMove(m));
      setIdx(firstOpen < 0 ? 0 : firstOpen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Prefill weight/reps from last time (or the plan) whenever the move changes.
  useEffect(() => {
    if (!move) return;
    if (restoredPrefill.current) { restoredPrefill.current = false; return; }
    const last = lastWeight(data, move.exId, session?.id);
    const mine = sets[sets.length - 1];
    setKg(mine ? mine.kg : last ? last.kg : move.kg || 0);
    setReps(mine ? mine.reps : move.reps);
    setLogOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.exId, open]);

  if (!open) return null;

  const patch = (fn: (s: Session) => Session) => update((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === session!.id ? fn(s) : s)) }));

  /** optional: record one set with weight × reps */
  function logSet() {
    if (!session || !move) return;
    const set = { exId: move.exId, set: sets.length + 1, kg: isStretch ? 0 : kg, reps, at: Date.now() };
    patch((s) => ({ ...s, sets: [...s.sets, set] }));
    haptic.tap();
    toast(`Set ${set.set} logged`);
  }
  /** she says she did it. Stretches move on by themselves; lifts wait for her. */
  function complete() {
    if (!session || !move) return;
    const extra = sets.length ? [] : [{ exId: move.exId, set: 1, kg: isStretch ? 0 : kg, reps: move.reps, at: Date.now() }];
    patch((s) => ({ ...s, sets: [...s.sets, ...extra], completed: [...new Set([...(s.completed || []), move.exId])] }));
    haptic.success();
    if (isStretch && idx < moves.length - 1) setTimeout(() => setIdx(idx + 1), 450);
  }
  function uncomplete() {
    if (!session || !move) return;
    patch((s) => ({ ...s, completed: (s.completed || []).filter((x) => x !== move.exId) }));
  }
  function finish() {
    if (!session) return;
    const ended: Session = { ...session, endedAt: Date.now(), kind: 'gym' };
    ended.kcal = sessionKcal({ ...ended, kcal: undefined }, latestWeight(data));
    if (!session.sets.length) {
      update((x) => ({ ...x, sessions: x.sessions.filter((s) => s.id !== session.id) }));
      onClose();
      return;
    }
    update((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === session.id ? ended : s)) }));
    haptic.success();
    setSummary(ended);
  }

  const allDone = moves.every(doneMove);
  const isDone = move ? doneMove(move) : false;

  return (
    <FullSheet open={open} onClose={onClose} label="Workout session" acc="workout">
      {summary ? (
        <SessionSummary s={summary} onClose={() => { setSummary(null); onClose(); }} />
      ) : move && ex ? (
        <>
          <div className="row" style={{ padding: 'calc(var(--st) + 12px) 18px 6px' }}>
            <button type="button" className="icon-btn" aria-label="Minimise session" onClick={onClose}><Icon name="back" /></button>
            <div style={{ flex: 1 }} className="stack">
              <span className="small muted" style={{ fontWeight: 700 }}>{idx + 1} of {moves.length}</span>
              <div role="img" aria-label={`Move ${idx + 1} of ${moves.length}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${moves.length}, minmax(0,1fr))`, gap: 4, marginTop: 6 }}>
                {moves.map((m, i) => (
                  <span key={m.exId} style={{ height: 5, borderRadius: 99, background: doneMove(m) ? 'var(--acc)' : i === idx ? 'color-mix(in srgb, var(--acc) 45%, transparent)' : 'var(--card-2)' }} />
                ))}
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label="All moves" onClick={() => setListOpen(true)}><Icon name="list" /></button>
            <button type="button" className="btn sm ghost" onClick={finish}>Finish</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 12px' }} className="stack">
            <Gif src={gifSrc(ex)} alt={`${ex.name} demonstration`} style={{ width: '100%', height: '46vh', minHeight: 240, objectFit: 'contain', background: '#fff', borderRadius: 24 }} />
            <h1 className="h1" style={{ fontSize: 30, textAlign: 'center', marginTop: 6 }}>{ex.name}</h1>
            <p className="muted" style={{ textAlign: 'center', fontWeight: 600 }}>{move.sets} × {move.reps} {move.unit === 'min' ? 'min' : move.unit === 'sec' ? 'sec' : 'reps'}</p>
            {yt ? (
              <a className="btn ghost yt-btn" href={yt} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'center' }}>
                <Icon name="video" size={20} /> Watch how on YouTube
              </a>
            ) : null}
            {sets.length ? (
              <div className="chips" style={{ justifyContent: 'center' }} aria-label="Logged sets">
                {sets.map((s) => <span key={s.at} className="chip" aria-pressed="true">{isStretch || !s.kg ? `${s.reps}` : `${s.kg} kg × ${s.reps}`}</span>)}
              </div>
            ) : null}
          </div>

          <div style={{ padding: '14px 18px calc(var(--sb) + 18px)', borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }} className="stack">
            {!isStretch && logOpen && !isDone ? (
              <div className="stack" style={{ gap: 8 }}>
                <div className="grid2">
                  <div className="field">Weight<Stepper label="weight" value={kg} step={2.5} decimals={1} min={0} max={300} unit="kg" onChange={setKg} /></div>
                  <div className="field">Reps<Stepper label="reps" value={reps} min={1} max={200} onChange={setReps} /></div>
                </div>
                <button type="button" className="btn ghost block" onClick={logSet}><Icon name="plus" size={18} /> Add set {sets.length + 1}</button>
              </div>
            ) : null}
            {isDone ? (
              <>
                <p className="ok-t" style={{ fontWeight: 700, textAlign: 'center' }}><Icon name="check" size={16} stroke={3} /> Logged as done</p>
                {idx < moves.length - 1 ? (
                  <button type="button" className="btn lg block" onClick={() => setIdx(idx + 1)}>Next: {exById[moves[idx + 1].exId]?.name} <Icon name="next" size={18} /></button>
                ) : (
                  <button type="button" className="btn lg block" onClick={finish}>{allDone ? 'Finish workout' : 'Finish anyway'}</button>
                )}
              </>
            ) : (
              <button type="button" className="btn lg block" onClick={complete}><Icon name="check" size={20} stroke={2.6} /> {isStretch ? 'Done' : 'I did this'}</button>
            )}
            <div className="between">
              <button type="button" className="btn quiet" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
              {isDone ? <button type="button" className="btn quiet" onClick={uncomplete}>Undo</button> : !isStretch ? <button type="button" className="btn quiet" onClick={() => setLogOpen((v) => !v)}>{logOpen ? 'Hide weights' : 'Log weight'}</button> : null}
              <button type="button" className="btn quiet" disabled={idx >= moves.length - 1} onClick={() => setIdx(idx + 1)}>Skip</button>
            </div>
          </div>
        </>
      ) : null}
      <Sheet open={listOpen} onClose={() => setListOpen(false)} label="Today's moves">
        <div className="stack" style={{ gap: 8 }} data-acc="workout">
          <h2 className="h2">Today’s moves</h2>
          {moves.map((m, i) => {
            const e = exById[m.exId];
            const dn = doneMove(m);
            return (
              <button key={m.exId} type="button" className="list-row" style={{ padding: 10 }} aria-current={i === idx ? 'step' : undefined} onClick={() => { setIdx(i); setListOpen(false); }}>
                <span className={`move-num${dn ? ' done' : i === idx ? ' now' : ''}`}>{dn ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }} className="stack">
                  <strong style={{ fontSize: 16 }}>{e?.name}</strong>
                  <span className="small muted">{m.sets} × {m.reps} {m.unit === 'min' ? 'min' : m.unit === 'sec' ? 'sec' : 'reps'}{e?.group === 'stretching' ? ' · stretch' : ''}</span>
                </span>
                {i === idx ? <span className="pill">Now</span> : null}
              </button>
            );
          })}
        </div>
      </Sheet>
    </FullSheet>
  );
}

function SessionSummary({ s, onClose }: { s: Session; onClose: () => void }) {
  const { data, exById } = useStore();
  const minutes = s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000)) : 0;
  const prs = useMemo(() => {
    const ids = [...new Set(s.sets.map((x) => x.exId))];
    return ids
      .map((id) => {
        const best = Math.max(...s.sets.filter((x) => x.exId === id).map((x) => x.kg));
        const prev = lastWeight(data, id, s.id);
        return best > 0 && (!prev || best > prev.kg) ? { name: exById[id]?.name || id, kg: best, prev: prev?.kg } : null;
      })
      .filter(Boolean) as { name: string; kg: number; prev?: number }[];
  }, [s, data, exById]);
  return (
    <Congrats
      title={`Strong work, ${data.profile.name}!`}
      sub={s.title}
      stats={[
        { label: 'Minutes', value: minutes },
        { label: 'Sets', value: s.sets.length },
        { label: 'Kcal', value: s.kcal ?? 0 },
      ]}
      doodle={prs.length ? 'celebrate' : 'flex'}
      extra={prs.length ? (
        <div className="card hero stack" style={{ gap: 8 }}>
          <p className="eyebrow acc-t">New personal bests</p>
          {prs.map((p) => <p key={p.name}><strong>{p.name}</strong> — {p.kg} kg{p.prev ? <span className="muted"> (was {p.prev} kg)</span> : null}</p>)}
        </div>
      ) : null}
      onDone={onClose}
    />
  );
}

/* ---------------- History ---------------- */

function History() {
  const { data, exById } = useStore();
  const perWeek = sessionsPerWeek(data, 4);
  const max = Math.max(3, ...perWeek);
  const exIds = [...new Set(data.sessions.filter((s) => s.kind !== 'home').flatMap((s) => s.sets.map((x) => x.exId)))].filter((id) => exById[id] && exById[id].group !== 'stretching');
  const recent = [...data.sessions].filter((s) => s.sets.length).sort((a, b) => b.startedAt - a.startedAt).slice(0, 12);
  const [tab, setTab] = useDraft<'ex' | 'sessions'>('wk.histTab', 'ex');

  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card between" aria-label="Sessions per week">
        <div>
          <p className="eyebrow">Sessions per week</p>
          <p className="big" style={{ fontSize: 34 }}><Num value={perWeek[3]} /><span className="small muted" style={{ fontFamily: 'var(--body)', fontWeight: 500 }}> this week</span></p>
          <p className="small muted">{perWeek.reduce((a, b) => a + b, 0)} in the last 4 weeks</p>
        </div>
        <div className="chart" role="img" aria-label={`Sessions per week: ${perWeek.join(', ')}`} style={{ height: 70, width: 120, borderBottom: 'none', gap: 8 }}>
          {perWeek.map((n, i) => <i key={i} className={i === 3 ? '' : 'dim'} style={{ height: `${Math.max(6, (n / max) * 70)}px` }} />)}
        </div>
      </section>
      <Seg<'ex' | 'sessions'> label="History view" value={tab} onChange={setTab} options={[{ v: 'ex', l: 'By exercise' }, { v: 'sessions', l: 'Sessions' }]} />
      {tab === 'ex' ? (
        exIds.length ? exIds.map((id) => {
          const h = exerciseHistory(data, id).slice(-6);
          const best = Math.max(...h.map((x) => x.best));
          const first = h[0]?.best ?? 0;
          const ex = exById[id];
          return (
            <div key={id} className="list-row" style={{ padding: 10 }}>
              <Gif className="thumb" src={gifSrc(ex)} alt="" />
              <span style={{ flex: 1, minWidth: 0 }} className="stack">
                <strong>{ex?.name}</strong>
                <span className="small muted">Best {best} kg · {h.length} session{h.length === 1 ? '' : 's'}</span>
                {best > first ? <span className="small ok-t" style={{ fontWeight: 700 }}>+{Number((best - first).toFixed(1))} kg since {shortLabel(h[0].date)}</span> : null}
              </span>
              <div className="chart" role="img" aria-label={`Recent best weights: ${h.map((x) => x.best).join(', ')} kg`} style={{ height: 44, width: 70, gap: 3, borderBottom: 'none' }}>
                {h.map((x, i) => <i key={i} className={i === h.length - 1 ? '' : 'dim'} style={{ height: `${Math.max(5, (x.best / (best || 1)) * 44)}px`, borderRadius: 3 }} />)}
              </div>
            </div>
          );
        }) : <div className="empty">Log your first set and your progress shows up here.</div>
      ) : recent.length ? recent.map((s) => {
        const dd = parseKey(s.date);
        return (
          <div key={s.id} className="list-row">
            <div style={{ width: 48, textAlign: 'center', flex: 'none' }}>
              <div className="small muted" style={{ fontWeight: 700 }}>{DOW_SHORT[dd.getDay()]}</div>
              <div className="big" style={{ fontSize: 24 }}>{dd.getDate()}</div>
            </div>
            <span style={{ flex: 1 }}><strong>{s.title}</strong><span className="small muted" style={{ display: 'block' }}>{s.kind === 'home' ? `${s.sets.length} moves` : `${new Set(s.sets.map((x) => x.exId)).size} moves · ${s.sets.length} sets`}{s.endedAt ? ` · ${Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000))} min` : ' · in progress'}{s.endedAt ? ` · ${sessionKcal(s, latestWeight(data))} kcal` : ''}</span></span>
          </div>
        );
      }) : <div className="empty"><Doodle name="sleep" size={120} style={{ margin: '0 auto 8px' }} />No sessions yet — your first one shows up here.</div>}
    </div>
  );
}
