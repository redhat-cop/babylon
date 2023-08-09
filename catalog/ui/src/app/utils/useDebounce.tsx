import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebounce(inner: (...args: any[]) => unknown, ms = 0): (...args: unknown[]) => Promise<unknown> {
  const [timer, setTimer] = useState(null);
  const [resolves, setResolves] = useState([]);
  const callbackRef = useRef((...args: unknown[]) => {
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
