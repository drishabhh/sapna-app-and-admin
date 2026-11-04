import { useState } from 'react';
import { buildReport, haptic, saveTextFile, shareReport } from './lib/native';
import { today } from './lib/dates';
import { useStore } from './lib/store';
import { connectSync, disconnectSync, pairingCodeOf, pushReport, setSyncEvery, SYNC_EVERY_DEFAULT, useSyncCfg } from './lib/sync';
import { Share } from '@capacitor/share';
import { Icon, toast } from './ui';

export function ago(ms?: number): string {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Settings: connect / status / sync now / disconnect, plus the emergency file share. */
export function SyncCard() {
  const { data, content, update } = useStore();
  const cfg = useSyncCfg();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [showCode, setShowCode] = useState(false);
  async function shareCode() {
    if (!cfg) return;
    const text = pairingCodeOf(cfg);
    try { await Share.share({ title: 'Sapna Health code', text: `My Sapna Health code — paste it in the admin page:\n\n${text}` }); return; } catch { /* no share sheet */ }
    try { await navigator.clipboard.writeText(text); toast('Code copied — paste it to Rishu'); } catch { setShowCode(true); }
  }
  const tokenProblem = !!cfg?.error && /code|key|access|expired|removed/i.test(cfg.error);
  const report = () => buildReport(data, content) as unknown as Record<string, unknown>;

  async function connect() {
    setBusy(true);
    const r = await connectSync(code, report());
    setBusy(false);
    if (r.ok) { haptic.success(); setCode(''); setReplacing(false); toast('Connected — Rishu now sees your dashboard live'); }
    else toast(r.error || 'Could not connect');
  }
  async function now() {
    setBusy(true);
    const ok = await pushReport(report(), { force: true });
    setBusy(false);
    toast(ok ? 'Synced' : 'Sync failed — see the message below');
  }

  const shared = data.profile.cycleEnabled && data.profile.shareCycle !== 'none';
  const what = `meals, workouts, water, steps and weight${shared ? ' (and your cycle, as you chose)' : ''}`;
  const pasteBox = (label: string) => (
    <div className="stack" style={{ gap: 8 }}>
      <textarea className="input" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAPNA-SYNC-1:…" aria-label={label} style={{ minHeight: 84, padding: 12, fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" disabled={busy || !code.trim()} onClick={connect}>{busy ? 'Connecting…' : 'Connect'}</button>
        {replacing ? <button type="button" className="btn sm quiet" onClick={() => { setReplacing(false); setCode(''); }}>Cancel</button> : null}
      </div>
    </div>
  );

  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Live sync with Rishu" data-acc="cycle">
      <div className="between">
        <h2 className="h2" style={{ fontSize: 19 }}>Sharing with Rishu</h2>
        {cfg ? <span className={`pill${tokenProblem ? ' warn' : ''}`}>{tokenProblem ? 'Needs a fix' : <><Icon name="check" size={14} stroke={3} /> On</>}</span> : null}
      </div>

      {!cfg ? (
        <>
          <p className="muted">Rishu can follow your progress and send you plans. Paste the code he sent you — you only do this once.</p>
          {pasteBox('Code from Rishu')}
          <p className="small faint">Everything is locked (encrypted) on this phone before it leaves.</p>
        </>
      ) : tokenProblem ? (
        <>
          <div className="card tight stack" style={{ gap: 6, borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)' }}>
            <strong>Rishu can’t see your updates right now</strong>
            <p className="small muted">{cfg.error}</p>
            <p className="small">Ask Rishu for a new code and paste it here. Your data stays safe on this phone.</p>
          </div>
          {pasteBox('New code from Rishu')}
        </>
      ) : (
        <>
          <p className="muted">Rishu sees your {what}. <strong style={{ color: 'var(--text)' }}>Updated {ago(cfg.lastAt)}.</strong></p>
          {cfg.error ? <p className="small" style={{ color: 'var(--amber, #ffb224)' }}>Couldn’t send the last update just now (no internet?). It tries again by itself.</p> : null}
          <button type="button" className="btn block" onClick={shareCode}><Icon name="share" size={18} /> Send my code to Rishu</button>
          <p className="small faint" style={{ marginTop: -4 }}>Only when Rishu asks — he pastes it on a new phone or laptop to see your progress there. Send it only to him.</p>
        </>
      )}

      {cfg ? (
        <details className="small">
          <summary className="muted" style={{ cursor: 'pointer', fontWeight: 600 }}>More options</summary>
          <div className="stack" style={{ gap: 14, marginTop: 12 }}>
            <div className="between">
              <span className="muted">Send my latest now</span>
              <button type="button" className="btn sm ghost" disabled={busy} onClick={now}><Icon name="history" size={16} /> {busy ? 'Sending…' : 'Update now'}</button>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="muted">How often Rishu’s view updates while the app is open</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Sync every">
                {([[20, 'Every 20 sec'], [60, 'Every minute'], [300, 'Every 5 min']] as [number, string][]).map(([v, l]) => (
                  <button key={v} type="button" className="chip" style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }} aria-pressed={(cfg.every ?? SYNC_EVERY_DEFAULT) === v} onClick={() => setSyncEvery(v)}>{l}</button>
                ))}
              </div>
              <span className="faint">It only sends when something changed, and always when you close the app.</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="muted">My code</span>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn sm ghost" onClick={() => setShowCode((v) => !v)}>{showCode ? 'Hide code' : 'Show code'}</button>
                {!replacing && !tokenProblem ? <button type="button" className="btn sm ghost" onClick={() => setReplacing(true)}>Rishu sent a new code</button> : null}
              </div>
              {showCode ? <textarea className="input" readOnly rows={3} value={pairingCodeOf(cfg)} onFocus={(e) => e.currentTarget.select()} aria-label="Your sync code" style={{ minHeight: 84, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, monospace' }} /> : null}
              {replacing && !tokenProblem ? pasteBox('New code from Rishu') : null}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="muted">Sync not working?</span>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn sm ghost" onClick={async () => { const ok = await shareReport(data, content); if (ok) update((d) => ({ ...d, lastReportAt: Date.now() })); }}><Icon name="share" size={16} /> Send as a file</button>
                <button type="button" className="btn sm ghost" onClick={async () => { const p = await saveTextFile(`sapna-dashboard-${today()}.txt`, JSON.stringify(buildReport(data, content))); toast(p ? `Saved to ${p}` : 'Could not save'); }}>Save file to phone</button>
              </div>
            </div>
            {confirmOff ? (
              <div className="card tight stack" style={{ gap: 8 }}>
                <strong>Stop sharing with Rishu?</strong>
                <p className="small muted">He won’t see new updates until you paste a code again. Nothing on your phone is deleted.</p>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn sm" style={{ background: 'var(--danger)' }} onClick={async () => { await disconnectSync(); setConfirmOff(false); toast('Sharing stopped'); }}>Yes, stop</button>
                  <button type="button" className="btn sm quiet" onClick={() => setConfirmOff(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn sm quiet" style={{ alignSelf: 'flex-start', color: 'var(--danger)' }} onClick={() => setConfirmOff(true)}>Stop sharing</button>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** Progress tab: one line of status, or a nudge to connect. */
export function SyncStatus({ onOpenSettings }: { onOpenSettings: () => void }) {
  const cfg = useSyncCfg();
  return (
    <button type="button" className="card row" style={{ textAlign: 'left', color: 'var(--text)', gap: 12 }} data-acc="cycle" onClick={onOpenSettings}>
      <span className="acc-t"><Icon name={cfg && !cfg.error ? 'check' : 'share'} size={22} /></span>
      <span className="stack" style={{ gap: 2, flex: 1 }}>
        <strong>{cfg ? (cfg.error ? 'Sync needs attention' : 'Rishu sees your dashboard live') : 'Connect live sync with Rishu'}</strong>
        <span className="small muted">{cfg ? (cfg.error ? cfg.error : `Synced ${ago(cfg.lastAt)}`) : 'One-time code from Rishu — then no more files.'}</span>
      </span>
      <Icon name="next" size={18} />
    </button>
  );
}
