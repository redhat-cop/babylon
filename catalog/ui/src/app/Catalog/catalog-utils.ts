import { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN, formatDuration } from '@app/util';
import { Ops } from '@app/Admin/CatalogItemAdmin';

export function getProvider(catalogItem: CatalogItem): string {
  return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.PROVIDER.key}`] || 'Red Hat';
}
export function getCategory(catalogItem: CatalogItem): string | null {
  return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.CATEGORY.key}`];
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

export function getStage(catalogItem: CatalogItem) {
  return catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.STAGE.key}`];
}

const supportedSLAs = ['Enterprise_Premium', 'Enterprise_Standard', 'Community'] as const;
type SLAs = (typeof supportedSLAs)[number];
export function getSLA(catalogItem: CatalogItem): SLAs {
  const sla = catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.SLA.key}`] as SLAs;
  if (!supportedSLAs.includes(sla)) return null;
  return sla;
}

export function getIsDisabled(catalogItem: CatalogItem): boolean {
  if (catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.DISABLED.key}`]) {
    return catalogItem.metadata.labels[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.DISABLED.key}`] === 'true';
  }
  return false;
}

export function getRating(catalogItem: CatalogItem): { ratingScore: number; totalRatings: number } | null {
  const ratingScoreSelector = catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.RATING.key}`];
  const totalRatingsSelector = catalogItem.metadata.annotations[`${BABYLON_DOMAIN}/totalRatings`];
  if (ratingScoreSelector) {
    const ratingScore = parseFloat(ratingScoreSelector);
    const totalRatings = totalRatingsSelector ? parseInt(totalRatingsSelector, 10) : null;
    return isNaN(ratingScore) ? null : { ratingScore, totalRatings };
  }
  return null;
}
export function formatCurrency(value: number) {
  if (isNaN(value)) return null;
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return currencyFormatter.format(value);
}
export function getEstimatedCost(catalogItem: CatalogItem) {
  const estimatedCost = catalogItem.metadata.labels?.[`${BABYLON_DOMAIN}/${CUSTOM_LABELS.ESTIMATED_COST.key}`];
  if (estimatedCost) {
    const cost = parseFloat(estimatedCost);
    return isNaN(cost) ? null : cost;
  }
  return null;
}
function getEstimatedCostFormatted(catalogItem: CatalogItem) {
  const estimatedCost = getEstimatedCost(catalogItem);
  if (estimatedCost) {
    return formatCurrency(estimatedCost);
  }
  return null;
}
export function getStatus(
  catalogItem: CatalogItem
): { code: string; name: string; updated?: { author: string; updatedAt: string } } | null {
  if (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]) {
    const ops: Ops = JSON.parse(catalogItem.metadata.annotations[`${BABYLON_DOMAIN}/ops`]);
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

export function isAutoStopDisabled(catalogItem: CatalogItem) {
  if (catalogItem.spec.runtime?.default) {
    return catalogItem.spec.runtime.default.includes('999h');
  }
  return false;
}

export function getIncidentUrl(catalogItem: CatalogItem): string {
  if (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/ops`]) {
    const ops: Ops = JSON.parse(catalogItem.metadata.annotations[`${BABYLON_DOMAIN}/ops`]);
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
export function sortLabels([a_attr]: string[], [b_attr]: string[]) {
  const a_obj = Object.values(CUSTOM_LABELS).find((i) => i.key === a_attr);
  const b_obj = Object.values(CUSTOM_LABELS).find((i) => i.key === b_attr);
  if (a_obj) {
    if (b_obj) {
      return a_obj.weight > b_obj.weight ? -1 : 1;
    }
  }
  return -1;
}
export const CUSTOM_LABELS: {
  [name in 'CATEGORY' | 'PROVIDER' | 'SLA' | 'RATING' | 'ESTIMATED_COST' | 'FEATURED_SCORE' | 'STAGE' | 'DISABLED']: {
    key: string;
    weight: number;
  };
} = {
  CATEGORY: { key: 'category', weight: 70 },
  PROVIDER: { key: 'Provider', weight: 60 },
  SLA: { key: 'SLA', weight: 50 },
  RATING: { key: 'rating', weight: 30 },
  ESTIMATED_COST: { key: 'Estimated_Cost', weight: 20 },
  FEATURED_SCORE: { key: 'Featured_Score', weight: 0 },
  STAGE: { key: 'stage', weight: 0 },
  DISABLED: { key: 'disabled', weight: 0 },
};
export const HIDDEN_LABELS = [
  'userCatalogItem',
  CUSTOM_LABELS.DISABLED.key,
  CUSTOM_LABELS.STAGE.key,
  CUSTOM_LABELS.FEATURED_SCORE.key,
  CUSTOM_LABELS.ESTIMATED_COST.key,
];
export const HIDDEN_LABELS_DETAIL_VIEW = [
  'userCatalogItem',
  CUSTOM_LABELS.DISABLED.key,
  CUSTOM_LABELS.STAGE.key,
  CUSTOM_LABELS.FEATURED_SCORE.key,
];
export const HIDDEN_ANNOTATIONS = ['ops', 'displayNameComponent0', 'displayNameComponent1'];
