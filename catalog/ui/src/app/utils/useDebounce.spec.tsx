import { act, renderHook } from '@testing-library/react';
import useDebounce from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs inner once with the latest args and settles every pending promise with its result', async () => {
    const inner = jest.fn((v: string) => v.toUpperCase());
    const { result } = renderHook(() => useDebounce(inner, 1000));

    const promises: Promise<string>[] = [];
    for (const v of ['h', 'he', 'hel', 'hell', 'hello']) {
      act(() => {
        promises.push(result.current(v));
      });
      act(() => {
        jest.advanceTimersByTime(200);
      });
    }
    expect(inner).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledWith('hello');
    await expect(Promise.all(promises)).resolves.toEqual(['HELLO', 'HELLO', 'HELLO', 'HELLO', 'HELLO']);
  });

  it('invokes the latest inner callback, not the one from the first render', async () => {
    const { result, rerender } = renderHook(({ ticket }) => useDebounce(() => ticket, 100), {
      initialProps: { ticket: undefined as string | undefined },
    });
    rerender({ ticket: 'JIRA-1' });

    let promise: Promise<string | undefined>;
    act(() => {
      promise = result.current();
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await expect(promise).resolves.toBe('JIRA-1');
  });

  it('rejects every pending promise when inner throws', async () => {
    const error = new Error('boom');
    const { result } = renderHook(() =>
      useDebounce(async () => {
        throw error;
      }, 100),
    );

    let first: Promise<unknown>;
    let second: Promise<unknown>;
    act(() => {
      first = result.current();
      second = result.current();
    });
    const assertions = Promise.all([expect(first).rejects.toBe(error), expect(second).rejects.toBe(error)]);
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await assertions;
  });

  it('starts a new batch for calls made after a run has fired', async () => {
    const inner = jest.fn((v: number) => v);
    const { result } = renderHook(() => useDebounce(inner, 100));

    let first: Promise<number>;
    act(() => {
      first = result.current(1);
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    let second: Promise<number>;
    act(() => {
      second = result.current(2);
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending run on unmount', async () => {
    const inner = jest.fn();
    const { result, unmount } = renderHook(() => useDebounce(inner, 100));

    act(() => {
      result.current();
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(inner).not.toHaveBeenCalled();
  });

  it('returns a stable function across renders', () => {
    const { result, rerender } = renderHook(({ n }) => useDebounce(() => n, 100), { initialProps: { n: 1 } });
    const first = result.current;
    rerender({ n: 2 });
    expect(result.current).toBe(first);
  });
});
