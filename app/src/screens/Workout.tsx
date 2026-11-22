import { useEffect, useMemo, useRef, useState } from 'react';
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
import { YtPlayer } from '../video';
import { bestOf, coach, isBest, restFor, type Tip } from '../lib/coach';
import { sendAlert } from '../lib/alerts';
import { cancelRestAlarm, scheduleRestAlarm } from '../lib/rest';
import { CycleGymLine } from '../cycleui';

/** Warm-up (0) · Exercises (1) · Cool-down (2): what part of the workout each move belongs to. */
const SEC_NAME = ['Warm-up', 'Exercises', 'Cool-down'] as const;
function sectionsOf(moves: PlanMove[], exById: Record<string, { group: string; part: string } | undefined>): (0 | 1 | 2)[] {
  const main = (m: PlanMove) => { const e = exById[m.exId]; return !!e && e.group !== 'stretching' && e.part !== 'cardio' && m.unit !== 'min'; };
  const first = moves.findIndex(main);
  let last = -1; moves.forEach((m, i) => { if (main(m)) last = i; });
  return moves.map((m, i) => {
    if (m.cool) return 2;
    if (first < 0) return exById[m.exId]?.group === 'stretching' ? 0 : 1;
    if (i < first) return 0;
    if (i > last && exById[m.exId]?.group === 'stretching') return 2;
    return 1;
  });
}
const moveMins = (m: PlanMove, stretch: boolean) => (m.unit === 'min' ? m.reps : m.unit === 'sec' ? Math.max(1, (m.reps * m.sets) / 60 + 0.5) : stretch ? 1.5 : m.sets * 2.5);

/** 3 × 12 reps · or just “15 min” / “30 sec” for timed moves */
const doseLabel = (m: PlanMove) => (m.unit === 'min' ? `${m.reps} min` : m.unit === 'sec' ? `${m.reps} sec` : `${m.sets} × ${m.reps} reps`);
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
  const { data, content, exById } = useStore();
  const d = today();
  const gym = isGymDay(data, d, content) || data.profile.gymDays.length === 0;
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
  const mins = Math.max(10, Math.round(moves.reduce((a, m) => a + moveMins(m, exById[m.exId]?.group === 'stretching'), 0) / 5) * 5);
  const doneCount = active?.completed?.length ?? 0;
  const secs = sectionsOf(moves, exById);
  const parts = ([0, 1, 2] as const).map((k) => {
    const ms = moves.filter((_, i) => secs[i] === k);
    const st = (m: PlanMove) => exById[m.exId]?.group === 'stretching';
    const m5 = Math.max(1, Math.round(ms.reduce((a, m) => a + moveMins(m, st(m)), 0)));
    const sub = k === 1
      ? `${ms.length} move${ms.length === 1 ? '' : 's'} · ${ms.filter((m) => m.unit !== 'min' && m.unit !== 'sec').reduce((a, m) => a + m.sets, 0)} sets`
      : `${ms.length} ${k === 2 ? 'stretch' : 'move'}${ms.length === 1 ? '' : k === 2 ? 'es' : 's'}`;
    return { name: SEC_NAME[k], sub, mins: m5, n: ms.length };
  }).filter((p) => p.n);

  return (
    <section className="card hero today-plan neon-ring" aria-label="Today's workout plan">
      <div className="between">
        <p className="eyebrow acc-t">{done ? 'Done today' : gym ? `Today · ${dayLabel}` : `Rest day · bonus session`}</p>
        <span className="pill">by Rishu</span>
      </div>
      <h2 className="h1" style={{ fontSize: 30, marginTop: 6 }}>{plan.title}</h2>
      <p style={{ fontSize: 17, marginTop: 6 }}><span className="muted">You’re hitting:</span> <strong>{planBrief(plan, exById)}</strong></p>
      <ol className="plan-parts" aria-label={`About ${mins} minutes`}>
        {parts.map((p, i) => (
          <li key={p.name} style={{ animationDelay: `${0.08 * i + 0.1}s` }}>
            <span className="pp-n">{i + 1}</span>
            <span className="pp-t"><strong>{p.name}</strong><span className="small muted">{p.sub}</span></span>
            <span className="small muted">{p.mins} min</span>
          </li>
        ))}
      </ol>
      {plan.note ? <PlanNote text={plan.note} /> : null}
      {!done ? <CycleGymLine /> : null}
      {done && !active ? (
        <p className="ok-t" style={{ fontWeight: 700, marginTop: 14 }}><Icon name="check" size={16} stroke={3} /> Workout logged. Rest up.</p>
      ) : (
        <button type="button" className="btn lg block neon" style={{ marginTop: 16 }} onClick={onStart}>
          <Icon name="play" size={18} /> {active && doneCount ? `Continue · ${doneCount} of ${moves.length} done` : 'Start workout'}
        </button>
      )}
    </section>
  );
}

