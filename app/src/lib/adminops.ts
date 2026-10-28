import { AppData, CycleDay, Food, FoodEntry, Meal, Profile, Reminders } from './types';
import { fetchAdminOps } from './sync';

/**
 * Edits Rishu makes on the admin page arrive here as a list of small, validated operations.
 * Each op has a unique id; applied ids are remembered (data.adminApplied) and reported back
 * through live sync so the admin page can show them as done and drop them.
 * Anything malformed is skipped — it can never corrupt her data.
 */
export interface AdminOp { id: string; at: number; kind: string; [k: string]: unknown }

const MEALS: Meal[] = ['breakfast', 'lunch', 'snacks', 'dinner'];
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

const PROFILE_KEYS: (keyof Profile)[] = ['name', 'heightCm', 'weightKg', 'activity', 'goal', 'gymDays', 'diet', 'avoid', 'cycleEnabled', 'cycleLen', 'periodLen', 'shareCycle'];
const REMINDER_KEYS: (keyof Reminders)[] = ['meals', 'water', 'gym', 'weigh', 'punch', 'punchTime', 'steps'];

function applyOne(d: AppData, op: AdminOp): AppData | null {
  switch (op.kind) {
    case 'food.upsert': {
      const e = (op.entry || {}) as Partial<FoodEntry>;
      const id = str(e.id, 80); if (!id) return null;
      const ex = d.food.find((f) => f.id === id);
      const patch: Partial<FoodEntry> = {};
      if (e.date !== undefined) { if (!isDate(e.date)) return null; patch.date = e.date; }
      if (e.meal !== undefined) { if (!MEALS.includes(e.meal as Meal)) return null; patch.meal = e.meal as Meal; }
      if (e.name !== undefined) { const n = str(e.name, 60); if (!n) return null; patch.name = n; }
      if (e.portion !== undefined) patch.portion = str(e.portion, 90) || '1 serving';
      if (e.mult !== undefined) { const m = num(e.mult, 0.05, 20); if (m === null) return null; patch.mult = m; }
      if (e.kcal !== undefined) { const k = num(e.kcal, 0, 5000); if (k === null) return null; patch.kcal = Math.round(k); }
      if (e.protein !== undefined) { const p = num(e.protein, 0, 500); if (p === null) return null; patch.protein = r1(p); }
      if (ex) return { ...d, food: d.food.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
      if (!patch.date || !patch.meal || !patch.name || patch.kcal === undefined) return null;
      const entry: FoodEntry = { id, date: patch.date, meal: patch.meal, foodId: str(e.foodId, 80) || 'rishu', name: patch.name, portion: patch.portion || '1 serving', mult: patch.mult ?? 1, kcal: patch.kcal, protein: patch.protein ?? 0, at: num(e.at, 0, 9e15) ?? Date.now() };
      return { ...d, food: [...d.food, entry] };
    }
    case 'food.delete': {
      const id = str(op.foodId, 80); if (!id) return null;
      return { ...d, food: d.food.filter((f) => f.id !== id) };
    }
    case 'water.set': case 'steps.set': {
      if (!isDate(op.date)) return null;
      const v = num(op.value, 0, op.kind === 'water.set' ? 40 : 200000); if (v === null) return null;
      const key = op.kind === 'water.set' ? 'water' : 'steps';
      const map = { ...d[key] }; if (v === 0) delete map[op.date]; else map[op.date] = Math.round(v);
      return { ...d, [key]: map };
    }
    case 'weigh.set': {
      if (!isDate(op.date)) return null;
      const rest = d.weighIns.filter((w) => w.date !== op.date);
      if (op.kg === null) return { ...d, weighIns: rest };
      const kg = num(op.kg, 25, 250); if (kg === null) return null;
      return { ...d, weighIns: [...rest, { date: op.date, kg: r1(kg) }].sort((a, b) => (a.date < b.date ? -1 : 1)) };
    }
    case 'session.delete': {
      const id = str(op.sessionId, 80); if (!id) return null;
      return { ...d, sessions: d.sessions.filter((s) => s.id !== id) };
    }
    case 'profile.patch': {
      const p = (op.patch || {}) as Record<string, unknown>; const out: Partial<Profile> = {};
      for (const k of PROFILE_KEYS) if (k in p) (out as Record<string, unknown>)[k] = p[k];
      if (out.name !== undefined && !str(out.name, 40)) return null;
      if (out.gymDays !== undefined && !(Array.isArray(out.gymDays) && out.gymDays.every((x) => Number.isInteger(x) && x >= 0 && x <= 6))) return null;
      return { ...d, profile: { ...d.profile, ...out } };
    }
    case 'reminders.patch': {
      const p = (op.patch || {}) as Record<string, unknown>; const out: Partial<Reminders> = {};
      for (const k of REMINDER_KEYS) if (k in p) {
        if (k === 'punchTime') { if (typeof p[k] === 'string' && /^\d{2}:\d{2}$/.test(p[k] as string)) out.punchTime = p[k] as string; }
        else if (typeof p[k] === 'boolean') (out as Record<string, unknown>)[k] = p[k];
      }
      return { ...d, reminders: { ...d.reminders, ...out } };
    }
    case 'customFood.upsert': {
      const f = (op.food || {}) as Partial<Food>;
      const id = str(f.id, 80), name = str(f.name, 60), kcal = num(f.kcal, 0, 5000);
      if (!id || !name || kcal === null) return null;
      const food: Food = { id, name, portion: str(f.portion, 90) || '1 serving', kcal: Math.round(kcal), protein: r1(num(f.protein, 0, 500) ?? 0), custom: true };
      return { ...d, customFoods: [...d.customFoods.filter((x) => x.id !== id), food] };
    }
    case 'customFood.delete': {
      const id = str(op.foodId, 80); if (!id) return null;
      return { ...d, customFoods: d.customFoods.filter((x) => x.id !== id) };
    }
    case 'cycle.set': {
      if (!isDate(op.date)) return null;
      const cyc = { ...d.cycle };
      if (op.day === null) delete cyc[op.date]; else cyc[op.date] = (op.day || {}) as CycleDay;
      return { ...d, cycle: cyc };
    }
    default:
      return null;
  }
}

export function applyAdminOps(d: AppData, ops: AdminOp[]): { data: AppData; applied: AdminOp[] } {
  const done = new Set(d.adminApplied || []);
  const applied: AdminOp[] = [];
  let cur = d;
  for (const op of [...ops].sort((a, b) => (a.at || 0) - (b.at || 0))) {
    if (!op || typeof op.id !== 'string' || done.has(op.id)) continue;
    const next = applyOne(cur, op);
    done.add(op.id); // malformed ops are marked handled too, so they don't retry forever
    if (next) { cur = next; applied.push(op); }
  }
  if (done.size === (d.adminApplied || []).length) return { data: d, applied };
  return { data: { ...cur, adminApplied: [...done].slice(-500) }, applied };
}

let busy = false;
/** Fetch Rishu's pending edits and apply them. Returns how many changed her data. */
export async function syncAdminOps(get: () => AppData, update: (fn: (d: AppData) => AppData) => void): Promise<number> {
  if (busy) return 0;
  busy = true;
  try {
    const ops = await fetchAdminOps();
    if (!ops || !ops.length) return 0;
    const seen = new Set(get().adminApplied || []);
    if (ops.every((o) => seen.has(String(o.id)))) return 0;
    let n = 0;
    update((d) => { const r = applyAdminOps(d, ops as AdminOp[]); n = r.applied.length; return r.data; });
    return n;
  } finally {
    busy = false;
  }
}
