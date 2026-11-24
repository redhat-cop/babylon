import { useCallback, useEffect, useRef } from 'react';

type Pending<T> = { resolve: (value: T) => void; reject: (reason: unknown) => void };

/**
 * Returns a stable debounced version of `inner`. Each call restarts the timer; when it fires,
 * `inner` runs once with the latest arguments and every promise returned since the previous run
 * settles with that result (or rejects with its error).
 *
 * The latest `inner` passed on render is the one invoked, so callbacks that close over props or
 * state never go stale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebounce<T>(inner: (...args: any[]) => T, ms = 0): (...args: unknown[]) => Promise<Awaited<T>> {
  const innerRef = useRef(inner);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<Pending<Awaited<T>>[]>([]);

  useEffect(() => {
    innerRef.current = inner;
  });

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (...args: unknown[]) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const pending = pendingRef.current;
        pendingRef.current = [];
        try {
          const result = await innerRef.current(...args);
          pending.forEach((p) => p.resolve(result));
        } catch (error) {
          pending.forEach((p) => p.reject(error));
        }
      }, ms);
      return new Promise<Awaited<T>>((resolve, reject) => pendingRef.current.push({ resolve, reject }));
    },
    [ms],
  );
}

export default useDebounce;
