import React, { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { fetcher } from '@app/api';
import AnarchyGovernors from './AnarchyGovernors';

const TOTAL_PAGES = 4;

// Page N (0-based) has 2 governors and a continue token unless it is the last page.
function pageFor(path: string) {
  const match = path.match(/continue=page-(\d+)/);
  const index = match ? Number(match[1]) : 0;
  return {
    metadata: index < TOTAL_PAGES - 1 ? { continue: `page-${index + 1}` } : {},
    items: [0, 1].map((i) => ({
      apiVersion: 'anarchy.gpte.redhat.com/v1',
      kind: 'AnarchyGovernor',
      metadata: {
        name: `governor-${index}-${i}`,
        namespace: 'anarchy',
        uid: `uid-${index}-${i}`,
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      spec: {},
    })),
  };
}

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn(),
}));
jest.mock('@app/components/ProjectSelector', () => ({ __esModule: true, default: () => null }));
jest.mock('@app/components/Footer', () => ({ __esModule: true, default: () => null }));
jest.mock('@app/components/OpenshiftConsoleLink', () => ({ __esModule: true, default: () => null }));

function requestedPages(): Set<string> {
  return new Set(
    (fetcher as jest.Mock).mock.calls.map(([path]: [string]) => path.match(/continue=(page-\d+)/)?.[1] ?? 'page-0'),
  );
}

async function renderAt(url: string) {
  await act(async () => {
    render(
      <SWRConfig value={{ suspense: true, provider: () => new Map(), dedupingInterval: 0 }}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/admin/anarchygovernors"
              element={
                <Suspense fallback={<div>loading</div>}>
                  <AnarchyGovernors />
                </Suspense>
              }
            />
          </Routes>
        </MemoryRouter>
      </SWRConfig>,
    );
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('AnarchyGovernors fetch-all on search', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (fetcher as jest.Mock).mockReset().mockImplementation(async (path: string) => pageFor(path));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('only loads the first page when there is no search', async () => {
    await renderAt('/admin/anarchygovernors');
    await advance(30000);
    expect(requestedPages()).toEqual(new Set(['page-0']));
  });

  it('loads every page, one every 5s, when searching and results match', async () => {
    await renderAt('/admin/anarchygovernors?search=governor');
    expect(requestedPages()).toEqual(new Set(['page-0']));

    await advance(5000);
    expect(requestedPages()).toEqual(new Set(['page-0', 'page-1']));

    await advance(5000);
    await advance(5000);
    expect(requestedPages()).toEqual(new Set(['page-0', 'page-1', 'page-2', 'page-3']));
    expect(await screen.findByText('governor-3-1')).toBeTruthy();
  });

  it('loads every page immediately while the search has no matches yet', async () => {
    await renderAt('/admin/anarchygovernors?search=governor-3');
    for (let i = 0; i < 20; i++) {
      await advance(100);
    }
    expect(requestedPages()).toEqual(new Set(['page-0', 'page-1', 'page-2', 'page-3']));
    expect(await screen.findByText('governor-3-0')).toBeTruthy();
  });
});
