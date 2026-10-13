import { act, renderHook } from '@testing-library/react';
import useWhatsNewNotification from './useWhatsNewNotification';
import type { WhatsNewPage } from './useWhatsNew';

const latest: WhatsNewPage = {
  id: 'new', title: 'New update', body: '', createdAt: '2026-10-12T12:00:00Z',
  lastUpdated: '2026-10-13T12:00:00Z', version: 1,
};

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-13T12:00:00Z'));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('targets the newest unread page, persists reading it, then targets the parent', () => {
  const { result, rerender, unmount } = renderHook(
    ({ path }) => useWhatsNewNotification(latest, 'alice', path),
    { initialProps: { path: '/catalog' } },
  );
  expect(result.current).toEqual({ hasUnread: true, target: '/whats-new/new' });
  rerender({ path: '/whats-new/new' });
  expect(result.current).toEqual({ hasUnread: false, target: '/whats-new' });
  expect(localStorage.getItem('whats-new-read:alice')).toBe('new');
  unmount();
  const revisit = renderHook(() => useWhatsNewNotification(latest, 'alice', '/catalog'));
  expect(revisit.result.current.hasUnread).toBe(false);
});

it('does not mark content read from the parent or an older page', () => {
  const { result, rerender } = renderHook(
    ({ path }) => useWhatsNewNotification(latest, 'alice', path),
    { initialProps: { path: '/whats-new' } },
  );
  expect(result.current.hasUnread).toBe(true);
  rerender({ path: '/whats-new/older' });
  expect(result.current.hasUnread).toBe(true);
});

it('expires at exactly 14 days, including while the site remains open', () => {
  jest.setSystemTime(new Date('2026-10-26T11:59:59Z'));
  const { result } = renderHook(() => useWhatsNewNotification(latest, 'alice', '/catalog'));
  expect(result.current.hasUnread).toBe(true);
  act(() => jest.advanceTimersByTime(1000));
  expect(result.current).toEqual({ hasUnread: false, target: '/whats-new' });
});

it.each(['2026-09-01T00:00:00Z', 'invalid', null, '2026-11-01T00:00:00Z'])(
  'does not notify for expired, invalid, missing, or future creation dates: %s', (createdAt) => {
    const { result } = renderHook(() => useWhatsNewNotification({ ...latest, createdAt }, 'alice', '/catalog'));
    expect(result.current.hasUnread).toBe(false);
  },
);

it('shows a new notification for a newly published page and keeps users separate', () => {
  localStorage.setItem('whats-new-read:alice', latest.id);
  const { result, rerender } = renderHook(
    ({ page, user }) => useWhatsNewNotification(page, user, '/catalog'),
    { initialProps: { page: latest, user: 'alice' } },
  );
  expect(result.current.hasUnread).toBe(false);
  rerender({ page: latest, user: 'bob' });
  expect(result.current.hasUnread).toBe(true);
  rerender({ page: { ...latest, id: 'newer' }, user: 'alice' });
  expect(result.current.target).toBe('/whats-new/newer');
});

it('keeps read state in memory if storage is blocked', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const { result, rerender } = renderHook(
    ({ path }) => useWhatsNewNotification(latest, 'alice', path),
    { initialProps: { path: '/catalog' } },
  );
  expect(result.current.hasUnread).toBe(true);
  rerender({ path: '/whats-new/new' });
  expect(result.current.hasUnread).toBe(false);
});
