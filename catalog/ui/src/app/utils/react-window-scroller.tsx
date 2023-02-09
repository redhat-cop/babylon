import { useRef, useEffect, useCallback } from 'react';
import throttle from 'lodash.throttle';

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

export const ReactWindowScroller = ({ children, throttleTime = 10, isGrid = false }): JSX.Element => {
  const ref = useRef();
  const outerRef = useRef();

  useEffect(() => {
    const handleWindowScroll = throttle(() => {
      const { offsetTop, offsetLeft } = outerRef.current || { offsetLeft: 0, offsetTop: 0 };
      const scrollTop = getScrollPosition('y') - offsetTop;
      const scrollLeft = getScrollPosition('x') - offsetLeft;
      // @ts-ignore: Object is possibly 'null'.
      if (isGrid && ref.current) ref.current.scrollTo({ scrollLeft, scrollTop });
      // @ts-ignore: Object is possibly 'null'.
      if (!isGrid && ref.current) ref.current.scrollTo(scrollTop);
    }, throttleTime);

    window.addEventListener('scroll', handleWindowScroll);
    return () => {
      handleWindowScroll.cancel();
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, [isGrid]);

  const onScroll = useCallback(
    ({ scrollLeft, scrollTop, scrollOffset, scrollUpdateWasRequested }) => {
      if (!scrollUpdateWasRequested) return;
      const top = getScrollPosition('y');
      const left = getScrollPosition('x');
      const { offsetTop, offsetLeft } = outerRef.current || { offsetLeft: 0, offsetTop: 0 };

      scrollOffset += Math.min(top, offsetTop);
      scrollTop += Math.min(top, offsetTop);
      scrollLeft += Math.min(left, offsetLeft);

      if (!isGrid && scrollOffset !== top) window.scrollTo(0, scrollOffset);
      if (isGrid && (scrollTop !== top || scrollLeft !== left)) {
        window.scrollTo(scrollLeft, scrollTop);
      }
    },
    [isGrid]
  );

  return children({
    ref,
    outerRef,
    style: {
      width: isGrid ? 'auto' : '100%',
      height: '100%',
      display: 'inline-block',
    },
    onScroll,
  });
};
