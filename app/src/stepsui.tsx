import { useCallback, useEffect } from 'react';
import { connectSteps, mergeSteps, openHealthSettings, readSteps, stepsAllowed, type ConnectResult } from './lib/health';
import { useStore } from './lib/store';
import { toast } from './ui';

/** Connect Samsung Health steps (Health Connect). Turns the 11:30 pm "log your steps" nudge off — no need any more. */
export function useLinkSteps() {
  const { update } = useStore();
  return useCallback(async (): Promise<ConnectResult> => {
    const r = await connectSteps();
    if (r === 'ok') {
      update((x) => ({ ...x, health: { on: true }, reminders: { ...x.reminders, steps: false } }));
      const hc = await readSteps(14);
      if (hc) update((x) => mergeSteps(x, hc) || x);
      toast('Connected — steps now come in by themselves 👟');
    } else if (r === 'missing') {
      toast('Health Connect needs installing or updating first');
      openHealthSettings();
    } else if (r === 'denied') {
      toast('Allow “Steps” for Sapna Health in Health Connect, then try again');
      openHealthSettings();
    }
    return r;
  }, [update]);
}

export function useUnlinkSteps() {
  const { update } = useStore();
  return useCallback(() => {
    update((x) => ({ ...x, health: { on: false }, reminders: { ...x.reminders, steps: true } }));
    toast('Disconnected — the 11:30 pm steps check is back on');
  }, [update]);
}

/** While connected: pull steps when the app opens, comes back to the front, and every 5 minutes while open. */
export function useStepsSync() {
  const { ready, data, update } = useStore();
  const on = ready && !!data.health?.on;
  useEffect(() => {
    if (!on) return;
    let busy = false;
    const pull = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        if (!(await stepsAllowed())) { update((x) => ({ ...x, health: { on: false }, reminders: { ...x.reminders, steps: true } })); return; } // permission removed in Health Connect
        const hc = await readSteps(7);
        if (hc) update((x) => mergeSteps(x, hc) || x);
      } finally { busy = false; }
    };
    pull();
    const t = window.setInterval(pull, 5 * 60_000);
    document.addEventListener('visibilitychange', pull);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', pull); };
  }, [on, update]);
}
