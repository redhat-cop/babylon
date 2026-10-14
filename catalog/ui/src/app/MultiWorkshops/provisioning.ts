import type { CatalogItem } from '@app/types';

export function getAssetProvisioning(catalogItem: CatalogItem, seats: number) {
  const numUsers =
    catalogItem?.spec.multiuser === true
      ? catalogItem.spec.parameters?.find((parameter) => parameter.name === 'num_users')
      : undefined;
  if (!numUsers) return { count: seats, parameters: {} };

  const maximum = numUsers.openAPIV3Schema?.maximum;
  const capacity =
    typeof maximum === 'number' && Number.isFinite(maximum) && maximum >= 1 ? Math.floor(maximum) : undefined;
  return {
    count: capacity ? Math.ceil(seats / capacity) : 1,
    parameters: { num_users: seats },
  };
}
