import { useState } from 'react';
import { buildReport, haptic, saveTextFile, shareReport } from './lib/native';
import { today } from './lib/dates';
import { useStore } from './lib/store';
import { connectSync, disconnectSync, pushReport, useSyncCfg } from './lib/sync';
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

  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Live sync with Rishu" data-acc="cycle">
      <div className="between">
        <h2 className="h2" style={{ fontSize: 19 }}>Live sync with Rishu</h2>
        {cfg ? <span className={`pill${cfg.error ? ' warn' : ''}`}>{cfg.error ? 'Needs attention' : 'On'}</span> : null}
      </div>
      {cfg ? (
        <>
          <p className="small muted">Your dashboard (meals, workouts, steps, water, weight{data.profile.cycleEnabled && data.profile.shareCycle !== 'none' ? ', cycle as chosen below' : ''}) is encrypted on this phone and updates for Rishu whenever you use the app.</p>
          <p className="small"><strong>Last synced:</strong> {ago(cfg.lastAt)}</p>
          {cfg.error ? <p className="small" style={{ color: 'var(--danger)' }}>{cfg.error}</p> : null}
          {replacing || tokenProblem ? (
            <div className="stack" style={{ gap: 8 }}>
              <p className="small muted">Paste the new code Rishu sent. Your data stays as it is.</p>
              <textarea className="input" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAPNA-SYNC-1:…" aria-label="New sync code from Rishu" style={{ minHeight: 84, padding: 12, fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm" disabled={busy || !code.trim()} onClick={connect}>{busy ? 'Connecting…' : 'Use new code'}</button>
                {replacing && !tokenProblem ? <button type="button" className="btn sm quiet" onClick={() => { setReplacing(false); setCode(''); }}>Cancel</button> : null}
              </div>
            </div>
          ) : null}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" disabled={busy} onClick={now}><Icon name="history" size={16} /> {busy ? 'Syncing…' : 'Sync now'}</button>
            {!replacing && !tokenProblem ? <button type="button" className="btn sm ghost" onClick={() => setReplacing(true)}>Paste new code</button> : null}
            {confirmOff ? (
              <button type="button" className="btn sm ghost" onClick={async () => { await disconnectSync(); setConfirmOff(false); toast('Live sync turned off'); }}>Tap again to turn off</button>
            ) : (
              <button type="button" className="btn sm quiet" onClick={() => setConfirmOff(true)}>Turn off</button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="small muted">Paste the sync code Rishu sends you once. After that he sees your dashboard live — no files to send. Everything is encrypted on this phone first.</p>
          <textarea className="input" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAPNA-SYNC-1:…" aria-label="Sync code from Rishu" style={{ minHeight: 84, padding: 12, fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
          <button type="button" className="btn" disabled={busy || !code.trim()} onClick={connect}>{busy ? 'Connecting…' : 'Connect'}</button>
        </>
      )}
      <details className="small" style={{ marginTop: 4 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontWeight: 600 }}>Emergency: send as a file instead</summary>
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <p className="muted">Only if sync isn’t working. Shares one file with your full history over WhatsApp.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm ghost" onClick={async () => { const ok = await shareReport(data, content); if (ok) update((d) => ({ ...d, lastReportAt: Date.now() })); }}><Icon name="share" size={16} /> WhatsApp / Telegram</button>
            <button type="button" className="btn sm ghost" onClick={async () => { const p = await saveTextFile(`sapna-dashboard-${today()}.txt`, JSON.stringify(buildReport(data, content))); toast(p ? `Saved to ${p}` : 'Could not save'); }}>Save to phone</button>
          </div>
        </div>
      </details>
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
