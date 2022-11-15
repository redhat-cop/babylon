import { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN, formatDuration } from '@app/util';
import { Ops } from '@app/Admin/CatalogItemAdmin';

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
    descriptionFormat:
      (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/descriptionFormat`] as 'html' | 'asciidoc') || 'asciidoc',
  };
}

export function getStage(catalogItem: CatalogItem): string | null {
  return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/stage`];
}

const supportedSupportTypes = ['Enterprise_Premium', 'Enterprise_Standard', 'Community'] as const;
type SupportTypes = typeof supportedSupportTypes[number];
export function getSupportType(catalogItem: CatalogItem): SupportTypes {
  const supportType = catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/Support_Type`] as SupportTypes;
  if (!supportedSupportTypes.includes(supportType)) return null;
  return supportType;
}

export function getIsDisabled(catalogItem: CatalogItem): boolean {
  if (catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/disabled`]) {
    return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/disabled`] === 'true';
  }
  return false;
}

export function getStatus(
  catalogItem: CatalogItem
): { code: string; name: string; updated?: { author: string; updatedAt: string } } | null {
  if (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]) {
    const ops: Ops = JSON.parse(catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]);
    if (ops.status.id) {
      switch (ops.status.id) {
        case 'degraded-performance':
          return { code: ops.status.id, name: 'Degraded performance', updated: ops.status.updated };
        case 'partial-outage':
          return { code: ops.status.id, name: 'Partial outage', updated: ops.status.updated };
        case 'major-outage':
          return { code: ops.status.id, name: 'Major outage', updated: ops.status.updated };
        case 'under-maintenance':
          return { code: ops.status.id, name: 'Under maintenance', updated: ops.status.updated };
        default:
          return { code: 'operational', name: 'Operational', updated: ops.status.updated };
      }
    }
  }
  return { code: null, name: '' };
}

export function getIncidentUrl(catalogItem: CatalogItem): string {
  if (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]) {
    const ops: Ops = JSON.parse(catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]);
    return ops.incidentUrl || null;
  }
  return null;
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
export function formatString(string: string): string {
  return (string.charAt(0).toUpperCase() + string.slice(1)).replace(/_/g, ' ');
}
export const HIDDEN_LABELS = ['disabled', 'userCatalogItem', 'stage', 'Support_Type'];
export const HIDDEN_ANNOTATIONS = ['ops', 'displayNameComponent0', 'displayNameComponent1'];
