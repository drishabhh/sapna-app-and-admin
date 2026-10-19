import { useEffect, useRef, useState } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

const SEEN = 'sapna_intro_seen_v1';
const MIN_BOOT_MS = 1100;

const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode: fine */ } };

function setBars(light: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
}
const systemIsLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

/**
 * Launch sequence. The static art lives in index.html (#boot) so it is on screen immediately.
 * Returning users see it for ~1s and it fades out; first-time users get the short intro film, once.
 */
export function Launch({ ready, onboarded }: { ready: boolean; onboarded: boolean }) {
  const [phase, setPhase] = useState<'boot' | 'video' | 'done'>('boot');
  const [fading, setFading] = useState(false);
  const t0 = useRef(performance.now());
  const started = useRef(false);

  // Native splash is only a solid colour; hand over to the page art straight away.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) SplashScreen.hide().catch(() => {});
    setBars(true); // dark icons on the light launch art
  }, []);

  const hideBoot = () => {
    const el = document.getElementById('boot');
    if (!el) return;
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 420);
  };

  const finish = () => {
    setFading(true);
    window.setTimeout(() => { setPhase('done'); setBars(systemIsLight()); }, 380);
    hideBoot();
    markSeen();
  };

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    if (!onboarded && !seen()) { setPhase('video'); return; }
    const wait = Math.max(0, MIN_BOOT_MS - (performance.now() - t0.current));
    const id = window.setTimeout(() => { hideBoot(); setBars(systemIsLight()); setPhase('done'); }, wait);
    return () => window.clearTimeout(id);
  }, [ready, onboarded]);

  if (phase !== 'video') return null;
  return <IntroFilm fading={fading} onDone={finish} />;
}

function IntroFilm({ onDone, fading }: { onDone: () => void; fading: boolean }) {
  const [shown, setShown] = useState(false);
  const done = useRef(false);
  const end = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    const t = window.setTimeout(end, 6500); // never trap her on a broken video
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className={`launch${shown ? ' on' : ''}${fading ? ' out' : ''}`} onClick={end} role="presentation">
      <video
        src="./intro/intro.mp4"
        poster="./intro/hero.webp"
        muted
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        onPlaying={() => setShown(true)}
        onEnded={() => window.setTimeout(end, 450)}
        onError={end}
      />
      <div className="launch-word">
        <p className="big">Sapna Health</p>
        <p className="small">Made for Sapna, by Rishu</p>
      </div>
      <span className="launch-skip">Tap to skip</span>
    </div>
  );
}
