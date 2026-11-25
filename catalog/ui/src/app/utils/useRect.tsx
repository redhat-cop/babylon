import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import throttle from 'lodash.throttle';

const useEffectInEvent = (event: 'resize' | 'scroll', useCapture?: boolean, set?: () => void) => {
  useEffect(() => {
    set();
    window.addEventListener(event, set, useCapture);
    return () => window.removeEventListener(event, set, useCapture);
  }, [event, set, useCapture]);
};

export const useRect = <T extends HTMLDivElement>(): [DOMRect | undefined, RefObject<T>] => {
  const ref = useRef<T>(null);
  const [rect, setRect] = useState<DOMRect>();
  const set = useMemo(() => throttle(() => setRect(ref.current?.getBoundingClientRect()), 1000), [setRect]);

  useEffectInEvent('resize', false, set);
  useEffectInEvent('scroll', true, set);

  return [rect, ref];
};
