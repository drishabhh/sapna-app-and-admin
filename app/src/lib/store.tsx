import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { BUNDLED, initialContent, refreshContent } from './content';
import { loadData, migrate, saveData } from './storage';
import { flushDrafts, initDrafts } from './drafts';
import { AppData, Content, emptyData, Exercise, Food } from './types';

interface Store {
  ready: boolean;
  data: AppData;
  content: Content;
  foods: Food[];
  exById: Record<string, Exercise>;
  update: (fn: (d: AppData) => AppData) => void;
  replaceAll: (d: AppData) => void;
  /** write to disk right now (use before clearing drafts that the data replaces) */
  saveNow: () => Promise<void>;
  contentFresh: boolean;
  /** fetch Rishu's latest plans/foods now; true if something new arrived */
  reloadContent: (opts?: { direct?: boolean }) => Promise<boolean>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AppData>(emptyData);
  const [content, setContent] = useState<Content>(BUNDLED);
  const [contentFresh, setFresh] = useState(false);
  const dataRef = useRef(data);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = undefined;
    return saveData(dataRef.current).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [d, c] = await Promise.all([loadData(), initialContent(), initDrafts()]);
      if (!alive) return;
      dataRef.current = d;
      setData(d);
      setContent(c);
      setReady(true);
      const fresh = await refreshContent(c);
      if (alive && fresh) {
        setContent(fresh);
        setFresh(true);
      }
    })();
    // Save immediately when the app goes to the background — never lose a log.
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { flush(); flushDrafts(); }
      else
        refreshContent(contentRef.current).then((fresh) => {
          if (fresh) {
            setContent(fresh);
            setFresh(true);
          }
        });
    });
    const onHide = () => { if (document.visibilityState === 'hidden') { flush(); flushDrafts(); } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      alive = false;
      sub.then((s) => s.remove()).catch(() => {});
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  const contentRef = useRef(content);
  contentRef.current = content;

  const update = useCallback((fn: (d: AppData) => AppData) => {
    const next = fn(dataRef.current);
    dataRef.current = next;
    setData(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  }, [flush]);

  const replaceAll = useCallback((d: AppData) => {
    const m = migrate(d);
    dataRef.current = m;
    setData(m);
    flush();
  }, [flush]);

  const foods = useMemo(() => {
    const ids = new Set(content.foods.map((f) => f.id));
    return [...content.foods, ...data.customFoods.filter((f) => !ids.has(f.id))];
  }, [content.foods, data.customFoods]);

  const exById = useMemo(() => Object.fromEntries(content.exercises.map((e) => [e.id, e])), [content.exercises]);

  const reloadContent = useCallback(async (opts: { direct?: boolean } = {}) => {
    const fresh = await refreshContent(contentRef.current, opts);
    if (fresh) { setContent(fresh); setFresh(true); return true; }
    return false;
  }, []);

  const value = useMemo(
    () => ({ ready, data, content, foods, exById, update, replaceAll, saveNow: flush, contentFresh, reloadContent }),
    [ready, data, content, foods, exById, update, replaceAll, flush, contentFresh, reloadContent],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
