/**
 * "Show the label if it fits, otherwise just the icon."
 * Any element with `data-fit` and a `.lbl` child gets `icon-only` while its label would be cut off —
 * on narrow phones (Fold cover screen, small Samsungs) or with a large system font. The full label stays
 * as the accessible name, so screen readers still say "Workout", "All moves"…
 * The element's width must come from its layout (grid cell / flex share), not from the label.
 */
export function startFit(): void {
  if (typeof ResizeObserver === 'undefined') return;
  /** true when the label would be cut off (measured with the label shown) */
  const overflows = (el: HTMLElement) => {
    const lbl = el.querySelector<HTMLElement>('.lbl');
    if (!lbl) return false;
    const text = (lbl.textContent || '').trim();
    if (text && el.dataset.fitAria !== 'off') el.setAttribute('aria-label', text);
    el.classList.remove('icon-only');
    return lbl.scrollWidth > lbl.clientWidth + 1;
  };
  /** Elements sharing data-fit-group switch together (a tab bar is all labels or all icons, never a mix). */
  const check = (el: HTMLElement) => {
    const g = el.dataset.fitGroup;
    const members = g ? [...document.querySelectorAll<HTMLElement>(`[data-fit][data-fit-group="${g}"]`)] : [el];
    const over = members.map(overflows).some(Boolean);
    members.forEach((m) => m.classList.toggle('icon-only', over));
  };
  // Watch the element (its space changed) and its label (the font size changed: the label's height moves with it).
  const ro = new ResizeObserver((entries) => entries.forEach((e) => {
    const t = e.target as HTMLElement;
    check(t.hasAttribute('data-fit') ? t : (t.closest('[data-fit]') as HTMLElement) || t);
  }));
  const seen = new WeakSet<Element>();
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll<HTMLElement>('[data-fit]').forEach((el) => {
      if (!seen.has(el)) { seen.add(el); ro.observe(el); const l = el.querySelector('.lbl'); if (l) ro.observe(l); }
      check(el);
    });
  };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', later);
  document.fonts?.ready.then(later).catch(() => {});
  later();
}
