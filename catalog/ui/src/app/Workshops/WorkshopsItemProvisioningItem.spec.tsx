import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CatalogItem, Workshop, WorkshopProvision } from '@app/types';
import { patchWorkshopProvision } from '@app/api';
import WorkshopsItemProvisioningItem from './WorkshopsItemProvisioningItem';

let mockAdmin = false;
let mockSfdc = false;
let mockCatalogItem: CatalogItem;
const mockMutate = jest.fn();
jest.mock('@app/utils/useSession', () => () => ({ getSession: () => ({ isAdmin: mockAdmin }) }));
jest.mock('@app/utils/useInterfaceConfig', () => () => ({ sfdc_enabled: mockSfdc }));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: mockCatalogItem }),
  useSWRConfig: () => ({ mutate: mockMutate }),
}));
jest.mock('@app/api', () => ({
  apiPaths: { CATALOG_ITEM: jest.fn(), WORKSHOP_PROVISIONS: jest.fn() },
  fetcher: jest.fn(),
  patchWorkshopProvision: jest.fn().mockResolvedValue({}),
}));
jest.mock('@app/components/OpenshiftConsoleLink', () => () => null);

function setup({ count = 1, locked = false, multi = false, salesforce = false } = {}) {
  const workshop = {
    apiVersion: 'babylon.gpte.redhat.com/v1',
    kind: 'Workshop',
    metadata: { name: 'event', labels: { 'demo.redhat.com/lock-enabled': String(locked) } },
    spec: { multiuserServices: multi },
  } as Workshop;
  const provision = {
    apiVersion: 'babylon.gpte.redhat.com/v1',
    kind: 'WorkshopProvision',
    metadata: { name: 'provision', namespace: 'workshops', labels: { 'babylon.gpte.redhat.com/workshop': 'event' } },
    spec: {
      workshopName: 'event',
      count,
      concurrency: 1,
      startDelay: 10,
      catalogItem: { name: 'item', namespace: 'catalog' },
      parameters: salesforce ? { salesforce_items: '[{"id":"opportunity"}]' } : {},
    },
  } as WorkshopProvision;
  return render(
    <MemoryRouter>
      <WorkshopsItemProvisioningItem workshop={workshop} workshopProvision={provision} />
    </MemoryRouter>,
  );
}

async function flushSave() {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAdmin = false;
  mockSfdc = false;
  mockCatalogItem = { metadata: { name: 'item', namespace: 'catalog' }, spec: {} } as CatalogItem;
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each([false, true])('saves a normal workshop count without Salesforce when enabled=%s', async (enabled) => {
  mockSfdc = enabled;
  setup();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
  await flushSave();
  expect(patchWorkshopProvision).toHaveBeenCalledWith(expect.objectContaining({ patch: { spec: { count: 20 } } }));
});

test('uses the same default limit of 40 as workshop creation', async () => {
  setup();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '40' } });
  await flushSave();
  expect(patchWorkshopProvision).toHaveBeenCalledWith(expect.objectContaining({ patch: { spec: { count: 40 } } }));
});

test.each([20, 30])('rejects edits above the catalog limit of %s without saving a clamped count', async (limit) => {
  mockCatalogItem.spec.workshopUiMaxInstances = limit;
  setup();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: String(limit + 1) } });
  fireEvent.blur(screen.getByRole('spinbutton'));
  await flushSave();
  expect(screen.getByRole('alert')).toHaveTextContent('The change was not saved');
  expect(screen.getByRole('spinbutton')).toHaveValue(1);
  expect(patchWorkshopProvision).not.toHaveBeenCalled();
});

test('decrements an ops-approved 85-instance event to 84', async () => {
  setup({ count: 85 });
  fireEvent.click(screen.getByRole('button', { name: 'Minus' }));
  await flushSave();
  expect(patchWorkshopProvision).toHaveBeenCalledWith(expect.objectContaining({ patch: { spec: { count: 84 } } }));
});

test('increments normally without Salesforce', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
  await flushSave();
  expect(patchWorkshopProvision).toHaveBeenCalledWith(expect.objectContaining({ patch: { spec: { count: 2 } } }));
});

test('prevents non-admin changes to a locked event', async () => {
  setup({ count: 85, locked: true });
  expect(screen.getByRole('spinbutton')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Minus' })).toBeDisabled();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
  await flushSave();
  expect(patchWorkshopProvision).not.toHaveBeenCalled();
});

test('allows admins to adjust locked events above the self-service limit', async () => {
  mockAdmin = true;
  setup({ count: 85, locked: true });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Workshop Instance Count' }), { target: { value: '86' } });
  await flushSave();
  expect(patchWorkshopProvision).toHaveBeenCalledWith(expect.objectContaining({ patch: { spec: { count: 86 } } }));
});

test.each([false, true])('preserves the multi-user Salesforce increase policy: Salesforce=%s', async (salesforce) => {
  mockSfdc = true;
  setup({ multi: true, salesforce });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
  await flushSave();
  if (salesforce) {
    expect(patchWorkshopProvision).toHaveBeenCalledWith(expect.objectContaining({ patch: { spec: { count: 5 } } }));
  } else {
    expect(patchWorkshopProvision).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  }
});
