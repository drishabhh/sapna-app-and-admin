import { useEffect, useMemo, useRef } from 'react';
import { r1, totalsOn, uid } from '../lib/calc';
import { today } from '../lib/dates';
import { haptic } from '../lib/native';
import { useStore } from '../lib/store';
import { Food, Meal, MEALS } from '../lib/types';
import { Bar, FullSheet, Icon, Seg, Sheet, Stepper, toast } from '../ui';
import { TTL, useDraft } from '../lib/drafts';

const PORTIONS = [0.5, 1, 1.5, 2];
const portionLabel = (m: number) => (m === 0.5 ? '½' : m === 1.5 ? '1½' : String(m));

export function FoodLogger({ open, meal: initialMeal, date = today(), onClose }: { open: boolean; meal: Meal; date?: string; onClose: () => void }) {
  const { data, content, foods, update } = useStore();
  const [meal, setMeal] = useDraft<Meal>('log.meal', initialMeal, TTL.text);
  const [q, setQ] = useDraft('log.q', '', TTL.text);
  const [pick, setPick] = useDraft<Food | null>('log.pick', null, TTL.text);
  const [mult, setMult] = useDraft('log.mult', 1, TTL.text);
  const [creating, setCreating] = useDraft('log.creating', false, TTL.text);

  // Reset only when she opens the logger fresh — not when it is restored after Android killed the app.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) { setMeal(initialMeal); setQ(''); setPick(null); setCreating(false); }
    wasOpen.current = open;
  }, [open, initialMeal, setMeal, setQ, setPick, setCreating]);

  const t = totalsOn(data, date);
  const left = content.targets.kcal - t.kcal;

  // Recents: foods she logged most in the last 30 days, then her onboarding favourites.
  const recentIds = useMemo(() => {
    const counts: Record<string, number> = {};
    data.food.slice(-200).forEach((f) => (counts[f.foodId] = (counts[f.foodId] || 0) + 1));
    const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return [...new Set([...ranked, ...data.profile.favFoods])];
  }, [data.food, data.profile.favFoods]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) {
      const byId = Object.fromEntries(foods.map((f) => [f.id, f]));
      const rec = recentIds.map((id) => byId[id]).filter(Boolean) as Food[];
      return rec.length ? rec.slice(0, 12) : foods.slice(0, 12);
    }
    const words = s.split(/\s+/);
    return foods
      .map((f) => {
        const hay = `${f.name} ${(f.tags || []).join(' ')}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = (f.name.toLowerCase().startsWith(s) ? 0 : 1) + (recentIds.includes(f.id) ? -0.5 : 0);
        return { f, score };
      })
      .filter((x): x is { f: Food; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.f)
      .slice(0, 40);
  }, [q, foods, recentIds]);

  function add() {
    if (!pick) return;
    const kcal = Math.round(pick.kcal * mult);
    const protein = r1(pick.protein * mult);
    update((d) => ({
      ...d,
      food: [...d.food, { id: uid(), date, meal, foodId: pick.id, name: pick.name, portion: pick.portion, mult, kcal, protein, at: Date.now() }],
    }));
    haptic.success();
    toast(`Added ${pick.name} · ${kcal} kcal`);
    setPick(null);
    onClose();
  }

  const kcalNow = pick ? Math.round(pick.kcal * mult) : 0;
  const after = left - kcalNow;

  return (
    <>
      <FullSheet open={open} onClose={onClose} label="Add food" acc="food">
        <div style={{ padding: 'calc(var(--st) + 12px) 18px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row">
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
            <h1 className="h2" style={{ flex: 1 }}>Add food</h1>
            <span className="small muted"><strong className="acc-t">{Math.max(0, left)}</strong> kcal left</span>
          </div>
          <Seg<Meal> label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ v: m.id, l: m.label }))} />
          <label className="search">
            <Icon name="search" size={20} />
            <span className="sr">Search foods</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roti, dal, paneer…" enterKeyHint="search" />
            {q ? <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={16} /></button> : null}
          </label>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px calc(var(--sb) + 24px)' }}>
          <p className="eyebrow" style={{ margin: '6px 0 10px' }}>{q ? `${results.length} match${results.length === 1 ? '' : 'es'}` : recentIds.length ? 'Your usuals' : 'Popular'}</p>
          <div className="stack" style={{ gap: 8 }}>
            {results.map((f) => (
              <button key={f.id} type="button" className="list-row" onClick={() => { haptic.tap(); setPick(f); setMult(1); }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{f.name}{f.protein >= 12 ? <span className="pill">High protein</span> : null}</strong>
                  <span className="small muted">{f.portion} · {f.kcal} kcal · {f.protein} g protein</span>
                </span>
                <span className="icon-btn solid" aria-hidden="true" style={{ width: 40, height: 40 }}><Icon name="plus" size={18} stroke={2.6} /></span>
              </button>
            ))}
            {q && results.length === 0 ? (
              <div className="empty stack" style={{ gap: 10 }}>
                <strong style={{ color: 'var(--text)' }}>"{q}" isn't in your library yet</strong>
                <span>Add it once with calories and protein — it'll show up next time.</span>
                <button type="button" className="btn sm" style={{ alignSelf: 'center' }} onClick={() => setCreating(true)}>Create “{q}”</button>
              </div>
            ) : null}
            {!q ? <button type="button" className="btn quiet" onClick={() => setCreating(true)}>+ Create a custom food</button> : null}
          </div>
        </div>
      </FullSheet>

      <Sheet open={!!pick} onClose={() => setPick(null)} label="Pick portion">
        {pick ? (
          <div className="stack" data-acc="food" style={{ gap: 16 }}>
            <div>
              <p className="eyebrow">Adding to {MEALS.find((m) => m.id === meal)?.label}</p>
              <h2 className="h1" style={{ fontSize: 34, marginTop: 4 }}>{pick.name}</h2>
              <p className="muted">1 = {pick.portion} · {pick.kcal} kcal</p>
            </div>
            <div role="group" aria-label="Portion" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
              {PORTIONS.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={mult === m} style={{ justifyContent: 'center', borderRadius: 14, minHeight: 50, fontSize: 16 }} onClick={() => { haptic.tap(); setMult(m); }}>{portionLabel(m)}×</button>
              ))}
            </div>
            <Stepper label="portion" value={mult} step={0.25} min={0.25} max={10} decimals={2} unit="×" onChange={setMult} />
            <div className="grid2">
              <div className="card tight"><p className="eyebrow">Calories</p><div className="big" style={{ fontSize: 34 }}>{kcalNow}</div></div>
              <div className="card tight"><p className="eyebrow">Protein</p><div className="big acc-t" style={{ fontSize: 34 }}>{r1(pick.protein * mult)}<span style={{ fontSize: 16 }}> g</span></div></div>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="between small"><strong>After this</strong><span className={after < 0 ? '' : 'muted'} style={after < 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{after >= 0 ? `${after} kcal left` : `${-after} kcal over`}</span></div>
              <Bar value={t.kcal + kcalNow} max={content.targets.kcal} label={`Day total after adding: ${t.kcal + kcalNow} of ${content.targets.kcal} kcal`} color={after < 0 ? 'var(--danger)' : undefined} />
            </div>
            <button type="button" className="btn lg block" onClick={add}>Add {portionLabel(mult)}× · {kcalNow} kcal</button>
          </div>
        ) : null}
      </Sheet>

      <CustomFoodSheet open={creating} initialName={q} onClose={() => setCreating(false)} onCreated={(f) => { setCreating(false); setPick(f); setMult(1); }} />
    </>
  );
}

const JSON_TEMPLATE = `[
  { "name": "Besan chilla", "portion": "1 piece", "kcal": 180, "protein": 9 },
  { "name": "Masala oats", "portion": "1 bowl", "kcal": 210, "protein": 7, "carbs": 32, "fat": 5 }
]`;

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return NaN;
};
const pickKey = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase().replace(/[\s_-]/g, ''))) return o[k];
  return undefined;
};

/** Accepts one food, a list, or {foods:[...]}; tolerant of ```json fences and "180 kcal" style values. */
export function parseFoodJson(text: string): { foods: Food[]; errors: string[] } {
  const errors: string[] = [];
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!clean) return { foods: [], errors };
  let j: unknown;
  try {
    j = JSON.parse(clean);
  } catch (e) {
    return { foods: [], errors: ['That isn’t valid JSON yet — check commas and quotes.'] };
  }
  const list = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { foods?: unknown }).foods) ? (j as { foods: unknown[] }).foods : [j];
  const foods: Food[] = [];
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') { errors.push(`Item ${i + 1}: not an object`); return; }
    const o = raw as Record<string, unknown>;
    const name = String(pickKey(o, ['name', 'food', 'item', 'title']) ?? '').trim();
    const kcal = num(pickKey(o, ['kcal', 'calories', 'cal', 'energy', 'energykcal']));
    const protein = num(pickKey(o, ['protein', 'proteing', 'proteingrams']) ?? 0);
    const portion = String(pickKey(o, ['portion', 'serving', 'servingsize', 'quantity', 'qty']) ?? '1 serving').trim() || '1 serving';
    if (!name) { errors.push(`Item ${i + 1}: missing "name"`); return; }
    if (!Number.isFinite(kcal) || kcal <= 0 || kcal > 5000) { errors.push(`${name}: "kcal" should be a number`); return; }
    const opt = (keys: string[]) => { const v = num(pickKey(o, keys)); return Number.isFinite(v) && v >= 0 ? r1(v) : undefined; };
    foods.push({
      id: 'custom-' + uid(),
      name: name.slice(0, 60),
      portion: portion.slice(0, 90),
      kcal: Math.round(kcal),
      protein: Number.isFinite(protein) && protein >= 0 ? r1(protein) : 0,
      carbs: opt(['carbs', 'carbohydrates', 'carbsg']),
      fat: opt(['fat', 'fats', 'fatg', 'totalfat']),
      fiber: opt(['fiber', 'fibre', 'fiberg']),
      custom: true,
    });
  });
  if (foods.length > 50) return { foods: foods.slice(0, 50), errors: [...errors, 'Only the first 50 foods are used.'] };
  return { foods, errors };
}

