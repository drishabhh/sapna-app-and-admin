import { cycleInfo, type CycleInfo } from './calc';
import { today } from './dates';
import type { AppData, DietType } from './types';

/**
 * Cycle-smart guidance: what to train, eat and do for how she feels, by where she is in her cycle.
 * Written the way a good women's-health coach talks — general guidance, never rules: the research on
 * training by phase is mixed, so the main message everywhere is "listen to your body".
 */
export type Stage = 'period-early' | 'period' | 'follicular' | 'ovulation' | 'luteal' | 'pms';
export interface Guide {
  stage: Stage;
  label: string;
  headline: string;
  train: string;
  eat: string;
  feel: string;
  why: string;
  /** the gym coach keeps weights where they were today */
  ease: boolean;
}

const IRON: Record<string, string> = {
  veg: 'rajma, chana, palak and til-jaggery',
  egg: 'eggs, rajma, chana and palak',
  nonveg: 'eggs, chicken or fish, rajma and palak',
};
const PROTEIN_SNACK: Record<string, string> = {
  veg: 'roasted chana, curd or paneer',
  egg: 'boiled eggs, curd or roasted chana',
  nonveg: 'boiled eggs, curd or a chicken tikka',
};
const pick = (m: Record<string, string>, diet?: DietType) => m[diet === 'veg' ? 'veg' : diet === 'non' ? 'nonveg' : 'egg'] || m.egg;

export function stageOf(info: CycleInfo, d: AppData, on = today()): Stage {
  const flow = d.cycle[on]?.flow;
  if (info.phase === 'period') return info.day <= 2 || flow === 'heavy' ? 'period-early' : 'period';
  if (info.phase === 'luteal' && info.daysToNext <= 5) return 'pms';
  return info.phase;
}

export function guideFor(d: AppData, on = today()): Guide | null {
  if (!d.profile.cycleEnabled) return null;
  const info = cycleInfo(d, on);
  if (!info) return null;
  const stage = stageOf(info, d, on);
  const diet = d.profile.diet;
  const sym = d.cycle[on]?.symptoms || [];
  const low = sym.includes('Low energy') || sym.includes('Cramps');
  const G: Record<Stage, Omit<Guide, 'stage' | 'ease'>> = {
    'period-early': {
      label: 'Period', headline: 'Rest is training too',
      train: 'A walk, stretches or light weights are plenty. If you feel good, train — just don’t chase numbers today.',
      eat: `You lose iron now — have ${pick(IRON, diet)}, with lemon or amla so it absorbs better.`,
      feel: 'Heat on the lower belly and a gentle walk often ease cramps. Sleep early.',
      why: 'The first days of a period are when energy is usually lowest.',
    },
    period: {
      label: 'Period', headline: 'Ease back in',
      train: 'Your normal plan at last time’s weights. Stop a set early if something feels off.',
      eat: `Keep the iron coming — ${pick(IRON, diet)} — and protein at every meal.`,
      feel: 'Water and a short walk help with bloating.',
      why: 'Energy usually comes back as the period eases off.',
    },
    follicular: {
      label: 'Follicular', headline: 'Your strong window',
      train: 'A great week to chase a new best — the coach will nudge weights up when you’ve earned it.',
      eat: 'Eat to your targets; some carbs 1–2 hours before the gym (roti, banana, poha) fuel heavier sets.',
      feel: 'Energy and mood often feel best this week. Use it.',
      why: 'Rising estrogen tends to bring more energy and faster recovery.',
    },
    ovulation: {
      label: 'Ovulation', headline: 'Peak energy — warm up well',
      train: 'Heavy sets are fine. Take an extra warm-up set and keep knees tracking over toes on squats and lunges.',
      eat: 'Drink a little more water than usual.',
      feel: 'You may feel strongest now — enjoy it, with good form.',
      why: 'Some research links these days with looser ligaments, so control matters.',
    },
    luteal: {
      label: 'Luteal', headline: 'Steady and strong',
      train: 'Keep your weights; add a set if you feel good. Longer warm-up if your body feels warm and heavy.',
      eat: `Protein at every meal keeps cravings calmer — ${pick(PROTEIN_SNACK, diet)} make easy snacks.`,
      feel: 'Sleep can be lighter now — try a cooler room and no screen right before bed.',
      why: 'Progesterone raises body temperature a little and can make sessions feel harder.',
    },
    pms: {
      label: 'Luteal', headline: 'Pre-period days — be kind to yourself',
      train: 'Hold your weights, rest a bit longer between sets. Showing up is the win this week.',
      eat: `Hungrier is normal — your body burns a little more now. Reach for ${pick(PROTEIN_SNACK, diet)}; a couple of squares of dark chocolate is fine.`,
      feel: 'Less salt and packaged snacks help bloating; bananas, nuts and seeds bring magnesium.',
      why: 'In the days before a period, energy, mood and appetite often shift — it passes.',
    },
  };
  return { stage, ease: stage === 'period-early' || low, ...G[stage] };
}

/** Short help for what she logged today. */
export const SYMPTOM_TIPS: Record<string, string> = {
  Cramps: 'Heat on the lower belly and a gentle walk often help. Pain that stops your day isn’t normal — see a doctor about it.',
  Bloating: 'Go easy on salt and packaged snacks today; water and a 10-minute walk after meals help.',
  Headache: 'Drink a glass of water and rest your eyes. Skip heavy lifting if it pounds.',
  'Low energy': 'The coach keeps today’s weights where they were. Even 20 minutes counts.',
  'Mood swings': 'A walk outside and a proper night’s sleep help more than you’d think. Be gentle with yourself.',
  Cravings: 'Have a planned treat with some protein — curd with fruit, roasted chana, a little dark chocolate.',
  Acne: 'Wash off sweat soon after the gym, and keep a clean towel for the benches.',
  'Back pain': 'Two minutes of child’s pose and cat-cow. Skip heavy squats and deadlifts if the pain is sharp.',
  'Tender breasts': 'A well-fitting sports bra makes training far more comfortable.',
};

export function symptomTips(d: AppData, on = today()): { s: string; tip: string }[] {
  return (d.cycle[on]?.symptoms || []).filter((s) => SYMPTOM_TIPS[s]).map((s) => ({ s, tip: SYMPTOM_TIPS[s] }));
}
