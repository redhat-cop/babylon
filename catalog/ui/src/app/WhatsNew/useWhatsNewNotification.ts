import { useEffect, useState } from 'react';
import type { WhatsNewPage } from './useWhatsNew';

const NOTIFICATION_LIFETIME = 14 * 24 * 60 * 60 * 1000;

function readPageId(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function useWhatsNewNotification(latest: WhatsNewPage | undefined, user: string, pathname: string) {
  const key = `whats-new-read:${user}`;
  const [read, setRead] = useState(() => ({ key, id: readPageId(key) }));
  // eslint-disable-next-line @eslint-react/use-state -- value is unused by design: setClock is only a re-render trigger so hasUnread is re-evaluated at expiry
  const [, setClock] = useState(0);
  const readId = read.key === key ? read.id : readPageId(key);
  const createdAt = Date.parse(latest?.createdAt || '');
  const expiresAt = createdAt + NOTIFICATION_LIFETIME;
  const latestPath = latest ? `/whats-new/${encodeURIComponent(latest.id)}` : '/whats-new';
  const hasUnread = Boolean(
    // eslint-disable-next-line @eslint-react/purity -- must compare against the current time on each render; the setClock timer below re-renders at expiry for this
    user && latest && latest.id !== readId && createdAt <= Date.now() && Date.now() < expiresAt,
  );

  useEffect(() => {
    const sync = () => setRead({ key, id: readPageId(key) });
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- syncs read state from localStorage (external store) on key change, then on cross-tab storage events
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);

  useEffect(() => {
    if (!hasUnread) return undefined;
    const timer = window.setTimeout(() => setClock((value) => value + 1), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [hasUnread, expiresAt]);

  // Reading the newest page also clears the badge when opened directly or from the parent list.
  useEffect(() => {
    if (!user || !latest || pathname !== latestPath || readId === latest.id) return;
    try {
      localStorage.setItem(key, latest.id);
    } catch {
      // Keep the read state for this visit when browser storage is unavailable.
    }
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- marks the page read after writing localStorage when the user navigates to it; triggered by route change
    setRead({ key, id: latest.id });
  }, [key, user, latest, latestPath, pathname, readId]);

  return { hasUnread, target: hasUnread ? latestPath : '/whats-new' };
}
