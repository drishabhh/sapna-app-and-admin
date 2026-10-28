import { useEffect, useState } from 'react';
import { mealTotals, r1 } from './lib/calc';
import { haptic } from './lib/native';
import { useStore } from './lib/store';
import { FoodEntry, Meal, MEALS } from './lib/types';
import { useNav } from './nav';
import { Icon, Seg, Sheet, Stepper, toast } from './ui';

/**
 * Edit a logged food fully: which meal, portion, calories, protein, name — or remove it.
 * Portion changes rescale kcal/protein until she types her own numbers.
 */
export function FoodEditSheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const { update } = useStore();
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [mult, setMult] = useState(1);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setMeal(entry.meal); setMult(entry.mult || 1); setName(entry.name);
    setKcal(String(entry.kcal)); setProtein(String(entry.protein)); setManual(false);
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return <Sheet open={false} onClose={onClose} label="Edit food">{null}</Sheet>;
  const per = { kcal: entry.kcal / (entry.mult || 1), protein: entry.protein / (entry.mult || 1) };

  function changeMult(m: number) {
    setMult(m);
    if (!manual) { setKcal(String(Math.round(per.kcal * m))); setProtein(String(r1(per.protein * m))); }
  }
  function save() {
    const k = Math.round(Number(kcal)), p = r1(Number(protein));
    if (!name.trim()) return toast('Give it a name');
    if (!Number.isFinite(k) || k < 0 || k > 5000) return toast('Calories should be a number');
    if (!Number.isFinite(p) || p < 0 || p > 500) return toast('Protein should be a number');
    const id = entry!.id;
    update((d) => ({ ...d, food: d.food.map((f) => (f.id === id ? { ...f, meal, mult, name: name.trim().slice(0, 60), kcal: k, protein: p } : f)) }));
    haptic.success(); toast('Saved'); onClose();
  }
  function remove() {
    const id = entry!.id, n = entry!.name;
    update((d) => ({ ...d, food: d.food.filter((f) => f.id !== id) }));
    toast(`Removed ${n}`); onClose();
  }

  return (
    <Sheet open onClose={onClose} label="Edit food">
      <div className="stack" style={{ gap: 14 }} data-acc="food">
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <Seg<Meal> label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ v: m.id, l: m.label }))} />
        <div className="field">Portion <span className="small muted">(1× = {entry.portion})</span>
          <Stepper label="portion" value={mult} step={0.25} min={0.25} max={10} decimals={2} unit="×" onChange={changeMult} />
        </div>
        <div className="grid2">
          <label className="field">Calories<input className="input" inputMode="numeric" value={kcal} onChange={(e) => { setManual(true); setKcal(e.target.value.replace(/[^0-9.]/g, '')); }} /></label>
          <label className="field">Protein (g)<input className="input" inputMode="decimal" value={protein} onChange={(e) => { setManual(true); setProtein(e.target.value.replace(/[^0-9.]/g, '')); }} /></label>
        </div>
        <button type="button" className="btn lg block" onClick={save}>Save changes</button>
        <button type="button" className="btn ghost block" style={{ color: 'var(--danger)' }} onClick={remove}><Icon name="trash" size={18} /> Remove from log</button>
      </div>
    </Sheet>
  );
}

/** Today → tap a meal: everything she logged in it, tap one to edit, or add more. */
export function MealSheet({ date, meal, onClose }: { date: string; meal: Meal | null; onClose: () => void }) {
  const { data } = useStore();
  const nav = useNav();
  const [edit, setEdit] = useState<FoodEntry | null>(null);
  if (!meal) return null;
  const mt = mealTotals(data, date, meal);
  const label = MEALS.find((m) => m.id === meal)?.label || meal;
  return (
    <>
      <Sheet open={!edit} onClose={onClose} label={label}>
        <div className="stack" style={{ gap: 10 }} data-acc="food">
          <div className="between"><h2 className="h2">{label}</h2><span className="small muted">{mt.kcal} kcal · {mt.protein} g</span></div>
          {mt.entries.length ? mt.entries.map((e) => (
            <button key={e.id} type="button" className="list-row" style={{ textAlign: 'left' }} onClick={() => setEdit(e)}>
              <span style={{ flex: 1, minWidth: 0 }}><strong>{e.name}</strong><span className="small muted" style={{ display: 'block' }}>{e.mult !== 1 ? `${e.mult}× ` : ''}{e.portion} · {e.protein} g protein</span></span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{e.kcal} <span className="small muted">kcal</span></span>
              <Icon name="edit" size={18} />
            </button>
          )) : <p className="muted">Nothing logged yet.</p>}
          <button type="button" className="btn block" onClick={() => { onClose(); nav.openLogger(meal, date); }}><Icon name="plus" size={18} /> Add food</button>
        </div>
      </Sheet>
      <FoodEditSheet entry={edit} onClose={() => setEdit(null)} />
    </>
  );
}
