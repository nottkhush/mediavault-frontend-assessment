import { useSyncExternalStore } from 'react';

/**
 * navigator.onLine is only trustworthy in one direction: false means there is
 * no network. True just means "probably", so a dead server still needs the
 * normal retry path.
 */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}