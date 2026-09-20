import { useEffect, useRef, useState } from 'react';

/**
 * The input shows `draft` immediately. After `delay` ms without typing,
 * the draft is committed to the URL. If the URL changes from outside
 * (Back/Forward, reload), the draft adopts it.
 */
export function useSearchDraft(
  urlQ: string,
  commit: (q: string) => void,
  delay = 300,
) {
  const [draft, setDraft] = useState(urlQ);
  const committed = useRef(urlQ); // the last value we know the URL holds
  const commitRef = useRef(commit);
  commitRef.current = commit; // always call the latest, without re-arming the timer

  // External change: adopt it. Our own commits already match `committed`, so they are ignored.
  useEffect(() => {
    if (urlQ !== committed.current) {
      committed.current = urlQ;
      setDraft(urlQ);
    }
  }, [urlQ]);

  // Debounced commit.
  useEffect(() => {
    if (draft === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draft;
      commitRef.current(draft);
    }, delay);
    return () => clearTimeout(timer); // every new keystroke cancels the pending commit
  }, [draft, delay]);

  return [draft, setDraft] as const;
}