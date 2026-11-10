import { lazy, ReactElement, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Launch } from './launch';
import { haptic, syncReminders } from './lib/native';
import { setReminderContent, snoozeWater } from './lib/notify';
import { addDrink, drinksOf, mlOn, waterPrefs } from './lib/water';
import { keyOf } from './lib/dates';
import { LocalNotifications } from '@capacitor/local-notifications';
import { drink } from './water';
import { today } from './lib/dates';
import { StoreProvider, useStore } from './lib/store';
import { Meal } from './lib/types';
import { Nav, NavCtx, Tab } from './nav';
import FoodScreen from './screens/Food';
import { FoodLogger } from './screens/FoodLogger';
import Today from './screens/Today';
import { cacheMedia } from './lib/mediacache';
import { gifSrc } from './lib/content';
// Opens faster: Today and Food load first; the rest load right after, in the background.
const loadCycle = () => import('./screens/Cycle');
const loadProgress = () => import('./screens/Progress');
const loadWorkout = () => import('./screens/Workout');
const loadSettings = () => import('./screens/Settings');
const CycleScreen = lazy(loadCycle);
const ProgressScreen = lazy(loadProgress);
const WorkoutScreen = lazy(loadWorkout);
const Settings = lazy(loadSettings);
const Onboarding = lazy(() => import('./screens/Onboarding'));
import { Icon, popBack, toast, ToastHost } from './ui';
import { syncNightSteps, syncWaterWidget, syncWidget, takeWidgetDrinks } from './streak';
import { requestSteps, requestWater } from './lib/intents';
import { clearDrafts, getDraft, setDraft, useDraft } from './lib/drafts';
import { pushReport, SYNC_EVERY_DEFAULT, useSyncCfg } from './lib/sync';
import { syncAdminOps } from './lib/adminops';
import { PullToRefresh } from './pull';
import { initPush } from './lib/push';
import { refreshNotes } from './lib/notes';
import { effectiveLock, Lock, readNativeLock, setLockForReport, storeNativeLock } from './lib/lock';
import { buildReport } from './lib/native';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'workout', label: 'Workout', icon: 'dumbbell' },
  { id: 'cycle', label: 'Cycle', icon: 'drop' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
];

