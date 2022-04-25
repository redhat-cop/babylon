import { BABYLON_ANNOTATION } from '@app/util';
import { CatalogItem } from '@app/types';

export function getProvider(catalogItem: CatalogItem): string {
  return (
    catalogItem.metadata.labels?.[`${BABYLON_ANNOTATION}/provider`] ||
    catalogItem.metadata.labels?.[`${BABYLON_ANNOTATION}/Provider`] ||
    'Red Hat'
  );
}
export function getCategory(catalogItem: CatalogItem): string | null {
  return catalogItem.metadata.labels?.[`${BABYLON_ANNOTATION}/category`];
}
export function getDescription(catalogItem: CatalogItem): {
  description: string | null;
  descriptionFormat: 'asciidoc' | 'html';
} {
  return {
    description: catalogItem.metadata.annotations?.[`${BABYLON_ANNOTATION}/description`],
    descriptionFormat: catalogItem.metadata.annotations?.[`${BABYLON_ANNOTATION}/descriptionFormat`] || 'asciidoc',
  };
}
export function getStage(catalogItem: CatalogItem): string | null {
  return catalogItem.metadata.labels?.[`${BABYLON_ANNOTATION}/stage`];
}
