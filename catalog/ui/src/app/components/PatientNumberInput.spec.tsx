import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PatientNumberInput from './PatientNumberInput';

jest.mock('@app/utils/useSession', () => () => ({ getSession: () => ({ isAdmin: false }) }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each(['31', '-1', '2.5', ''])('rejects invalid input %s and cancels pending changes', (invalid) => {
  const onChange = jest.fn();
  render(<PatientNumberInput min={0} max={30} value={20} onChange={onChange} rejectOutOfRange />);
  fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: invalid } });
  fireEvent.blur(screen.getByRole('spinbutton'));
  act(() => jest.advanceTimersByTime(1000));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('The change was not saved');
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } });
  act(() => jest.advanceTimersByTime(1000));
  expect(onChange).toHaveBeenCalledWith(25);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('aggregates consecutive changes into one save', () => {
  const onChange = jest.fn();
  render(<PatientNumberInput min={0} max={30} value={20} onChange={onChange} rejectOutOfRange />);
  fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
  fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
  act(() => jest.advanceTimersByTime(1000));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(22);
});

test('cancels pending saves when locked and synchronizes external count changes', () => {
  const onChange = jest.fn();
  const { rerender } = render(<PatientNumberInput max={85} value={85} onChange={onChange} rejectOutOfRange />);
  fireEvent.click(screen.getByRole('button', { name: 'Minus' }));
  rerender(<PatientNumberInput max={85} value={85} onChange={onChange} rejectOutOfRange isDisabled />);
  act(() => jest.advanceTimersByTime(1000));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('spinbutton')).toHaveValue(85);
  rerender(<PatientNumberInput max={90} value={90} onChange={onChange} rejectOutOfRange />);
  expect(screen.getByRole('spinbutton')).toHaveValue(90);
});

test('cancels pending saves on unmount', () => {
  const onChange = jest.fn();
  const { unmount } = render(<PatientNumberInput max={30} value={20} onChange={onChange} rejectOutOfRange />);
  fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
  unmount();
  act(() => jest.advanceTimersByTime(1000));
  expect(onChange).not.toHaveBeenCalled();
});

test('preserves default clamping for other callers', () => {
  const onChange = jest.fn();
  render(<PatientNumberInput min={0} max={30} value={20} onChange={onChange} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '31' } });
  act(() => jest.advanceTimersByTime(1000));
  expect(onChange).toHaveBeenCalledWith(30);
});
