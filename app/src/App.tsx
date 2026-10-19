import { ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
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
import { streakInfo } from './lib/calc';
import { syncWidget } from './streak';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'workout', label: 'Workout', icon: 'dumbbell' },
  { id: 'cycle', label: 'Cycle', icon: 'drop' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
];

function Shell() {
  const { ready, data } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [logger, setLogger] = useState<{ open: boolean; meal: Meal; date?: string }>({ open: false, meal: 'breakfast' });
  const [settings, setSettings] = useState(false);
  const [autoStart, setAutoStart] = useState(false);

  // Re-plan the rolling notification window whenever something that changes it moves
  // (and on every launch), so tomorrow's punch line and the Monday weigh-in nudge stay correct.
  const remKey = ready && data.onboarded ? JSON.stringify([data.reminders, data.profile.gymDays, data.profile.name, data.weighIns.length && data.weighIns[data.weighIns.length - 1].date, today()]) : '';
  useEffect(() => {
    if (!remKey) return;
    const t = window.setTimeout(() => { syncReminders(data, { ask: false }).catch(() => {}); }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remKey]);

  // Keep the home-screen streak widget in step with her logs.
  useEffect(() => {
    if (ready && data.onboarded) syncWidget(streakInfo(data), data.profile.name);
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
    openLogger: (meal: Meal, date?: string) => setLogger({ open: true, meal, date }),
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

        <FoodLogger open={logger.open} meal={logger.meal} date={logger.date} onClose={() => setLogger((l) => ({ ...l, open: false }))} />
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
