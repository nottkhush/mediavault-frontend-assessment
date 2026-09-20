import { useEffect, useRef, useState } from 'react';
import { useOnline } from '@/api/online';

export function ConnectionBanner() {
  const online = useOnline();
  const previous = useRef(online);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (previous.current === online) return;
    previous.current = online;
    if (!online) {
      setRecovered(false);
      return;
    }
    setRecovered(true);
    const timer = setTimeout(() => setRecovered(false), 4000);
    return () => clearTimeout(timer);
  }, [online]);

  if (!online) {
    return (
      <p className="banner banner--offline" role="status">
        You're offline. You can browse what's already loaded, but changes can't be saved until you
        reconnect.
      </p>
    );
  }
  if (recovered) {
    return (
      <p className="banner banner--online" role="status">
        Back online.
      </p>
    );
  }
  return null;
}