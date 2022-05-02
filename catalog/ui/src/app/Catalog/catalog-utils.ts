import { BABYLON_ANNOTATION } from '@app/util';
import { CatalogItem } from '@app/types';
import { formatDuration } from '@app/util';
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

export function formatTime(time: string): string {
  if (!time || time.length === 0) {
    return '-';
  }
  const timeUnit = time.charAt(time.length - 1);
  const timeValue = parseInt(time.slice(0, -1), 10);
  const timeValueMs: number | null = (() => {
    switch (timeUnit) {
      case 's':
        return timeValue * 1000;
      case 'm':
        return timeValue * 60000;
      case 'h':
        return timeValue * 3600000;
      default:
        return null;
    }
  })();
  if (timeValueMs) {
    return formatDuration(timeValueMs);
  }
  return '-';
}
