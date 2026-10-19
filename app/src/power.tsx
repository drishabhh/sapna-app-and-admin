import { Capacitor, registerPlugin } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { Icon } from './ui';

interface Power {
  batteryStatus(): Promise<{ unrestricted: boolean; maker: string }>;
  requestUnrestricted(): Promise<void>;
  openAppSettings(): Promise<void>;
}
const P = registerPlugin<Power>('FileSaver');

/** null on web / unknown. Re-checks whenever she comes back to the app (e.g. after tapping Allow). */
export function useBattery(): { unrestricted: boolean; maker: string } | null {
  const [st, setSt] = useState<{ unrestricted: boolean; maker: string } | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const check = () => P.batteryStatus().then(setSt).catch(() => {});
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return st;
}

function makerTip(maker: string) {
  if (/samsung/.test(maker)) return 'Samsung: also Settings › Battery › Background usage limits › Never sleeping apps › add Sapna Health.';
  if (/xiaomi|redmi|poco/.test(maker)) return 'Xiaomi: also App info › Autostart ON and Battery saver › No restrictions. Lock the app in Recents.';
  if (/oneplus|oppo|realme|vivo|iqoo/.test(maker)) return 'Also App info › Battery › Allow background activity.';
  return '';
}

/** Settings card. */
export function InstantCard() {
  const b = useBattery();
  if (!b) return null;
  const tip = makerTip(b.maker);
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label="Instant notifications" data-acc="workout">
      <div className="between">
        <h2 className="h2" style={{ fontSize: 19 }}>Instant notifications</h2>
        <span className={`pill${b.unrestricted ? '' : ' warn'}`}>{b.unrestricted ? 'On' : 'May be delayed'}</span>
      </div>
      <p className="small muted">{b.unrestricted
        ? 'Rishu’s notes, new plans and your 11:30 pm steps check arrive right away.'
        : 'Your phone is saving battery by pausing this app, so Rishu’s notes only show up when you open it.'}</p>
      {!b.unrestricted ? <button type="button" className="btn" onClick={() => P.requestUnrestricted()}><Icon name="bell" size={18} /> Allow instant notifications</button> : null}
      {tip ? <p className="small faint">{tip}</p> : null}
      <button type="button" className="btn sm quiet" style={{ alignSelf: 'flex-start' }} onClick={() => P.openAppSettings()}>Open app settings</button>
    </section>
  );
}

/** One-time nudge on Today until fixed (or dismissed). */
export function InstantNudge() {
  const b = useBattery();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('sapna_instant_nudge') === 'off'; } catch { return false; } });
  if (!b || b.unrestricted || hidden) return null;
  return (
    <section className="card row" style={{ gap: 12, alignItems: 'flex-start' }} aria-label="Allow instant notifications" data-acc="workout">
      <span className="acc-t" style={{ marginTop: 2 }}><Icon name="bell" size={22} /></span>
      <div className="stack" style={{ gap: 8, flex: 1 }}>
        <strong>Get Rishu’s notes instantly</strong>
        <p className="small muted">Your phone is pausing the app to save battery, so his notes wait until you open it.</p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => P.requestUnrestricted()}>Allow</button>
          <button type="button" className="btn sm quiet" onClick={() => { setHidden(true); try { localStorage.setItem('sapna_instant_nudge', 'off'); } catch { /* ignore */ } }}>Not now</button>
        </div>
      </div>
    </section>
  );
}