/** Rishu's tips for the plan: one line, tap to read the rest — not a wall of text. */
function PlanNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 90;
  return (
    <button type="button" className="plan-note" aria-expanded={open} onClick={() => setOpen(!open)} disabled={!long}>
      <Icon name="glass" size={18} />
      <span className={open || !long ? '' : 'clamp1'}>{text}</span>
      {long ? <span className="plan-note-more">{open ? 'Less' : 'Tips'}</span> : null}
    </button>
  );
}

/* ---------------- Live session ---------------- */

function SessionView({ open, plan, onClose }: { open: boolean; plan: Plan; onClose: () => void }) {
  const { data, update, exById } = useStore();
  const d = today();
  const session = data.sessions.find((s) => !s.endedAt && s.date === d && s.planId === plan.id);
  const [restEnd, setRestEnd] = useDraft('wk.restEnd', 0);
  const [restLen, setRestLen] = useDraft('wk.restLen', 75);
  const [party, setParty] = useState(0); // new best → a little confetti
  const [idx, setIdx] = useDraft('wk.idx', 0);
  const [kg, setKg] = useDraft('wk.kg', 0);
  const [reps, setReps] = useDraft('wk.reps', 10);
  // Was this session screen restored after Android killed the app? Then keep her place, don't reset.
  const restored = useRef(open);
  const restoredPrefill = useRef(open);
  const [summary, setSummary] = useDraft<Session | null>('wk.summary', null);
  const moves = plan.moves.filter((m) => exById[m.exId]);
  const move = moves[Math.min(idx, moves.length - 1)];
  // Backup for a busy machine: both show; whichever she picks is what she logs.
  const altEx = move?.alt ? exById[move.alt.exId] : undefined;
  const doingAlt = !!(move && altEx && session?.swaps?.[move.exId] === move.alt!.exId);
  const curId = move ? (doingAlt ? move.alt!.exId : move.exId) : undefined;
  const ex = curId ? exById[curId] : undefined;
  const isStretch = ex?.group === 'stretching';
  const isLift = !!move && !isStretch && move.unit !== 'min' && move.unit !== 'sec';
  const sets = session ? session.sets.filter((x) => x.exId === curId) : [];
  // The coach: what to lift today, from her own history (+ Rishu's weekly plan). A backup move has no plan weight.
  const tip: Tip | null = move && ex ? coach(data, ex, doingAlt ? { ...move, kg: undefined } : move, doingAlt ? undefined : plan, { excludeSessionId: session?.id }) : null;
  const planned = tip?.sets ?? move?.sets ?? 1;
  const [showVid, setShowVid] = useState(false); // backup mode: the player opens on "Watch how"
  const [vidOn, setVidOn] = useState(false); // a video is playing → offer the YouTube/Instagram app as a fallback
  useEffect(() => { setShowVid(false); setVidOn(false); }, [curId]);
  const doneMove = (m: PlanMove) => !!session?.completed?.includes(m.exId);
  const [, setLogOpen] = useDraft('wk.logOpen', false);
  const [listOpen, setListOpen] = useDraft('wk.listOpen', false);
  const [review, setReview] = useDraft('wk.review', false); // "Almost there": skipped moves before finishing
  const [, setTick] = useState(0);
  useEffect(() => { if (!open) return; const t = window.setInterval(() => setTick((n) => n + 1), 30000); return () => window.clearInterval(t); }, [open]);
  const yt = ex ? ytLink(ex, doingAlt ? move?.alt : move) : null;
  // Open on the animation (clean, same style for every move); the video is one tap away.
  const [media, setMedia] = useState<'video' | 'gif'>('gif');
  useEffect(() => setMedia(ex && gifSrc(ex) ? 'gif' : 'video'), [curId]);

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
    const last = lastWeight(data, curId || move.exId, session?.id);
    const mine = sets[sets.length - 1];
    setKg(mine ? mine.kg : tip ? tip.kg : last ? last.kg : move.kg || 0);
    setReps(mine ? mine.reps : tip ? tip.reps : move.reps);
    setLogOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId, open]);

  if (!open) return null;
  const secs = sectionsOf(moves, exById);
  const sec = secs[Math.min(idx, moves.length - 1)] ?? 1;
  const secMoves = moves.map((m, i) => ({ m, i })).filter((x) => secs[x.i] === sec);
  const secPos = secMoves.findIndex((x) => x.i === idx) + 1;
  const secBars = ([0, 1, 2] as const).map((k) => {
    const ms = moves.filter((_, i) => secs[i] === k);
    return { k, n: ms.length, done: ms.filter((m) => !!session?.completed?.includes(m.exId)).length };
  }).filter((b) => b.n);
  const elapsed = session ? Math.max(0, Math.round((Date.now() - session.startedAt) / 60000)) : 0;
  const skipped = moves.map((m, i) => ({ m, i })).filter((x) => !session?.completed?.includes(x.m.exId));
  /** End / Finish: skipped moves get one last chance first */
  function askEnd() {
    if (session && session.sets.length && skipped.length) { stopRest(); setReview(true); } else finish();
  }

  const patch = (fn: (s: Session) => Session) => update((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === session!.id ? fn(s) : s)) }));

  /** plan move or its backup (the machine was busy) */
  function choose(alt: boolean) {
    if (!session || !move || !move.alt) return;
    haptic.tap();
    patch((s) => { const sw = { ...(s.swaps || {}) }; if (alt) sw[move.exId] = move.alt!.exId; else delete sw[move.exId]; return { ...s, swaps: sw }; });
  }
  /** one tap per set: logs it, cheers a new best, starts the rest timer; the last planned set completes the move */
  function logSet() {
    if (!session || !move || !curId) return;
    const set = { exId: curId, set: sets.length + 1, kg: isStretch ? 0 : kg, reps, at: Date.now() };
    const best = isBest(set, bestOf(data, curId));
    const last = set.set >= planned;
    patch((s) => ({ ...s, sets: [...s.sets, set], ...(last ? { completed: [...new Set([...(s.completed || []), move.exId])] } : {}) }));
    if (best) {
      haptic.success(); setParty(Date.now());
      toast(best === 'kg' ? `New best — ${set.kg} kg! 🎉` : `New best — ${set.reps} reps at ${set.kg} kg! 🎉`);
      sendAlert(data, 'pr', 'New best 🎉', `${data.profile.name || 'Sapna'} just did ${set.kg} kg × ${set.reps} on ${ex?.name || 'a lift'}.`, ['tada']);
    } else { haptic.tap(); toast(last ? `All ${planned} sets done 💪` : `Set ${set.set} done`); }
    startRest(restFor(move), last && idx < moves.length - 1 ? `Next up: ${exById[moves[idx + 1].exId]?.name || 'next move'}` : `Set ${set.set + 1} of ${ex?.name || 'this move'}`);
    setLogOpen(false);
  }
  function startRest(sec: number, next: string) {
    const end = Date.now() + sec * 1000;
    setRestLen(sec); setRestEnd(end);
    scheduleRestAlarm(end, next);
  }
  function stopRest() { setRestEnd(0); cancelRestAlarm(); }
  /** she says she did it. Stretches move on by themselves; lifts wait for her. */
  function complete() {
    if (!session || !move) return;
    const extra = sets.length ? [] : [{ exId: curId || move.exId, set: 1, kg: isStretch ? 0 : kg, reps: move.reps, at: Date.now(), auto: true }];
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
    // New bests this session (vs everything before it) — for her summary and Rishu's ping.
    const prs = [...new Set(ended.sets.map((x) => x.exId))].flatMap((id) => {
      const before = bestOf(data, id, ended.id);
      const top = ended.sets.filter((x) => x.exId === id).reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
      return isBest(top, before) ? [{ exId: id, kg: top.kg, reps: top.reps }] : [];
    });
    if (prs.length) ended.prs = prs;
    update((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === session.id ? ended : s)) }));
    haptic.success();
    stopRest();
    setSummary(ended);
    const mins = Math.max(1, Math.round((ended.endedAt! - ended.startedAt) / 60000));
    const did = (ended.completed || []).length;
    sendAlert(data, 'workout', `${data.profile.name || 'Sapna'} finished ${ended.title} 💪`,
      `${mins} min · ${did} of ${moves.length} moves${prs.length ? ` · ${prs.length} new best${prs.length > 1 ? 's' : ''}: ${prs.map((p) => `${exById[p.exId]?.name || 'lift'} ${p.kg} kg`).join(', ')}` : ''}`, ['muscle']);
  }

  const isDone = move ? doneMove(move) : false;
  const isHold = !!move && isStretch && move.unit === 'sec';

  return (
    <FullSheet open={open} onClose={onClose} label="Workout session" acc="workout">
      {party ? <Confetti key={party} /> : null}
      {summary ? (
        <SessionSummary s={summary} onClose={() => { setSummary(null); onClose(); }} />
      ) : review && session ? (
        <div className="review mv-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="stack" style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--st) + 18px) 18px 16px', gap: 16 }}>
          <button type="button" className="icon-btn" aria-label="Back to the workout" onClick={() => setReview(false)}><Icon name="back" /></button>
          <div className="stack" style={{ gap: 6 }}>
            <p className="eyebrow acc-t">{plan.title}</p>
            <h1 className="h1" style={{ fontSize: 34 }}>Almost there</h1>
            <p className="muted" style={{ fontSize: 16 }}>You skipped {skipped.length} move{skipped.length === 1 ? '' : 's'}. Do {skipped.length === 1 ? 'it' : 'them'} now, or finish without {skipped.length === 1 ? 'it' : 'them'}.</p>
          </div>
          <div className="card grid3 review-stats">
            <div><b className="big">{elapsed}</b><span className="small muted">minutes</span></div>
            <div><b className="big">{moves.length - skipped.length}<small className="muted">/{moves.length}</small></b><span className="small muted">moves</span></div>
            <div><b className="big">{session.sets.length}</b><span className="small muted">sets</span></div>
          </div>
          <ul className="skip-list" aria-label="Skipped moves">
            {skipped.map(({ m, i }, n) => {
              const e = exById[m.exId];
              return (
                <li key={m.exId} style={{ animationDelay: `${0.06 * n}s` }}>
                  <Gif className="thumb" src={gifSrc(e)} alt="" />
                  <span className="stack" style={{ flex: 1, gap: 2, minWidth: 0 }}><strong>{e?.name}</strong><span className="small muted">{SEC_NAME[secs[i]]} · {doseLabel(m)}</span></span>
                  <button type="button" className="btn sm ghost" onClick={() => { setReview(false); setIdx(i); }}>Do now</button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="stack review-actions">
          <button type="button" className="btn lg block neon" onClick={() => { setReview(false); setIdx(skipped[0].i); }}>Do the {skipped.length === 1 ? 'skipped move' : `${skipped.length} skipped moves`}</button>
          <button type="button" className="btn lg block ghost" onClick={() => { setReview(false); finish(); }}>Finish workout</button>
        </div>
        </div>
      ) : move && ex ? (
        <>
          <div className="row" style={{ padding: 'calc(var(--st) + 12px) 18px 6px' }}>
            <button type="button" className="icon-btn" aria-label="Minimise session" onClick={onClose}><Icon name="back" /></button>
            <div style={{ flex: 1, gap: 1, minWidth: 0 }} className="stack">
              <strong style={{ fontSize: 16 }}>{SEC_NAME[sec]} · {secPos} of {secMoves.length}</strong>
              <span className="small muted">{elapsed ? `${elapsed} min in` : 'Just started'}</span>
            </div>
            <button type="button" className="btn sm ghost" onClick={askEnd}>End</button>
          </div>
          <div style={{ padding: '4px 18px 6px' }}>
            <div className="wk-prog" role="img" aria-label={secBars.map((b) => `${SEC_NAME[b.k]} ${b.done} of ${b.n}`).join(', ')} style={{ gridTemplateColumns: secBars.map((b) => `${b.n}fr`).join(' ') }}>
              {secBars.map((b) => <span key={b.k} className={b.k === sec ? 'now' : ''}><i style={{ width: `${(b.done / b.n) * 100}%` }} /></span>)}
            </div>
            <div className="wk-prog-l" aria-hidden="true" style={{ gridTemplateColumns: secBars.map((b) => `${b.n}fr`).join(' ') }}>
              {secBars.map((b) => <span key={b.k} className={b.k === sec ? 'now' : ''}>{SEC_NAME[b.k]}</span>)}
            </div>
          </div>

          <div key={curId} style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 12px' }} className="stack mv-in">
            {altEx && exById[move.exId] ? (
              <>
                <div className="pick2" role="group" aria-label="Pick one">
                  {([[false, exById[move.exId]], [true, altEx]] as const).map(([isAlt, e]) => {
                    const on = isAlt === doingAlt;
                    return (
                      <button key={String(isAlt)} type="button" className={`pick${on ? ' on' : ''}`} aria-pressed={on} onClick={() => choose(isAlt)}>
                        <span className="pick-tag">{isAlt ? 'If busy' : 'Plan'}</span>
                        <Gif src={gifSrc(e)} alt={`${e.name} demonstration`} style={{ width: '100%', height: '25vh', minHeight: 140, objectFit: 'contain', background: '#fff', borderRadius: 14 }} />
                        <strong>{e.name}</strong>
                        <span className={on ? 'pick-on' : 'small muted'}>{on ? '✓ Doing this' : 'Tap to do this'}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="small muted" style={{ textAlign: 'center' }}>Machine busy? Tap the other one — same {move.unit === 'min' || move.unit === 'sec' ? 'time' : 'sets and reps'}.</p>
                {yt ? (showVid ? <YtPlayer url={yt} title={ex.name} autoPlay onPlay={() => setVidOn(true)} style={{ width: '100%', height: '40vh', minHeight: 220, flex: 'none' }} />
                  : <button type="button" className="btn ghost sm yt-btn" style={{ alignSelf: 'center' }} onClick={() => setShowVid(true)}><Icon name="video" size={20} /> Watch how — {ex.name}</button>) : null}
              </>
            ) : yt && media === 'video' ? (
              <YtPlayer url={yt} title={ex.name} onPlay={() => setVidOn(true)} style={{ width: '100%', height: isHold && !isDone ? '26vh' : isLift && !isDone ? '30vh' : '38vh', minHeight: 180, flex: 'none' }} />
            ) : (
              <Gif className="media-card" src={gifSrc(ex)} alt={`${ex.name} demonstration`} style={{ width: '100%', height: isHold && !isDone ? '26vh' : isLift && !isDone ? '30vh' : '38vh', minHeight: 170, objectFit: 'contain', background: '#fff', borderRadius: 26, flex: 'none' }} />
            )}
            {!altEx && yt && gifSrc(ex) ? (
              <div className="chips" role="group" aria-label="Show" style={{ justifyContent: 'center' }}>
                <button type="button" className="chip" aria-pressed={media === 'gif'} onClick={() => setMedia('gif')}>Animation</button>
                <button type="button" className="chip" aria-pressed={media === 'video'} onClick={() => setMedia('video')}>▶ Video</button>
              </div>
            ) : null}
            <h1 className="h1 move-title">{ex.name}</h1>
            <p className="muted" style={{ textAlign: 'center', fontWeight: 600 }}>{tip && tip.sets !== move.sets ? `${tip.sets} × ${move.reps} reps · easy week` : doseLabel(move)}</p>
            {isLift ? (
              <ol className="set-track" aria-label="Sets">
                {Array.from({ length: Math.max(planned, sets.length) }, (_, i) => {
                  const st = sets[i]; const now = !isDone && i === sets.length;
                  return (
                    <li key={i} className={st ? 'done' : now ? 'now' : ''}>
                      <span>Set {i + 1}</span>
                      <b>{st ? (st.kg ? `${st.kg} × ${st.reps}` : `${st.reps} reps`) : now ? 'now' : '—'}</b>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {isLift && !isDone ? (
              <div className="grid2">
                <div className="field">Weight<Stepper label="weight" value={kg} step={2.5} decimals={1} min={0} max={300} unit="kg" onChange={setKg} /></div>
                <div className="field">Reps<Stepper label="reps" value={reps} min={1} max={200} onChange={setReps} /></div>
              </div>
            ) : null}
            {isHold && !isDone ? <HoldRing key={curId} secs={move.reps} onDone={complete} /> : null}
            {isLift && tip && !isDone ? <CoachCard tip={tip} /> : null}
            {yt && vidOn ? (
              <a className="btn quiet sm" href={yt} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'center' }}>
                Not playing? Open in {/instagram\.com/i.test(yt) ? 'Instagram' : 'YouTube'}
              </a>
            ) : null}
            {sets.length && !isLift ? (
              <div className="chips" style={{ justifyContent: 'center' }} aria-label="Logged sets">
                {sets.map((s) => <span key={s.at} className="chip" aria-pressed="true">{isStretch || !s.kg ? `${s.reps}` : `${s.kg} kg × ${s.reps}`}</span>)}
              </div>
            ) : null}
          </div>

          <div style={{ padding: '14px 18px calc(var(--sb) + 18px)', borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }} className="stack">
            {restEnd > 0 ? <RestBar end={restEnd} total={restLen} onSkip={stopRest} onMore={() => startRest(Math.max(5, Math.round((restEnd - Date.now()) / 1000)) + 15, `${ex.name}`)} onDone={() => { setRestEnd(0); haptic.success(); toast('Rest over — go! 💪'); }} /> : null}
            {isLift && !isDone ? (
              <>
                <button type="button" className="btn lg block neon" onClick={logSet}>
                  <Icon name="check" size={20} stroke={2.6} /> Log set {sets.length + 1}{kg > 0 ? ` · ${kg} kg × ${reps}` : ` · ${reps} reps`}
                </button>
                <button type="button" className="btn quiet sm" style={{ alignSelf: 'center' }} onClick={complete}>{sets.length ? 'Done with this move' : 'Already did all sets? Mark done'}</button>
              </>
            ) : isDone ? (
              <>
                <p className="ok-t done-line"><Icon name="check" size={16} stroke={3} /> Logged as done <button type="button" className="btn quiet sm" onClick={uncomplete}>Undo</button></p>
                {idx < moves.length - 1 ? (
                  <button type="button" className="btn lg block neon" onClick={() => setIdx(idx + 1)}>Next: {exById[moves[idx + 1].exId]?.name} <Icon name="next" size={18} /></button>
                ) : (
                  <button type="button" className="btn lg block neon" onClick={askEnd}>Finish workout</button>
                )}
              </>
            ) : (
              <button type="button" className="btn lg block neon" onClick={complete}><Icon name="check" size={20} stroke={2.6} /> Done</button>
            )}
            <div className="between">
              <button type="button" className="btn quiet" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
              <button type="button" className="btn quiet" style={{ color: 'var(--text)' }} onClick={() => setListOpen(true)}>All moves</button>
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
                  <strong style={{ fontSize: 16 }}>{session?.swaps?.[m.exId] ? exById[session.swaps[m.exId]]?.name : e?.name}</strong>
                  {m.alt && exById[m.alt.exId] ? <span className="small muted">{session?.swaps?.[m.exId] ? `instead of ${e?.name}` : `or ${exById[m.alt.exId].name} if busy`}</span> : null}
                  <span className="small muted">{doseLabel(m)}{e?.group === 'stretching' ? ' · stretch' : ''}</span>
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

const COACH_LABEL: Record<Tip['kind'], [string, string]> = {
  first: ['★', 'Start here'], up: ['↑', 'Go up'], same: ['=', 'Hold'], down: ['↓', 'Step back'], easy: ['🌙', 'Easy day'], deload: ['🪶', 'Easy week'],
};
function CoachCard({ tip }: { tip: Tip }) {
  const [ic, label] = COACH_LABEL[tip.kind];
  return (
    <div className={`coach k-${tip.kind}`} role="note" aria-label="Coach">
      <span className="coach-ic" aria-hidden="true">{ic}</span>
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <strong>{label}{tip.kg > 0 ? ` · ${tip.kg} kg × ${tip.reps}` : ` · ${tip.reps} reps`}{tip.week ? <span className="pill" style={{ marginLeft: 8 }}>Week {tip.week}</span> : null}</strong>
        <span className="small">{tip.why}</span>
        {tip.last ? <span className="small muted">Last time ({shortLabel(tip.last.date)}): {tip.last.kg} kg × {tip.last.reps.join(' · ')}</span> : null}
      </div>
    </div>
  );
}

/** A stretch hold: tap Start, the ring counts down and ticks the move off by itself. */
function HoldRing({ secs, onDone }: { secs: number; onDone: () => void }) {
  const [left, setLeft] = useState(secs);
  const [run, setRun] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    if (!run) return;
    const end = Date.now() + left * 1000;
    const t = window.setInterval(() => {
      const l = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) { window.clearInterval(t); setRun(false); if (!fired.current) { fired.current = true; haptic.success(); onDone(); } }
    }, 200);
    return () => window.clearInterval(t);
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps
  const R = 70, C = 2 * Math.PI * R;
  return (
    <div className="hold">
      <button type="button" className={`hold-ring${run ? ' run' : ''}`} onClick={() => { haptic.tap(); setRun(!run); }} aria-label={run ? `Pause, ${left} seconds left` : `Start the ${secs} second hold`}>
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r={R} className="hold-bg" />
          <circle cx="80" cy="80" r={R} className="hold-fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - left / secs) }} />
        </svg>
        <span className="hold-t"><b className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b><small>{run ? 'tap to pause' : left === secs ? 'tap to start' : 'paused'}</small></span>
      </button>
    </div>
  );
}

function RestBar({ end, total, onSkip, onMore, onDone }: { end: number; total: number; onSkip: () => void; onMore: () => void; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, []);
  const stale = useRef(end < Date.now() - 3000); // reopened long after the rest ended → just clear it
  useEffect(() => { if (left === 0) (stale.current ? onSkip : onDone)(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = Math.min(100, Math.max(0, ((total - left) / Math.max(1, total)) * 100));
  return (
    <div className="rest" role="timer" aria-label={`Rest, ${left} seconds left`}>
      <div className="rest-fill" style={{ width: `${pct}%` }} />
      <span className="rest-t">Rest <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b></span>
      <button type="button" className="chip" onClick={onMore}>+15s</button>
      <button type="button" className="chip" onClick={onSkip}>Skip</button>
    </div>
  );
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ l: (i * 47) % 100, d: (i % 7) * 60, c: ['var(--acc)', '#FF7A59', '#4FD1FF', '#FFD166', '#C77DFF'][i % 5], r: (i * 73) % 360 })), []);
  return <div className="confetti" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ left: `${b.l}%`, animationDelay: `${b.d}ms`, background: b.c, transform: `rotate(${b.r}deg)` }} />)}</div>;
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
