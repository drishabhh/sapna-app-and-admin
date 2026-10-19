import { useRef, useState } from 'react';
import { BUNDLED, refreshContent } from '../lib/content';
import { DOW_FULL, DOW_LETTER, keyOf, shortLabel } from '../lib/dates';
import { exportBackup, haptic, readBackupFile, syncReminders } from '../lib/native';
import { SyncCard } from '../syncui';
import { useStore } from '../lib/store';
import { emptyData, Reminders, ShareCycle } from '../lib/types';
import { FullSheet, Icon, Sheet, Stepper, toast, Toggle, TopBar } from '../ui';
import { Doodle, pinWidget } from '../streak';

export const APP_VERSION = '1.0.0';

type BoolRem = Exclude<keyof Reminders, 'punchTime'>;
const fmt12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, content, update, replaceAll } = useStore();
  const p = data.profile;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ReturnType<typeof readBackupFile>>(null);
  const [resetStep, setResetStep] = useState(0);
  const [checking, setChecking] = useState(false);

  const setProfile = (patch: Partial<typeof p>) => update((d) => ({ ...d, profile: { ...d.profile, ...patch } }));

  async function setRem<K extends keyof Reminders>(k: K, v: Reminders[K]) {
    const next = { ...data, reminders: { ...data.reminders, [k]: v } };
    update((d) => ({ ...d, reminders: { ...d.reminders, [k]: v } }));
    const r = await syncReminders(next);
    if (r === 'denied') toast('Allow notifications for Sapna Health in phone Settings.');
  }
  async function setGymDays(days: number[]) {
    setProfile({ gymDays: days });
    await syncReminders({ ...data, profile: { ...data.profile, gymDays: days } }, { ask: false });
  }
  async function backup() {
    const ok = await exportBackup(data);
    if (ok) {
      update((d) => ({ ...d, lastBackupAt: Date.now() }));
      toast('Backup ready — save it to Drive or send it to yourself.');
    }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const parsed = readBackupFile(await f.text());
    if (!parsed) { toast("That file isn't a Sapna Health backup."); return; }
    setPending(parsed);
  }
  async function check() {
    setChecking(true);
    const fresh = await refreshContent(content);
    setChecking(false);
    toast(fresh ? 'New plan downloaded — reopen the app to see it.' : 'You already have the latest plan.');
  }

  return (
    <FullSheet open={open} onClose={onClose} label="Settings" acc="today">
      <TopBar onBack={onClose} title="Settings" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 18px calc(var(--sb) + 30px)' }} className="stack">

        <section className="card stack" style={{ gap: 14 }} aria-label="Backup">
          <div className="row"><span className="acc-t"><Icon name="lock" /></span><h2 className="h2" style={{ fontSize: 19 }}>Your data</h2></div>
          <p className="small muted">Everything is stored on this phone. Android's backup (Settings › Google › Backup) copies it to your Google account automatically, so reinstalling restores it. For extra safety, save a file now and then.</p>
          <div className="grid2">
            <button type="button" className="btn" onClick={backup}><Icon name="share" size={18} /> Export</button>
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Restore</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="small faint">{data.lastBackupAt ? `Last exported ${shortLabel(keyOf(new Date(data.lastBackupAt)))}` : 'Never exported'} · {data.food.length} food logs · {data.sessions.length} workout{data.sessions.length === 1 ? '' : 's'}</p>
        </section>

        <SyncCard />

        <section className="card stack" style={{ gap: 10 }} aria-label="Cycle sharing" data-acc="cycle">
          <span className="h3">Cycle in what Rishu sees</span>
          <div className="chips" role="group" aria-label="Cycle sharing">
            {([['phase', 'Phase only'], ['all', 'Everything'], ['none', 'Nothing']] as [ShareCycle, string][]).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={p.shareCycle === k} onClick={() => setProfile({ shareCycle: k })}>{l}</button>
            ))}
          </div>
        </section>

        <section className="card row" style={{ gap: 12 }} aria-label="Streak widget" data-acc="workout">
          <Doodle name="thumbs" size={78} />
          <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
            <h2 className="h2" style={{ fontSize: 19 }}>Streak widget</h2>
            <p className="small muted">Your streak on the home screen, with a doodle that changes through the day.</p>
            <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              const ok = await pinWidget();
              if (!ok) toast('Long-press your home screen → Widgets → Sapna Health');
            }}>Add to home screen</button>
          </div>
        </section>

        <section className="card" style={{ padding: '6px 16px' }} aria-label="Reminders">
          <h2 className="h2" style={{ fontSize: 19, padding: '10px 0 4px' }}>Reminders</h2>
          {([
            ['punch', 'Daily gym punch line', `Every day at ${fmt12(data.reminders.punchTime)} — with a doodle`],
            ['meals', 'Log meals', '1:30 pm and 8:30 pm'],
            ['water', 'Water', 'Every 2 hours, 9 am – 7 pm, with a little quote'],
            ['gym', 'Workout days', '6:30 pm on gym days'],
            ['weigh', 'Weekly weigh-in', 'Friday 8 am · Monday nudge if missed'],
            ['steps', 'Night steps check-in', '11:30 pm · “remind in 15 min” button'],
          ] as [BoolRem, string, string][]).map(([k, l, w], i, a) => (
            <div key={k} className="between" style={{ padding: '13px 0', borderBottom: i < a.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div><strong>{l}</strong><p className="small muted">{w}</p></div>
              <Toggle label={l} on={data.reminders[k]} onChange={(v) => setRem(k, v)} />
            </div>
          ))}
          {data.reminders.punch ? (
            <label className="between" style={{ padding: '4px 0 14px' }}>
              <span className="small muted">Punch-line time</span>
              <input className="input" type="time" style={{ width: 130 }} value={data.reminders.punchTime} onChange={(e) => e.target.value && setRem('punchTime', e.target.value)} />
            </label>
          ) : null}
        </section>

        <section className="card stack" style={{ gap: 14 }} aria-label="Profile" data-acc="workout">
          <h2 className="h2" style={{ fontSize: 19 }}>Profile</h2>
          <label className="field">Name<input className="input" value={p.name} onChange={(e) => setProfile({ name: e.target.value })} /></label>
          <div className="field">Height<Stepper label="height" value={p.heightCm} unit="cm" min={120} max={210} onChange={(v) => setProfile({ heightCm: v })} /></div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="h3">Gym days</span>
            <div role="group" aria-label="Gym days" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6 }}>
              {DOW_LETTER.map((l, i) => {
                const on = p.gymDays.includes(i);
                return <button key={i} type="button" className="chip" aria-label={DOW_FULL[i]} aria-pressed={on} style={{ padding: 0, justifyContent: 'center', borderRadius: 14 }} onClick={() => setGymDays(on ? p.gymDays.filter((x) => x !== i) : [...p.gymDays, i].sort())}>{l}</button>;
              })}
            </div>
          </div>
        </section>

        <section className="card stack" style={{ gap: 14 }} aria-label="Cycle settings" data-acc="cycle">
          <div className="between"><h2 className="h2" style={{ fontSize: 19 }}>Cycle tracking</h2><Toggle label="Cycle tracking" on={p.cycleEnabled} onChange={(v) => setProfile({ cycleEnabled: v })} /></div>
          {p.cycleEnabled ? (
            <>
              <div className="between"><span>Usual cycle</span><div style={{ width: 170 }}><Stepper label="cycle length" value={p.cycleLen} unit="days" min={21} max={40} onChange={(v) => setProfile({ cycleLen: v })} /></div></div>
              <div className="between"><span>Period length</span><div style={{ width: 170 }}><Stepper label="period length" value={p.periodLen} unit="days" min={2} max={10} onChange={(v) => setProfile({ periodLen: v })} /></div></div>
            </>
          ) : null}
        </section>

        <section className="card stack" style={{ gap: 10 }} aria-label="Plans from Rishu" data-acc="food">
          <h2 className="h2" style={{ fontSize: 19 }}>Plans from Rishu</h2>
          <p className="small muted">Targets {content.targets.kcal} kcal · {content.targets.protein} g protein · {content.plans.length} workout plans · {content.foods.length} foods. Updated {shortLabel(keyOf(new Date(content.updatedAt || BUNDLED.updatedAt)))}.</p>
          <button type="button" className="btn ghost" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check for new plans'}</button>
        </section>

        <section className="stack" style={{ gap: 8, padding: '6px 2px' }}>
          <p className="small faint">Sapna Health {APP_VERSION} · made with love by Rishu for Suppu</p>
          <button type="button" className="btn quiet" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setResetStep(1)}>Erase all data on this phone…</button>
        </section>
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)} label="Restore backup">
        {pending ? (
          <div className="stack" style={{ gap: 14 }}>
            <h2 className="h2">Restore this backup?</h2>
            <p className="muted">It has {pending.food?.length || 0} food logs and {pending.sessions?.length || 0} workouts. It replaces what's on this phone now ({data.food.length} food logs).</p>
            <button type="button" className="btn lg block" onClick={() => { replaceAll({ ...pending, onboarded: true }); setPending(null); haptic.success(); toast('Backup restored'); }}>Replace with backup</button>
            <button type="button" className="btn ghost block" onClick={() => setPending(null)}>Cancel</button>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={resetStep > 0} onClose={() => setResetStep(0)} label="Erase data">
        <div className="stack" style={{ gap: 14 }}>
          <h2 className="h2">Erase everything?</h2>
          <p className="muted">All food logs, workouts, weigh-ins and cycle history on this phone are deleted. Export a backup first if you might want them back.</p>
          {resetStep === 1 ? (
            <button type="button" className="btn lg block" style={{ background: 'var(--danger)' }} onClick={() => setResetStep(2)}>Yes, erase</button>
          ) : (
            <button type="button" className="btn lg block" style={{ background: 'var(--danger)' }} onClick={() => { replaceAll(emptyData()); setResetStep(0); onClose(); }}>Tap again to confirm</button>
          )}
          <button type="button" className="btn ghost block" onClick={() => setResetStep(0)}>Keep my data</button>
        </div>
      </Sheet>
    </FullSheet>
  );
}
