import { CatalogItem } from '@app/types';

// Keep the self-service limit consistent between ordering and provisioning.
export function workshopInstanceLimit(catalogItem?: CatalogItem): number {
  return catalogItem?.spec.workshopUiMaxInstances || 40;
}