function Shell() {
  const { ready, data, update, content: content0, reloadContent: reloadContent0 } = useStore();
  // Rishu's on/off switch (published content + silent push stored natively; newer wins).
  const [nlock, setNlock] = useState<Lock | null>(null);
  const [lockChecked, setLockChecked] = useState(!Capacitor.isNativePlatform());
  useEffect(() => {
    readNativeLock().then((l) => { setNlock(l); setLockChecked(true); });
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) readNativeLock().then(setNlock); });
    return () => { sub.then((x) => x.remove()).catch(() => {}); };
  }, []);
  const lock = effectiveLock(content0, nlock);
  useEffect(() => {
    setLockForReport(lock);
    if (!nlock || nlock.at !== lock.at) storeNativeLock(lock); // so reminders also stop/resume with the app closed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.on, lock.at, lock.message]);
  useEffect(() => {
    if (!lock.on) return; // while off: check straight with GitHub every minute, so switching back on is quick
    const t = window.setInterval(() => { reloadContent0({ direct: true }); readNativeLock().then(setNlock); }, 60000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.on]);
  const quiet = (d: typeof data) => (lock.on ? { ...d, reminders: { ...d.reminders, meals: false, water: false, gym: false, weigh: false, punch: false, steps: false } } : d);
  const [tab, setTab] = useDraft<Tab>('app.tab', 'today');
  const [logger, setLogger] = useDraft<{ open: boolean; meal: Meal; date?: string }>('app.logger', { open: false, meal: 'breakfast' });
  const [settings, setSettings] = useDraft('app.settings', false);
  const [settingsUsed, setSettingsUsed] = useState(settings); // mount Settings once it's first opened
  useEffect(() => { if (settings) setSettingsUsed(true); }, [settings]);
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
  // Water nudges also follow today's drinks (next one counts from her last glass; none once the goal is hit).
  const td = today();
  const remKey = ready && data.onboarded ? JSON.stringify([data.reminders, data.profile.gymDays, data.profile.name, data.weighIns.length && data.weighIns[data.weighIns.length - 1].date, td, mlOn(data, td), drinksOf(data, td).length, data.sessions.filter((s) => s.date === td && s.sets.length).length, content0.targets.water, lock.on]) : '';
  useEffect(() => {
    if (!remKey) return;
    setReminderContent(content0);
    const t = window.setTimeout(() => { syncReminders(quiet(data), { ask: false }).catch(() => {}); }, 1500);
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
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      // Rishu's edits first, so the upload right after carries the result (and the "applied" receipt).
      const n = await syncAdminOps(() => latest.current.data, update).catch(() => 0);
      if (n) { toast(`Rishu updated your log (${n} change${n === 1 ? '' : 's'})`); await new Promise((r) => setTimeout(r, 300)); }
      const { data: d, content: c } = latest.current; pushReport(buildReport(d, c)).catch(() => {});
    };
    const t = window.setInterval(tick, every);
    return () => window.clearInterval(t);
  }, [ready, data.onboarded, !!syncCfg, every]);
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    const now = () => { const { data: d, content: c } = latest.current; pushReport(buildReport(d, c)).catch(() => {}); };
    const pullThenPush = async () => {
      const n = await syncAdminOps(() => latest.current.data, update).catch(() => 0);
      if (n) { toast(`Rishu updated your log (${n} change${n === 1 ? '' : 's'})`); await new Promise((r) => setTimeout(r, 300)); }
      now();
    };
    const first = window.setTimeout(pullThenPush, 2500);
    const onShow = () => { if (document.visibilityState === 'visible') pullThenPush(); };
    document.addEventListener('visibilitychange', onShow);
    const onHide = () => { if (document.visibilityState === 'hidden') now(); };
    document.addEventListener('visibilitychange', onHide);
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) now(); });
    return () => { window.clearTimeout(first); document.removeEventListener('visibilitychange', onShow); document.removeEventListener('visibilitychange', onHide); sub.then((x) => x.remove()).catch(() => {}); };
  }, [ready, data.onboarded]);

  // Instant pushes from Rishu: a new plan → fetch it straight from GitHub; tap → open that tab.
  const { reloadContent } = useStore();
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    initPush({
      onReceived: (d) => { if (d.kind === 'lock') { readNativeLock().then(setNlock); reloadContent({ direct: true }); return; } if (d.kind === 'plan') reloadContent({ direct: true }).then((fresh) => { if (fresh) toast('New plan from Rishu is here'); }); },
      onTapped: (d) => {
        const t = (d.tab as Tab) || (d.kind === 'plan' ? 'workout' : 'today');
        setTab(t);
        if (d.kind === 'plan') reloadContent({ direct: true });
      },
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.onboarded]);

  // Load the other screens once the first one is on screen, so every tab still opens instantly.
  useEffect(() => {
    if (!ready) return;
    // One screen per quiet moment, so a quick first tap is never stuck behind the background loading.
    const queue = [loadWorkout, loadProgress, loadCycle, loadSettings];
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const next = () => { const f = queue.shift(); if (!f) return; f().finally(() => window.setTimeout(step, 250)); };
    const step = () => { if (w.requestIdleCallback) w.requestIdleCallback(next, { timeout: 3000 }); else next(); };
    const t = window.setTimeout(step, 1200);
    return () => { queue.length = 0; window.clearTimeout(t); };
  }, [ready]);

  // Keep every GIF in her plans (and their backups) on the phone, for gyms with no signal.
  const mediaKey = content0.plans.flatMap((p) => p.moves.flatMap((m) => [m.exId, m.alt?.exId || ''])).join() + content0.updatedAt;
  useEffect(() => {
    if (!ready) return;
    const ex = new Map(content0.exercises.map((e) => [e.id, e]));
    const list = content0.plans.flatMap((p) => p.moves.flatMap((m) => [m.exId, m.alt?.exId].filter(Boolean) as string[])).map((id) => gifSrc(ex.get(id))).filter(Boolean);
    const t = window.setTimeout(() => { cacheMedia(list); }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mediaKey]);

  // Keep the home-screen streak widget in step with her logs.
  useEffect(() => {
    if (ready && data.onboarded) { syncWidget(data); syncNightSteps(quiet(data)); syncWaterWidget(quiet(data), content0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data, content0, lock.on]);

  // Glasses she tapped on the water widget while the app was closed → into her log (on launch and every return).
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    const pull = async () => {
      const list = await takeWidgetDrinks();
      if (!list.length) return;
      update((d) => list.reduce((acc, x) => addDrink(acc, keyOf(new Date(x.at)), x.ml, x.at), d));
      const total = list.reduce((s, x) => s + x.ml, 0);
      toast(`${list.length === 1 ? 'Glass' : list.length + ' glasses'} from your widget added (+${total} ml)`);
    };
    pull(); refreshNotes();
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) { pull(); refreshNotes(); } });
    return () => { sub.then((x) => x.remove()).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.onboarded]);

  // Status / navigation bar icons follow light–dark mode.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => SystemBars.setStyle({ style: mq.matches ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Water reminder: "+250 ml" logs it, "In 30 min" snoozes, a plain tap opens the water sheet.
  const live = useRef({ data, content: content0 });
  live.current = { data, content: content0 };
  useEffect(() => {
    if (!ready || !data.onboarded || !Capacitor.isNativePlatform()) return;
    const sub = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const extra = (a.notification.extra || {}) as Record<string, string>;
      if (extra.kind !== 'water') return;
      const { data: dd, content: cc } = live.current;
      if (a.actionId === 'drink') drink(() => live.current.data, update, cc, waterPrefs(dd.reminders).cup);
      else if (a.actionId === 'later') { snoozeWater(dd, 30); toast('OK — reminding you in 30 min'); }
      else { setTab('today'); requestWater(); }
    });
    return () => { sub.then((s) => s.remove()).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.onboarded]);

  // com.rishu.sapnahealth://steps from the night notification → Today + steps sheet.
  useEffect(() => {
    if (!ready || !data.onboarded) return;
    const handle = (url?: string) => {
      if (url && /:\/\/steps/.test(url)) { setTab('today'); requestSteps(); }
      if (url && /:\/\/water/.test(url)) { setTab('today'); requestWater(); }
    };
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
  if (!ready || !lockChecked) view = <div className="app" style={{ background: 'var(--bg)' }} />;
  else if (lock.on) view = <LockScreen message={lock.message} />;
  else if (!data.onboarded) view = <div className="app"><Suspense fallback={null}><Onboarding /></Suspense><ToastHost /></div>;
  else view = (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <PullToRefresh key={tab} tab={tab} />
        {tab === 'today' && <Today />}
        {tab === 'food' && <FoodScreen />}
        <Suspense fallback={<div className="screen" />}>
          {tab === 'workout' && <WorkoutScreen autoStart={autoStart} onAutoStartHandled={() => setAutoStart(false)} />}
          {tab === 'cycle' && <CycleScreen />}
          {tab === 'progress' && <ProgressScreen />}
        </Suspense>

        <nav className="tabbar" aria-label="Main" data-acc={tab}>
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} data-acc={t.id} onClick={() => go(t.id)}>
              <Icon name={t.icon} size={22} stroke={tab === t.id ? 2.3 : 1.9} />
              {t.label}
            </button>
          ))}
        </nav>

        <FoodLogger open={logger.open} meal={logger.meal} date={logger.date} onClose={() => { clearDrafts('log.'); setLogger((l) => ({ ...l, open: false })); }} />
        {settingsUsed ? <Suspense fallback={null}><Settings open={settings} onClose={() => setSettings(false)} /></Suspense> : null}
        <ToastHost />
      </div>
    </NavCtx.Provider>
  );
  return <>{view}<Launch ready={ready} onboarded={data.onboarded} /></>;
}

/** The app is switched off by Rishu: a blank screen, with his one line of text if he wrote one. */
function LockScreen({ message }: { message: string }) {
  return (
    <div className="app" role="main" aria-label="Paused" style={{ background: '#000', display: 'grid', placeItems: 'center', padding: 32, minHeight: '100dvh' }}>
      {message ? <p style={{ color: '#e9e6ee', fontSize: 20, lineHeight: 1.5, textAlign: 'center', maxWidth: 320, whiteSpace: 'pre-wrap', margin: 0 }}>{message}</p> : null}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
