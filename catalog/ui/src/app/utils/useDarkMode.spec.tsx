import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { DarkModeProvider } from './useDarkMode';
import useDarkMode from './useDarkMode';

const STORAGE_KEY = 'babylon-dark-mode';

const TestConsumer: React.FC = () => {
  const { darkMode, toggleDarkMode } = useDarkMode();
  return (
    <div>
      <span data-testid="mode">{darkMode ? 'dark' : 'light'}</span>
      <button onClick={toggleDarkMode} aria-label="Toggle dark mode">
        toggle
      </button>
    </div>
  );
};

describe('useDarkMode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  test('defaults to light mode', () => {
    render(
      <DarkModeProvider>
        <TestConsumer />
      </DarkModeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
  });

  test('toggles to dark mode and adds class to html element', async () => {
    render(
      <DarkModeProvider>
        <TestConsumer />
      </DarkModeProvider>,
    );
    fireEvent.click(screen.getByLabelText('Toggle dark mode'));
    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('dark');
      expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
    });
  });

  test('toggles back to light mode and removes class', async () => {
    render(
      <DarkModeProvider>
        <TestConsumer />
      </DarkModeProvider>,
    );
    fireEvent.click(screen.getByLabelText('Toggle dark mode'));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('dark'));
    fireEvent.click(screen.getByLabelText('Toggle dark mode'));
    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('light');
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
    });
  });

  test('persists preference in localStorage', async () => {
    render(
      <DarkModeProvider>
        <TestConsumer />
      </DarkModeProvider>,
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByLabelText('Toggle dark mode'));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('true'));
    fireEvent.click(screen.getByLabelText('Toggle dark mode'));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('false'));
  });

  test('restores dark mode from localStorage on mount', async () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    render(
      <DarkModeProvider>
        <TestConsumer />
      </DarkModeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('dark');
      expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
    });
  });

  test('does not set dark mode when localStorage value is not "true"', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    render(
      <DarkModeProvider>
        <TestConsumer />
      </DarkModeProvider>,
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
  });
});
