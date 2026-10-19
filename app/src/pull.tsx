import { useEffect, useRef, useState } from 'react';
import { buildReport, haptic } from './lib/native';
import { useStore } from './lib/store';
import { loadSyncCfg, pushReport } from './lib/sync';
import { Icon, toast } from './ui';

const TRIGGER = 72; // px of pull needed
const MAX = 110;

/**
 * Pull down at the top of any tab: sync to Rishu's dashboard right now and fetch his latest plans.
 * Attaches to the tab's scrolling `.screen` element.
 */
export function PullToRefresh({ tab }: { tab: string }) {
  const { data, content, reloadContent } = useStore();
  const latest = useRef({ data, content });
  latest.current = { data, content };
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.app .screen');
    if (!el) return;
    let startY = 0, startX = 0, active = false, dist = 0;
    const onStart = (e: TouchEvent) => {
      if (busyRef.current || el.scrollTop > 0 || e.touches.length !== 1) { active = false; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX; active = true; dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
      if (dy <= 0 || el.scrollTop > 0 || dx > dy) { if (dist) { dist = 0; setPull(0); } return; }
      dist = Math.min(MAX, dy * 0.5); // resistance
      setPull(dist);
      if (dist > 8 && e.cancelable) e.preventDefault(); // keep the page still while pulling
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (dist >= TRIGGER) run(); else setPull(0);
      dist = 0;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function run() {
    busyRef.current = true; setBusy(true); setPull(TRIGGER * 0.75); haptic.tap();
    const { data: d, content: c } = latest.current;
    const cfg = await loadSyncCfg();
    const [synced, fresh] = await Promise.all([
      cfg ? pushReport(buildReport(d, c) as unknown as Record<string, unknown>, { force: true }) : Promise.resolve(null),
      reloadContent().catch(() => false),
    ]);
    busyRef.current = false; setBusy(false); setPull(0);
    if (synced === false) toast('Couldn’t sync — check Settings › Live sync');
    else {
      haptic.success();
      toast([fresh ? 'New plan from Rishu' : null, synced ? 'Synced with Rishu' : null].filter(Boolean).join(' · ') || 'Up to date');
    }
  }

  const shown = pull > 0 || busy;
  const p = Math.min(1, pull / TRIGGER);
  return (
    <div className={`ptr${shown ? ' on' : ''}${busy ? ' busy' : ''}`} style={{ transform: `translate(-50%, ${Math.round(pull - 46)}px)` }} aria-hidden={!shown} role="status" aria-label={busy ? 'Refreshing' : undefined}>
      <span style={{ transform: busy ? undefined : `rotate(${p * 270}deg)`, opacity: busy ? 1 : 0.35 + p * 0.65 }}><Icon name="history" size={20} stroke={2.4} /></span>
    </div>
  );
}
