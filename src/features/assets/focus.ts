import { useEffect } from 'react';

const GRID_STOP = '.vgrid [role="gridcell"][tabindex="0"]';

/** The grid's single tab stop, or the search box if there is no grid. */
export function focusGrid(): void {
  (
    document.querySelector<HTMLElement>(GRID_STOP) ??
    document.querySelector<HTMLElement>('.search')
  )?.focus();
}

/** Puts focus back on one card. If it is gone, falls back instead of dropping to the page body. */
export function focusAssetCell(id: string): void {
  const cell = document.querySelector<HTMLElement>(`[role="gridcell"][data-asset-id="${id}"]`);
  if (cell) cell.focus();
  else focusGrid();
}

/**
 * If the focused element is removed from the page (a bulk bar closing, a notice
 * dismissed, a list swapped for a skeleton), the browser sends focus to <body>.
 * This notices that and moves focus somewhere useful instead.
 * A normal blur clears the memory, so clicking on empty space is not undone.
 */
export function useFocusRescue(): void {
  useEffect(() => {
    let last: Element | null = null;
    const onFocusIn = (e: FocusEvent) => {
      last = e.target instanceof Element ? e.target : null;
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.isConnected) last = null;
    };
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (last && !last.isConnected && (!active || active === document.body)) {
        last = null;
        focusGrid();
      }
    });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      observer.disconnect();
    };
  }, []);
}