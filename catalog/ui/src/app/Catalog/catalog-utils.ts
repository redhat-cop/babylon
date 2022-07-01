import { BABYLON_DOMAIN } from '@app/util';
import { CatalogItem } from '@app/types';
import { formatDuration } from '@app/util';
export function getProvider(catalogItem: CatalogItem): string {
  return (
    catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/provider`] ||
    catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/Provider`] ||
    'Red Hat'
  );
}
export function getCategory(catalogItem: CatalogItem): string | null {
  return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/category`];
}
export function getDescription(catalogItem: CatalogItem): {
  description: string | null;
  descriptionFormat: 'asciidoc' | 'html';
} {
  return {
    description: catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/description`],
    descriptionFormat: catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/descriptionFormat`] || 'asciidoc',
  };
}
export function getStage(catalogItem: CatalogItem): string | null {
  return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/stage`];
}

export function getIsDisabled(catalogItem: CatalogItem): boolean {
  if (catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/disabled`]) {
    return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/disabled`] === 'true';
  }
  return false;
}

export function getStatus(catalogItem: CatalogItem): { code: string; name: string } | null {
  if (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]) {
    const ops = JSON.parse(catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]);
    if (ops.status) {
      switch (ops.status) {
        case 'degraded-performance':
          return { code: ops.status, name: 'Degraded performance' };
        case 'partial-outage':
          return { code: ops.status, name: 'Partial outage' };
        case 'major-outage':
          return { code: ops.status, name: 'Major outage' };
        case 'under-maintenance':
          return { code: ops.status, name: 'Under maintenance' };
        default:
          return { code: 'operational', name: 'Operational' };
      }
    }
  }
  return { code: null, name: '' };
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

export function getLastFilter(): string {
  return sessionStorage.getItem('lastCatalogFilter');
}
export function setLastFilter(filter: string): void {
  sessionStorage.setItem('lastCatalogFilter', filter);
}

export const HIDDEN_LABELS = ['disabled', 'userCatalogItem', 'stage'];
