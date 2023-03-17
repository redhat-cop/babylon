import React, { useRef, useEffect, useCallback, ReactElement } from 'react';
import throttle from 'lodash.throttle';
import { GridOnScrollProps } from 'react-window';

const windowScrollPositionKey = {
  y: 'pageYOffset',
  x: 'pageXOffset',
};

const documentScrollPositionKey = {
  y: 'scrollTop',
  x: 'scrollLeft',
};

const getScrollPosition = (axis: 'x' | 'y'): number =>
  window[windowScrollPositionKey[axis]] ||
  document.documentElement[documentScrollPositionKey[axis]] ||
  document.body[documentScrollPositionKey[axis]] ||
  0;

export const ReactWindowScroller: React.FC<{
  children: ({
    ref,
    outerRef,
    style,
    onScroll,
  }: {
    ref: React.RefObject<any>;
    outerRef: React.RefObject<any>;
    style: React.CSSProperties;
    onScroll: (props: GridOnScrollProps) => any;
  }) => ReactElement;
  throttleTime?: number;
}> = ({ children, throttleTime = 10 }) => {
  const ref = useRef(null);
  const outerRef = useRef(null);

  useEffect(() => {
    const handleWindowScroll = throttle(() => {
      const { offsetTop, offsetLeft } = outerRef.current || { offsetLeft: 0, offsetTop: 0 };
      const scrollTop = getScrollPosition('y') - offsetTop;
      const scrollLeft = getScrollPosition('x') - offsetLeft;
      if (ref.current) ref.current.scrollTo({ scrollLeft, scrollTop });
    }, throttleTime);

    window.addEventListener('scroll', handleWindowScroll);
    return () => {
      handleWindowScroll.cancel();
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, []);

  const onScroll = useCallback(({ scrollLeft, scrollTop, scrollUpdateWasRequested }: GridOnScrollProps) => {
    if (!scrollUpdateWasRequested) return;
    const top = getScrollPosition('y');
    const left = getScrollPosition('x');
    const { offsetTop, offsetLeft } = outerRef.current || { offsetLeft: 0, offsetTop: 0 };

    scrollTop += Math.min(top, offsetTop);
    scrollLeft += Math.min(left, offsetLeft);

    if (scrollTop !== top || scrollLeft !== left) {
      window.scrollTo(scrollLeft, scrollTop);
    }
  }, []);

  return children({
    ref,
    outerRef,
    style: {
      width: '100%',
      height: '100%',
      display: 'inline-block',
    },
    onScroll,
  });
};
