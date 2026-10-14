import type { CatalogItem } from '@app/types';
import { getAssetProvisioning } from './provisioning';

const item = (multiuser: boolean, schema = {}) =>
  ({
    spec: { multiuser, parameters: [{ name: 'num_users', openAPIV3Schema: schema }] },
  }) as CatalogItem;

describe('multi-asset seat allocation', () => {
  test.each([
    [1, 1],
    [20, 1],
    [30, 2],
    [40, 2],
    [41, 3],
  ])('%i seats with capacity 20 requires %i instances', (seats, count) => {
    expect(getAssetProvisioning(item(true, { maximum: 20 }), seats)).toEqual({
      count,
      parameters: { num_users: seats },
    });
  });

  test('uncapped multiuser assets use one instance and the requested seats', () => {
    expect(getAssetProvisioning(item(true), 30)).toEqual({ count: 1, parameters: { num_users: 30 } });
  });

  test('single-user assets retain one instance per seat', () => {
    expect(getAssetProvisioning(item(false, { maximum: 20 }), 30)).toEqual({ count: 30, parameters: {} });
  });

  test('multiuser assets without num_users retain existing provisioning', () => {
    expect(getAssetProvisioning({ spec: { multiuser: true } } as CatalogItem, 30)).toEqual({
      count: 30,
      parameters: {},
    });
  });
});
