import { useEffect, useRef, useState } from 'react';

/**
 * Entrance animations for numbers and bars.
 * Screens remount on every tab switch, so "on mount" = every time she opens a screen.
 * We also replay when the app comes back to the foreground.
 */

const reduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/* ---- replay when the app returns to the foreground ---- */
let replayTick = 0;
const listeners = new Set<(n: number) => void>();
if (typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (Date.now() - hiddenAt < 1500) return; // ignore quick blips (permission dialogs etc.)
    replayTick++;
    // CSS-only animations (charts, dots) restart when the keyframe name flips.
    document.documentElement.dataset.replay = replayTick % 2 ? 'b' : 'a';
    listeners.forEach((f) => f(replayTick));
  });
}
function useReplay(): number {
  const [n, setN] = useState(replayTick);
  useEffect(() => {
    listeners.add(setN);
    return () => { listeners.delete(setN); };
  }, []);
  return n;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

/** Counts up from 0 on mount (and on replay); later changes glide from the old value. */
export function useCountUp(target: number, duration = 900, delay = 0, start0 = 0): number {
  const replay = useReplay();
  const [v, setV] = useState(() => (reduced() ? target : start0));
  const cur = useRef(reduced() ? target : start0);
  const lastReplay = useRef(-1);

  useEffect(() => {
    if (!Number.isFinite(target)) { setV(target); return; }
    if (reduced()) { cur.current = target; setV(target); return; }
    const fresh = lastReplay.current !== replay;
    lastReplay.current = replay;
    const from = fresh ? start0 : cur.current;
    if (from === target) { setV(target); return; }
    let raf = 0;
    let start = 0;
    const wait = fresh ? delay : 0;
    const dur = fresh ? duration : Math.min(500, duration);
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, Math.max(0, (now - start - wait) / dur));
      const x = from + (target - from) * ease(t);
      cur.current = x;
      setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, replay, start0]);

  return v;
}

/** An animated number. `decimals` keeps e.g. 58.5 kg readable while counting. */
/** `from` sets where the count starts (default 0). */
export function Num({ value, from = 0, decimals = 0, locale = true, duration, delay }: { value: number; from?: number; decimals?: number; locale?: boolean; duration?: number; delay?: number }) {
  const v = useCountUp(value, duration, delay, from);
  const shown = decimals ? Number(v.toFixed(decimals)) : Math.round(v);
  const text = locale ? shown.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : String(shown);
  return <span className="num">{text}</span>;
}
