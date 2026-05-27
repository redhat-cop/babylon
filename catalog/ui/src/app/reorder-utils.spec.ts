import { canReorderResourceClaim, getResourceClaimReorderSchedule, getWorkshopReorderSchedule } from './reorder-utils';
import { CatalogItem, ResourceClaim, Workshop } from '@app/types';

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
});
