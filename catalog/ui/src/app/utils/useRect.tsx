import { RefObject, useEffect, useRef, useState } from 'react';

const useEffectInEvent = (event: 'resize' | 'scroll', useCapture?: boolean, set?: () => void) => {
  useEffect(() => {
    set();
    window.addEventListener(event, set, useCapture);
    return () => window.removeEventListener(event, set, useCapture);
  }, []);
};

export const useRect = <T extends HTMLDivElement>(): [DOMRect | undefined, RefObject<T>] => {
  const ref = useRef<T>(null);
  const [rect, setRect] = useState<DOMRect>();

  const set = () => setRect(ref.current?.getBoundingClientRect());

  useEffectInEvent('resize', false, set);
  useEffectInEvent('scroll', true, set);

  return [rect, ref];
};
