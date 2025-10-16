import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebounce<T>(inner: (...args: any[]) => T, ms = 0): (...args: unknown[]) => Promise<T> {
  const [timer, setTimer] = useState(null);
  const [resolves, setResolves] = useState<((value: T) => void)[]>([]);
  const callbackRef = useRef<(...args: unknown[]) => Promise<T>>((...args: unknown[]) => {
    clearTimeout(timer);
    setTimer(
      setTimeout(() => {
        // Get the result of the inner function, then apply it to the resolve function of
        // each promise that has been created since the last time the inner function was run
        const result = inner(...args);
        resolves.forEach((r) => r(result));
        setResolves([]);
      }, ms),
    );

    return new Promise((r) => resolves.push(r));
  });
  useEffect(() => {
    return () => clearTimeout(timer);
  }, [timer]);

  return callbackRef.current;
}

export default useDebounce;
