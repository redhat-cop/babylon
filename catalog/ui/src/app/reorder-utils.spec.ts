import {
  canReorderResourceClaim,
  getResourceClaimReorderSchedule,
  getWorkshopReorderSchedule,
  getInitialReorderSchedule,
  getStopMaxDate,
  getStopMinDate,
  isNoAutoStop,
  isValidReorderSchedule,
} from './reorder-utils';
import { CatalogItem, ResourceClaim, Workshop } from '@app/types';
import parseDuration from 'parse-duration';

const catalogItem: CatalogItem = {
  apiVersion: 'babylon.gpte.redhat.com/v1',
  kind: 'CatalogItem',
  metadata: {
    name: 'test-item',
    namespace: 'catalog',
  },
  spec: {
    displayName: 'Test Item',
  },
} as CatalogItem;

const resourceClaim: ResourceClaim = {
  apiVersion: 'poolboy.gpte.redhat.com/v1',
  kind: 'ResourceClaim',
  metadata: {
    name: 'test-item-abc12',
    namespace: 'user-namespace',
    labels: {
      'babylon.gpte.redhat.com/catalogItemName': 'test-item',
      'babylon.gpte.redhat.com/catalogItemNamespace': 'catalog',
    },
    annotations: {
      'demo.redhat.com/purpose': 'QA',
    },
  },
  spec: {
    lifespan: {
      start: '2026-05-28T10:00:00Z',
      end: '2026-05-31T10:00:00Z',
    },
    provider: {
      name: 'test-item',
      parameterValues: {
        purpose: 'QA',
        stop_timestamp: '2026-05-28T18:00:00Z',
      },
    },
  },
} as ResourceClaim;

const workshop: Workshop = {
  apiVersion: 'babylon.gpte.redhat.com/v1',
  kind: 'Workshop',
  metadata: {
    name: 'test-workshop-abc12',
    namespace: 'user-namespace',
    labels: {
      'babylon.gpte.redhat.com/catalogItemName': 'test-item',
      'babylon.gpte.redhat.com/catalogItemNamespace': 'catalog',
    },
  },
  spec: {
    lifespan: {
      start: '2026-05-28T10:00:00Z',
      end: '2026-05-31T10:00:00Z',
    },
    actionSchedule: {
      stop: '2026-05-28T18:00:00Z',
    },
  },
} as Workshop;

describe('reorder-utils', () => {
  test('getResourceClaimReorderSchedule extracts start, stop, and destroy dates', () => {
    const schedule = getResourceClaimReorderSchedule(resourceClaim);
    expect(schedule.startDate?.toISOString()).toBe('2026-05-28T10:00:00.000Z');
    expect(schedule.stopDate?.toISOString()).toBe('2026-05-28T18:00:00.000Z');
    expect(schedule.endDate?.toISOString()).toBe('2026-05-31T10:00:00.000Z');
  });

  test('getWorkshopReorderSchedule extracts start, stop, and destroy dates', () => {
    const schedule = getWorkshopReorderSchedule(workshop);
    expect(schedule.startDate?.toISOString()).toBe('2026-05-28T10:00:00.000Z');
    expect(schedule.stopDate?.toISOString()).toBe('2026-05-28T18:00:00.000Z');
    expect(schedule.endDate?.toISOString()).toBe('2026-05-31T10:00:00.000Z');
  });

  test('canReorderResourceClaim returns true when catalog item is available', () => {
    expect(canReorderResourceClaim(resourceClaim, catalogItem, [], false)).toBe(true);
  });

  test('canReorderResourceClaim returns false when part of workshop', () => {
    const workshopResourceClaim = {
      ...resourceClaim,
      metadata: {
        ...resourceClaim.metadata,
        ownerReferences: [{ kind: 'Workshop', name: 'test-workshop', uid: 'uid' }],
      },
    } as ResourceClaim;
    expect(canReorderResourceClaim(workshopResourceClaim, catalogItem, [], false)).toBe(false);
  });

  test('getInitialReorderSchedule resets past dates using catalog defaults', () => {
    const now = Date.now();
    const schedule = getInitialReorderSchedule(
      {
        startDate: new Date('2020-05-20T10:00:00Z'),
        stopDate: new Date('2020-05-21T18:00:00Z'),
        endDate: new Date('2020-05-22T10:00:00Z'),
      },
      catalogItem,
    );
    expect(schedule.startDate.getTime()).toBeGreaterThanOrEqual(now - 5000);
    expect(schedule.startDate.getTime()).toBeLessThanOrEqual(now + 5000);
    expect(schedule.endDate.getTime()).toBeGreaterThan(now);
    expect(schedule.stopDate.getTime()).toBeGreaterThan(now);
    expect(schedule.stopDate.getTime()).toBeLessThan(schedule.endDate.getTime());
  });

  test('getStopMaxDate uses start plus runtime capped by destroy', () => {
    const startDate = new Date('2026-05-28T10:00:00Z');
    const endDate = new Date('2026-05-31T10:00:00Z');
    const maxRuntime = parseDuration('4h');
    expect(getStopMaxDate({ startDate, endDate }, maxRuntime)).toBe(startDate.getTime() + maxRuntime);
    expect(getStopMaxDate({ startDate, endDate }, parseDuration('7d'))).toBe(endDate.getTime() - 60000);
  });

  test('getStopMinDate is after start time', () => {
    const now = Date.parse('2026-05-27T12:00:00Z');
    const startDate = new Date('2026-05-28T10:00:00Z');
    expect(getStopMinDate({ startDate }, now)).toBe(startDate.getTime() + 60000);
  });

  test('isValidReorderSchedule validates date ordering', () => {
    const now = Date.parse('2026-05-27T12:00:00Z');
    expect(
      isValidReorderSchedule(
        {
          startDate: new Date('2026-05-28T10:00:00Z'),
          stopDate: new Date('2026-05-28T18:00:00Z'),
          endDate: new Date('2026-05-31T10:00:00Z'),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isValidReorderSchedule(
        {
          startDate: new Date('2026-05-28T20:00:00Z'),
          stopDate: new Date('2026-05-28T18:00:00Z'),
          endDate: new Date('2026-05-31T10:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isValidReorderSchedule(
        {
          startDate: new Date('2026-05-28T10:00:00Z'),
          endDate: new Date('2026-05-31T10:00:00Z'),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isValidReorderSchedule(
        {
          endDate: new Date('2026-05-31T10:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  test('isNoAutoStop is true only when stop date is missing', () => {
    const endDate = new Date('2026-05-31T10:00:00Z');
    expect(isNoAutoStop({ endDate })).toBe(true);
    expect(isNoAutoStop({ stopDate: endDate, endDate })).toBe(false);
    expect(
      isNoAutoStop({
        stopDate: new Date('2026-05-28T18:00:00Z'),
        endDate,
      }),
    ).toBe(false);
  });
});