function CustomFoodSheet({ open, initialName, onClose, onCreated }: { open: boolean; initialName: string; onClose: () => void; onCreated: (f: Food) => void }) {
  const { update } = useStore();
  const [mode, setMode] = useDraft<'form' | 'json'>('log.cf.mode', 'form', TTL.text);
  const [name, setName] = useDraft('log.cf.name', '', TTL.text);
  const [portion, setPortion] = useDraft('log.cf.portion', '1 serving', TTL.text);
  const [kcal, setKcal] = useDraft('log.cf.kcal', '', TTL.text);
  const [protein, setProtein] = useDraft('log.cf.protein', '', TTL.text);
  const [json, setJson] = useDraft('log.cf.json', '', TTL.text);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) { setName(initialName); setPortion('1 serving'); setKcal(''); setProtein(''); setJson(''); setMode('form'); }
    wasOpen.current = open;
  }, [open, initialName, setName, setPortion, setKcal, setProtein, setJson, setMode]);
  const k = Number(kcal);
  const p = Number(protein || 0);
  const ok = name.trim() && Number.isFinite(k) && k > 0 && Number.isFinite(p) && p >= 0;
  const parsed = useMemo(() => parseFoodJson(json), [json]);
  function save() {
    if (!ok) return;
    const f: Food = { id: 'custom-' + uid(), name: name.trim(), portion: portion.trim() || '1 serving', kcal: Math.round(k), protein: r1(p), custom: true };
    update((d) => ({ ...d, customFoods: [...d.customFoods, f] }));
    toast(`${f.name} saved to your library`);
    onCreated(f);
  }
  function saveJson() {
    const fs = parsed.foods;
    if (!fs.length) return;
    update((d) => {
      const byName = new Map(d.customFoods.map((x) => [x.name.toLowerCase(), x]));
      // Same name again = update it instead of adding a duplicate.
      for (const f of fs) { const prev = byName.get(f.name.toLowerCase()); byName.set(f.name.toLowerCase(), prev ? { ...f, id: prev.id } : f); }
      return { ...d, customFoods: [...byName.values()] };
    });
    haptic.success();
    if (fs.length === 1) { toast(`${fs[0].name} saved to your library`); onCreated(fs[0]); }
    else { toast(`${fs.length} foods saved to your library`); onClose(); }
  }
  return (
    <Sheet open={open} onClose={onClose} label="Create custom food">
      <div className="stack" data-acc="food" style={{ gap: 14 }}>
        <h2 className="h2">New food</h2>
        <Seg<'form' | 'json'> label="How to add" value={mode} onChange={setMode} options={[{ v: 'form', l: 'Type it' }, { v: 'json', l: 'Paste JSON' }]} />
        {mode === 'form' ? (
          <>
            <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Besan chilla" /></label>
            <label className="field">Portion<input className="input" value={portion} onChange={(e) => setPortion(e.target.value)} placeholder="1 piece / 1 katori" /></label>
            <div className="grid2">
              <label className="field">Calories<input className="input" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="kcal" /></label>
              <label className="field">Protein (g)<input className="input" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="g" /></label>
            </div>
            <p className="small muted">Tip: check the pack label, "per serving" row.</p>
            <button type="button" className="btn lg block" disabled={!ok} onClick={save}>Save & pick portion</button>
          </>
        ) : (
          <>
            <p className="small muted">Paste one food or a list. Ask any AI: <em>“Give me nutrition for besan chilla as JSON with name, portion, kcal, protein.”</em></p>
            <label className="field">JSON
              <textarea className="input json-box" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={json} onChange={(e) => setJson(e.target.value)} placeholder={JSON_TEMPLATE} />
            </label>
            {json.trim() ? (
              <div className="stack" style={{ gap: 6 }} aria-live="polite">
                {parsed.foods.map((f) => (
                  <div key={f.id} className="between small"><span><strong>{f.name}</strong> <span className="muted">· {f.portion}</span></span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{f.kcal} kcal · {f.protein} g</span></div>
                ))}
                {parsed.errors.map((e) => <p key={e} className="small" style={{ color: 'var(--danger)' }}>{e}</p>)}
              </div>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setJson(JSON_TEMPLATE)}>Fill an example</button>
            )}
            <button type="button" className="btn lg block" disabled={!parsed.foods.length} onClick={saveJson}>
              {parsed.foods.length > 1 ? `Save ${parsed.foods.length} foods` : 'Save & pick portion'}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
