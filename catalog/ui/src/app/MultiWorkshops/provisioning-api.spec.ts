import fetchMock from 'jest-fetch-mock';
import { createWorkshopProvisionFromAsset } from '@app/api';
import type { CatalogItem, Workshop } from '@app/types';

const sessionWindow = window as Window & { sessionPromiseInstance?: Promise<{ token: string }> };

describe('multi-asset provision request', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    sessionWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
  });
  afterEach(() => {
    delete sessionWindow.sessionPromiseInstance;
  });

  test.each([20, undefined])('stores total seats with maximum %s', async (maximum) => {
    const provision = {
      metadata: { name: 'workshop', namespace: 'user-test' },
      spec: {},
    };
    fetchMock.mockResponses(JSON.stringify(provision), JSON.stringify(provision));
    await createWorkshopProvisionFromAsset({
      workshop: { metadata: { name: 'workshop', namespace: 'user-test', uid: 'uid' } } as Workshop,
      asset: { key: 'asset', name: 'asset', namespace: 'catalog' },
      multiworkshopName: 'event',
      multiworkshopUid: 'event-uid',
      multiworkshopData: { numberSeats: 30 },
      catalogItem: {
        metadata: { name: 'asset', namespace: 'catalog' },
        spec: { multiuser: true, parameters: [{ name: 'num_users', openAPIV3Schema: { maximum } }] },
      } as CatalogItem,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.spec.count).toBe(maximum ? 2 : 1);
    expect(body.spec.parameters.num_users).toBe(30);
    expect(body.metadata.annotations['babylon.gpte.redhat.com/multiuser-seat-allocation']).toBe('true');
  });
});
