import { useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/calc';
import { today } from '../lib/dates';
import { buildDay, DayPlan, DayStep, isRestDay, kcalFor, latestWeight, nextDay, Program, PROGRAMS, progressOf } from '../lib/home';
import { haptic } from '../lib/native';
import { useStore } from '../lib/store';
import { Session } from '../lib/types';
import { Congrats, Feel } from '../congrats';
import { Doodle } from '../streak';
import { FullSheet, Gif, Icon, toast } from '../ui';

const gif = (g: string) => (/^https:\/\//.test(g) ? g : `./${g}`);
const amountLabel = (s: DayStep) => (s.move.kind === 'time' ? `${s.amount}s` : `×${s.amount}`);

/* ================= Program list ================= */

export function HomeTab() {
  const { data } = useStore();
  const [open, setOpen] = useState<Program | null>(null);
  // the program she touched most recently is "current"
  const current = useMemo(() => {
    const touched = PROGRAMS.filter((p) => p.days > 0 && progressOf(data, p.id).done.length).sort((a, b) => (progressOf(data, b.id).startedOn || '').localeCompare(progressOf(data, a.id).startedOn || ''));
    return touched[0] || PROGRAMS[0];
  }, [data]);
  const pr = progressOf(data, current.id);
  const nd = nextDay(current, pr);
  const plan = buildDay(current, nd, pr.adjust, latestWeight(data));
  useEffect(() => {
    const h = (e: Event) => { const p = PROGRAMS.find((x) => x.id === (e as CustomEvent<string>).detail); if (p) setOpen(p); };
    document.addEventListener('open-program', h);
    return () => document.removeEventListener('open-program', h);
  }, []);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <button type="button" className="card prog-hero" style={{ ['--pc' as string]: current.color }} onClick={() => setOpen(current)}>
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0, textAlign: 'left' }}>
          <p className="eyebrow">{pr.done.length ? 'Continue' : 'Start here'}</p>
          <p className="h2" style={{ fontSize: 24 }}>{current.title}</p>
          <p className="small muted">Day {nd} of {current.days} · {plan.rest ? 'rest day' : `${plan.minutes} min · ~${plan.kcal} kcal`}</p>
          <div className="pbar" aria-label={`${pr.done.length} of ${current.days} days done`}><i style={{ width: `${(pr.done.length / current.days) * 100}%` }} /></div>
          <span className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 8 }}><Icon name="play" size={16} /> {plan.rest ? 'Open rest day' : `Start day ${nd}`}</span>
        </div>
        <Doodle name={current.doodle} size={120} style={{ marginRight: -6, marginTop: -10 }} />
      </button>

      <h2 className="h2">Programs</h2>
      {PROGRAMS.map((p) => {
        const r = progressOf(data, p.id);
        return (
          <button key={p.id} type="button" className="list-row prog-row" style={{ ['--pc' as string]: p.color }} onClick={() => setOpen(p)}>
            <Doodle name={p.doodle} size={64} />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }} className="stack">
              <strong style={{ fontSize: 16 }}>{p.title}</strong>
              <span className="small muted">{p.blurb}</span>
              {p.days ? <div className="pbar sm"><i style={{ width: `${(r.done.length / p.days) * 100}%` }} /></div> : null}
            </span>
            <Icon name="next" size={18} />
          </button>
        );
      })}
      <ProgramSheet program={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ================= Program → day → player → congrats ================= */

function ProgramSheet({ program, onClose }: { program: Program | null; onClose: () => void }) {
  const { data, update } = useStore();
  const [stage, setStage] = useState<'days' | 'preview' | 'play' | 'done'>('days');
  const [day, setDay] = useState(1);
  const [result, setResult] = useState<{ session: Session; plan: DayPlan } | null>(null);
  const [backTick, setBackTick] = useState(0);
  const kg = latestWeight(data);

  useEffect(() => {
    if (!program) return;
    const pr = progressOf(data, program.id);
    const nd = program.days === 0 ? ((Math.floor(Date.now() / 86400000) % 30) + 1) : nextDay(program, pr);
    setDay(nd);
    setStage(program.days === 0 ? 'preview' : 'days');
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id]);

  if (!program) return null;
  const pr = progressOf(data, program.id);
  const plan = buildDay(program, day, pr.adjust, kg);

  function markDone(d: number) {
    update((x) => {
      const cur = progressOf(x, program!.id);
      return { ...x, programs: { ...x.programs, [program!.id]: { ...cur, done: [...new Set([...cur.done, d])].sort((a, b) => a - b), startedOn: cur.startedOn || today() } } };
    });
  }

  function finished(doneIdx: number[], startedAt: number) {
    const steps = doneIdx.map((i) => plan.steps[i]);
    const s: Session = {
      id: uid(),
      date: today(),
      planId: `home:${program!.id}`,
      title: program!.days ? `${program!.title} · Day ${day}` : program!.title,
      startedAt,
      endedAt: Date.now(),
      kind: 'home',
      programId: program!.id,
      day,
      kcal: kcalFor(steps, kg),
      sets: steps.map((st, i) => ({ exId: st.move.id, set: 1, kg: 0, reps: st.amount, at: startedAt + i })),
    };
    update((x) => ({ ...x, sessions: [...x.sessions, s] }));
    if (program!.days) markDone(day);
    haptic.success();
    setResult({ session: s, plan });
    setStage('done');
  }

  function feel(f: Feel) {
    update((x) => {
      const cur = progressOf(x, program!.id);
      const adj = Math.min(1.4, Math.max(0.7, cur.adjust * (f === 'easy' ? 1.1 : f === 'hard' ? 0.9 : 1)));
      return { ...x, programs: { ...x.programs, [program!.id]: { ...cur, adjust: Number(adj.toFixed(2)), startedOn: cur.startedOn || today() } } };
    });
  }

  const close = () => (stage === 'preview' && program.days ? setStage('days') : onClose());

  return (
    <FullSheet open={!!program} onClose={stage === 'play' ? () => setBackTick((t) => t + 1) : close} label={program.title} acc="workout">
      {stage === 'done' && result ? (
        <Congrats
          title={program.days ? `Day ${day} done!` : 'Stretch done!'}
          sub={program.title}
          stats={[
            { label: 'Exercises', value: result.session.sets.length },
            { label: 'Minutes', value: Math.max(1, Math.round(((result.session.endedAt || 0) - result.session.startedAt) / 60000)) },
            { label: 'Kcal', value: result.session.kcal || 0 },
          ]}
          onFeel={program.days ? feel : undefined}
          doodle={program.days && day % 7 === 0 ? 'celebrate' : 'cheer'}
          extra={program.days && day < program.days ? <p className="small muted" style={{ textAlign: 'center' }}>Next: day {nextDay(program, progressOf(data, program.id))}{isRestDay(program, day + 1) ? ' — a rest day, you earned it' : ''}.</p> : null}
          onDone={onClose}
        />
      ) : stage === 'play' ? (
        <Player plan={plan} title={program.title} backTick={backTick} onQuit={() => setStage('preview')} onFinish={finished} />
      ) : (
        <>
          <div className="row" style={{ padding: 'calc(var(--st) + 12px) 18px 6px' }}>
            <button type="button" className="icon-btn" aria-label="Back" onClick={close}><Icon name="back" /></button>
            <span className="small muted" style={{ fontWeight: 700, flex: 1 }}>{program.title}</span>
          </div>
          <div className="screen no-nav" style={{ paddingTop: 6 }}>
            {stage === 'days' ? (
              <div className="stack" style={{ gap: 16 }}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
                  <div className="stack" style={{ flex: 1, gap: 4 }}>
                    <h1 className="h1" style={{ fontSize: 32 }}>{program.title}</h1>
                    <p className="muted">{pr.done.length} of {program.days} days done</p>
                  </div>
                  <Doodle name={program.doodle} size={104} />
                </div>
                <div className="pbar"><i style={{ width: `${(pr.done.length / program.days) * 100}%` }} /></div>
                {[0, 1, 2, 3].map((w) => (
                  <section key={w} className="stack" style={{ gap: 8 }}>
                    <p className="eyebrow">Week {w + 1}{w === 3 ? ' · final push' : ''}</p>
                    <div className="daygrid">
                      {Array.from({ length: w === 3 ? 9 : 7 }, (_, i) => w * 7 + i + 1).filter((d) => d <= program.days).map((d) => {
                        const done = pr.done.includes(d);
                        const isNext = d === nextDay(program, pr) && !done;
                        const rest = isRestDay(program, d);
                        return (
                          <button key={d} type="button" className={`dcell${done ? ' done' : ''}${isNext ? ' next' : ''}${rest ? ' rest' : ''}`} aria-label={`Day ${d}${rest ? ', rest' : ''}${done ? ', done' : ''}`} onClick={() => { setDay(d); setStage('preview'); }}>
                            {done ? <Icon name="check" size={16} stroke={3} /> : rest ? <span aria-hidden="true">zz</span> : d}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <button type="button" className="btn lg block" onClick={() => { setDay(nextDay(program, pr)); setStage('preview'); }}>
                  <Icon name="play" size={18} /> Go to day {nextDay(program, pr)}
                </button>
              </div>
            ) : plan.rest ? (
              <div className="stack" style={{ gap: 16, alignItems: 'center', textAlign: 'center', paddingTop: 20 }}>
                <Doodle name="sleep" size={190} />
                <h1 className="h1" style={{ fontSize: 34 }}>Day {day}: rest day</h1>
                <p className="muted">Muscles grow while you rest. Walk, stretch, sleep well — and drink your water.</p>
                <button type="button" className="btn lg block" onClick={() => { markDone(day); toast('Rest day ticked off'); haptic.success(); setStage('days'); }}>Mark rest day done</button>
                <button type="button" className="btn quiet" onClick={() => { const st = PROGRAMS.find((p) => p.id === 'stretch'); if (st) { onClose(); setTimeout(() => document.dispatchEvent(new CustomEvent('open-program', { detail: st.id })), 50); } }}>Do a gentle stretch instead</button>
              </div>
            ) : (
              <DayPreview program={program} plan={plan} onStart={() => setStage('play')} />
            )}
          </div>
        </>
      )}
    </FullSheet>
  );
}

function DayPreview({ program, plan, onStart }: { program: Program; plan: DayPlan; onStart: () => void }) {
  const groups: [DayStep['phase'], string][] = [['warmup', 'Warm-up'], ['main', 'Workout'], ['cooldown', 'Cool-down']];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <h1 className="h1" style={{ fontSize: 32 }}>{program.days ? `Day ${plan.day}` : program.title}</h1>
      <div className="grid3">
        <div className="card tight" style={{ textAlign: 'center' }}><p className="big" style={{ fontSize: 24 }}>{plan.minutes}</p><p className="eyebrow">min</p></div>
        <div className="card tight" style={{ textAlign: 'center' }}><p className="big" style={{ fontSize: 24 }}>{plan.steps.length}</p><p className="eyebrow">moves</p></div>
        <div className="card tight" style={{ textAlign: 'center' }}><p className="big" style={{ fontSize: 24 }}>~{plan.kcal}</p><p className="eyebrow">kcal</p></div>
      </div>
      {groups.map(([ph, label]) => {
        const list = plan.steps.filter((s) => s.phase === ph);
        if (!list.length) return null;
        return (
          <section key={ph} className="stack" style={{ gap: 8 }}>
            <p className="eyebrow">{label}</p>
            {list.map((s, i) => (
              <div key={s.move.id + i} className="list-row" style={{ padding: 8 }}>
                <Gif className="thumb" src={gif(s.move.gif)} alt="" style={{ width: 64, height: 64 }} />
                <span style={{ flex: 1, minWidth: 0 }}><strong>{s.move.name}</strong><span className="small muted" style={{ display: 'block' }}>{s.move.cue}</span></span>
                <span className="pill">{amountLabel(s)}</span>
              </div>
            ))}
          </section>
        );
      })}
      <div style={{ position: 'sticky', bottom: 'calc(var(--sb) + 8px)', paddingTop: 8 }}>
        <button type="button" className="btn lg block" onClick={onStart}><Icon name="play" size={18} /> Start</button>
      </div>
    </div>
  );
}

/* ================= Guided player ================= */

let audio: AudioContext | null = null;
function beep(freq = 880, ms = 120) {
  try {
    audio = audio || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.stop(audio.currentTime + ms / 1000 + 0.02);
  } catch {
    /* no audio */
  }
}

type Phase = 'ready' | 'move' | 'rest';

function Player({ plan, title, backTick, onQuit, onFinish }: { plan: DayPlan; title: string; backTick: number; onQuit: () => void; onFinish: (doneIdx: number[], startedAt: number) => void }) {
  const steps = plan.steps;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [endAt, setEndAt] = useState(() => Date.now() + 10000);
  const [left, setLeft] = useState(10);
  const [paused, setPaused] = useState<number | null>(null); // ms left when paused
  const [quitAsk, setQuitAsk] = useState(false);
  const done = useRef<Set<number>>(new Set());
  const startedAt = useRef(Date.now());
  const lastBeep = useRef(-1);
  const step = steps[idx];
  const timed = phase !== 'move' || step.move.kind === 'time';

  // Android back = "are you sure?" rather than silently dropping the workout
  useEffect(() => {
    if (!backTick) return;
    setPaused((p) => (p === null ? Math.max(0, endAt - Date.now()) : p));
    setQuitAsk(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backTick]);

  // keep the screen on while training (where supported)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);

  function go(p: Phase, i: number) {
    setPhase(p);
    setIdx(i);
    const secs = p === 'ready' ? 10 : p === 'rest' ? plan.restSecs : steps[i].move.kind === 'time' ? steps[i].amount : 0;
    setEndAt(Date.now() + secs * 1000);
    setLeft(secs);
    lastBeep.current = -1;
    if (p === 'move') { beep(1320, 180); haptic.tap(); }
  }

  function completeMove() {
    done.current.add(idx);
    if (idx >= steps.length - 1) { onFinish([...done.current].sort((a, b) => a - b), startedAt.current); return; }
    go('rest', idx);
  }

  function advance() {
    if (phase === 'ready') go('move', idx);
    else if (phase === 'move') completeMove();
    else go('move', idx + 1);
  }

  useEffect(() => {
    if (paused !== null || !timed) return;
    const t = window.setInterval(() => {
      const ms = endAt - Date.now();
      const s = Math.max(0, Math.ceil(ms / 1000));
      setLeft(s);
      if (s <= 3 && s >= 1 && lastBeep.current !== s) { lastBeep.current = s; beep(880, 110); haptic.tap(); }
      if (ms <= 0) { window.clearInterval(t); advance(); }
    }, 150);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt, paused, phase, idx, timed]);

  const pause = () => { if (paused === null) setPaused(Math.max(0, endAt - Date.now())); };
  const resume = () => { if (paused !== null) { setEndAt(Date.now() + paused); setPaused(null); } };

  const total = phase === 'ready' ? 10 : phase === 'rest' ? plan.restSecs : step.amount;
  const showStep = phase === 'rest' ? steps[idx + 1] : step;
  const pct = timed ? Math.max(0, Math.min(1, left / total)) : 1;

  return (
    <div className={`player phase-${phase}`}>
      <div className="row" style={{ padding: 'calc(var(--st) + 10px) 16px 4px', gap: 10 }}>
        <button type="button" className="icon-btn" aria-label="Quit workout" onClick={() => { pause(); setQuitAsk(true); }}><Icon name="close" /></button>
        <div className="psegs" aria-label={`Exercise ${idx + 1} of ${steps.length}`}>
          {steps.map((_, i) => <i key={i} className={done.current.has(i) ? 'on' : i === idx && phase === 'move' ? 'cur' : ''} />)}
        </div>
        <span className="small muted" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{Math.min(idx + 1 + (phase === 'rest' ? 1 : 0), steps.length)}/{steps.length}</span>
      </div>

      <div className="pstage">
        <Gif src={gif(showStep.move.gif)} alt={`${showStep.move.name} demonstration`} className="pgif" />
        {phase !== 'move' ? (
          <div className="pbadge">
            <Doodle name={phase === 'ready' ? 'cap' : 'bottle'} size={84} />
          </div>
        ) : null}
      </div>

      <div className="pbody">
        <p className="eyebrow acc-t" style={{ textAlign: 'center' }}>{phase === 'ready' ? 'Ready to go' : phase === 'rest' ? 'Rest · next up' : step.phase === 'warmup' ? 'Warm-up' : step.phase === 'cooldown' ? 'Cool-down' : title}</p>
        <h1 className="h1" style={{ fontSize: 28, textAlign: 'center' }}>{showStep.move.name}</h1>
        {phase !== 'rest' ? <p className="muted" style={{ textAlign: 'center' }}>{showStep.move.cue}</p> : <p className="muted" style={{ textAlign: 'center' }}>{amountLabel(showStep)} · breathe, sip some water</p>}

        <div className="ptimer" role="timer" aria-live="off">
          {timed ? (
            <svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--card-2)" strokeWidth="9" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--acc)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct * 326.7} 326.7`} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray 0.15s linear' }} />
            </svg>
          ) : null}
          <span className="big pnum">{timed ? (paused !== null ? Math.ceil(paused / 1000) : left) : `×${step.amount}`}</span>
        </div>

        <div className="pctl">
          {phase === 'move' ? (
            <button type="button" className="icon-btn" aria-label="Previous exercise" disabled={idx === 0} onClick={() => go('move', Math.max(0, idx - 1))}><Icon name="prev" /></button>
          ) : phase === 'rest' ? (
            <button type="button" className="btn ghost sm" onClick={() => setEndAt((e) => e + 20000)}>+20s</button>
          ) : <span style={{ width: 44 }} />}

          {phase === 'move' && !timed ? (
            <button type="button" className="btn lg pmain" onClick={completeMove}><Icon name="check" size={20} stroke={2.6} /> Done</button>
          ) : paused !== null ? (
            <button type="button" className="btn lg pmain" onClick={resume}><Icon name="play" size={20} /> Resume</button>
          ) : (
            <button type="button" className="btn lg pmain ghost" onClick={pause}><Icon name="pause" size={20} /> Pause</button>
          )}

          <button type="button" className={phase === 'move' ? 'icon-btn' : 'btn ghost sm'} aria-label={phase === 'move' ? 'Skip exercise' : 'Skip'} onClick={phase === 'move' ? () => { if (idx >= steps.length - 1) onFinish([...done.current], startedAt.current); else go('rest', idx); } : advance}>
            {phase === 'move' ? <Icon name="skip" /> : 'Skip'}
          </button>
        </div>
      </div>

      {quitAsk ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Quit workout?" onClick={() => { setQuitAsk(false); resume(); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ padding: '22px 18px calc(var(--sb) + 18px)' }}>
            <div className="stack" style={{ gap: 12, alignItems: 'center', textAlign: 'center' }}>
              <Doodle name="cry" size={110} />
              <h2 className="h2">Leaving already?</h2>
              <p className="muted">{done.current.size ? `You’ve done ${done.current.size} of ${steps.length}. Finish now to save what you did, or keep going.` : 'Nothing is saved yet. Two more minutes?'}</p>
              <button type="button" className="btn lg block" onClick={() => { setQuitAsk(false); resume(); }}>Keep going</button>
              {done.current.size ? <button type="button" className="btn ghost block" onClick={() => onFinish([...done.current].sort((a, b) => a - b), startedAt.current)}>Finish & save</button> : null}
              <button type="button" className="btn quiet" onClick={onQuit}>Quit without saving</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

