import { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Launch } from './launch';
import { haptic, syncReminders } from './lib/native';
import { today } from './lib/dates';
import { StoreProvider, useStore } from './lib/store';
import { Meal } from './lib/types';
import { Nav, NavCtx, Tab } from './nav';
import CycleScreen from './screens/Cycle';
import FoodScreen from './screens/Food';
import { FoodLogger } from './screens/FoodLogger';
import Onboarding from './screens/Onboarding';
import ProgressScreen from './screens/Progress';
import Settings from './screens/Settings';
import Today from './screens/Today';
import WorkoutScreen from './screens/Workout';
import { Icon, popBack, ToastHost } from './ui';
import { syncNightSteps, syncWidget } from './streak';
import { requestSteps } from './lib/intents';
import { clearDrafts, getDraft, setDraft, useDraft } from './lib/drafts';
import { pushReport, SYNC_EVERY_DEFAULT, useSyncCfg } from './lib/sync';
import { buildReport } from './lib/native';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'workout', label: 'Workout', icon: 'dumbbell' },
  { id: 'cycle', label: 'Cycle', icon: 'drop' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
];

function Shell() {
  const { ready, data } = useStore();
  const [tab, setTab] = useDraft<Tab>('app.tab', 'today');
  const [logger, setLogger] = useDraft<{ open: boolean; meal: Meal; date?: string }>('app.logger', { open: false, meal: 'breakfast' });
  const [settings, setSettings] = useDraft('app.settings', false);
  const [autoStart, setAutoStart] = useState(false);
  // The file copy of drafts (loaded with her data) can be newer than localStorage — re-read once ready.
  useEffect(() => {
    if (!ready) return;
    setTab(getDraft<Tab>('app.tab', tab));
    setLogger(getDraft('app.logger', logger));
    setSettings(getDraft('app.settings', settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-plan the rolling notification window whenever something that changes it moves
  // (and on every launch), so tomorrow's punch line and the Monday weigh-in nudge stay correct.
  const remKey = ready && data.onboarded ? JSON.stringify([data.reminders, data.profile.gymDays, data.profile.name, data.weighIns.length && data.weighIns[data.weighIns.length - 1].date, today()]) : '';
  useEffect(() => {
    if (!remKey) return;
    const t = window.setTimeout(() => { syncReminders(data, { ask: false }).catch(() => {}); }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remKey]);

  // Live sync with Rishu's dashboard: every tick (default 20 s) while open — uploads only when
  // something changed — plus immediately when she leaves the app and right after launch.
  const { content } = useStore();
  const syncCfg = useSyncCfg();
  const latest = useRef({ data, content });
  latest.current = { data, content };
  const every = Math.max(10, syncCfg?.every ?? SYNC_EVERY_DEFAULT) * 1000;
  useEffect(() => {
    if (!ready || !data.onboarded || !syncCfg) return;
    const tick = () => { if (document.visibilityState !== 'hidden') { const { data: d, content: c } = latest.current; pushReport(buildReport(d, c)).catch(() => {}); } };
    const t = window.setInterval(tick, every);
    return () => window.clearInterval(t);
  }, [ready, data.onboarded, !!syncCfg, every]);
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    const now = () => { const { data: d, content: c } = latest.current; pushReport(buildReport(d, c)).catch(() => {}); };
    const first = window.setTimeout(now, 3000);
    const onHide = () => { if (document.visibilityState === 'hidden') now(); };
    document.addEventListener('visibilitychange', onHide);
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) now(); });
    return () => { window.clearTimeout(first); document.removeEventListener('visibilitychange', onHide); sub.then((x) => x.remove()).catch(() => {}); };
  }, [ready, data.onboarded]);

  // Keep the home-screen streak widget in step with her logs.
  useEffect(() => {
    if (ready && data.onboarded) { syncWidget(data); syncNightSteps(data); }
  }, [ready, data]);

  // Status / navigation bar icons follow light–dark mode.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => SystemBars.setStyle({ style: mq.matches ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // com.rishu.sapnahealth://steps from the night notification → Today + steps sheet.
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    const handle = (url?: string) => { if (url && /:\/\/steps/.test(url)) { setTab('today'); requestSteps(); } };
    CapApp.getLaunchUrl().then((r) => handle(r?.url)).catch(() => {});
    const sub = CapApp.addListener('appUrlOpen', (e) => handle(e.url));
    return () => { sub.then((s) => s.remove()).catch(() => {}); };
  }, [ready, data.onboarded]);

  // After Android kills the app in the background, put her back at the same scroll position.
  const restoreScroll = useRef(true);
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    const el = document.querySelector<HTMLElement>('.app .screen');
    if (!el) return;
    if (restoreScroll.current) {
      restoreScroll.current = false;
      const y = getDraft<{ tab: string; y: number } | null>('app.scroll', null);
      if (y && y.tab === tab && y.y > 0) requestAnimationFrame(() => requestAnimationFrame(() => { el.scrollTop = y.y; }));
    }
    let t = 0;
    const onScroll = () => { window.clearTimeout(t); t = window.setTimeout(() => setDraft('app.scroll', { tab, y: Math.round(el.scrollTop) }), 250); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.clearTimeout(t); el.removeEventListener('scroll', onScroll); };
  }, [ready, data.onboarded, tab]);

  // Android back button: close the top sheet first, then go to Today, then leave the app.
  useEffect(() => {
    const sub = CapApp.addListener('backButton', () => {
      if (popBack()) return;
      if (tab !== 'today') { setTab('today'); return; }
      CapApp.minimizeApp().catch(() => {});
    });
    return () => { sub.then((s) => s.remove()).catch(() => {}); };
  }, [tab]);

  const go = useCallback((t: Tab) => { haptic.tap(); setTab(t); }, []);
  const nav: Nav = useMemo(() => ({
    tab,
    go,
    openLogger: (meal: Meal, date?: string) => { clearDrafts('log.'); setLogger({ open: true, meal, date }); },
    openSettings: () => setSettings(true),
    startWorkout: () => { setTab('workout'); setAutoStart(true); },
  }), [tab, go]);

  // One stable <Launch/> at a fixed position so its timing state survives the ready → onboarded → app transitions.
  let view: ReactElement;
  if (!ready) view = <div className="app" style={{ background: 'var(--bg)' }} />;
  else if (!data.onboarded) view = <div className="app"><Onboarding /><ToastHost /></div>;
  else view = (
    <NavCtx.Provider value={nav}>
      <div className="app">
        {tab === 'today' && <Today />}
        {tab === 'food' && <FoodScreen />}
        {tab === 'workout' && <WorkoutScreen autoStart={autoStart} onAutoStartHandled={() => setAutoStart(false)} />}
        {tab === 'cycle' && <CycleScreen />}
        {tab === 'progress' && <ProgressScreen />}

        <nav className="tabbar" aria-label="Main" data-acc={tab}>
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} data-acc={t.id} onClick={() => go(t.id)}>
              <Icon name={t.icon} size={22} stroke={tab === t.id ? 2.3 : 1.9} />
              {t.label}
            </button>
          ))}
        </nav>

        <FoodLogger open={logger.open} meal={logger.meal} date={logger.date} onClose={() => { clearDrafts('log.'); setLogger((l) => ({ ...l, open: false })); }} />
        <Settings open={settings} onClose={() => setSettings(false)} />
        <ToastHost />
      </div>
    </NavCtx.Provider>
  );
  return <>{view}<Launch ready={ready} onboarded={data.onboarded} /></>;
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
