import { AgnosticVRepo, CatalogItem, CatalogItemIncident } from '@app/types';
import { BABYLON_DOMAIN, CATALOG_MANAGER_DOMAIN, formatDuration } from '@app/util';

export function getProvider(catalogItem: CatalogItem) {
  const { domain, key } = CUSTOM_LABELS.PROVIDER;
  return catalogItem.metadata.labels?.[`${domain}/${key}`] || 'Red Hat';
}
export function getCategory(catalogItem: CatalogItem) {
  return catalogItem.spec.category;
}
export function getDescription(catalogItem: CatalogItem): {
  description: string | null;
  descriptionFormat: 'asciidoc' | 'html';
} {
  return {
    description: catalogItem.spec.description.content,
    descriptionFormat: catalogItem.spec.description.format as 'html' | 'asciidoc',
  };
}

export function getStage(catalogItem: CatalogItem) {
  const { domain, key } = CUSTOM_LABELS.STAGE;
  return catalogItem.metadata.labels?.[`${domain}/${key}`];
}

const supportedSLAs = ['Enterprise_Premium', 'Enterprise_Standard', 'Community', 'External_Support'] as const;
type SLAs = (typeof supportedSLAs)[number];
export function getSLA(catalogItem: CatalogItem): SLAs {
  const { domain, key } = CUSTOM_LABELS.SLA;
  const sla = catalogItem.metadata.labels?.[`${domain}/${key}`] as SLAs;
  if (!supportedSLAs.includes(sla)) return null;
  return sla;
}

export function getRating(catalogItem: CatalogItem): { ratingScore: number; totalRatings: number } | null {
  const { domain, key } = CUSTOM_LABELS.RATING;
  const ratingScoreSelector = catalogItem.metadata.labels?.[`${domain}/${key}`];
  const totalRatingsSelector = catalogItem.metadata.annotations[`${domain}/totalRatings`];
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
export function getLastSuccessfulProvisionTime(catalogItem: CatalogItem) {
  if (catalogItem.metadata.annotations?.[`${CATALOG_MANAGER_DOMAIN}/lastSuccessfulProvision`]) {
    const now = new Date();
    const provisionDate = new Date(
      catalogItem.metadata.annotations[`${CATALOG_MANAGER_DOMAIN}/lastSuccessfulProvision`],
    );
    if (provisionDate < now) {
      return provisionDate.getTime();
    }
    return null;
  }
  return null;
}
export function getStatus(
  catalogItem: CatalogItem,
): { name: string; updated?: { author: string; updatedAt: string }; disabled: boolean; incidentUrl?: string } | null {
  if (catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/incident`]) {
    const catalog_incident: CatalogItemIncident = JSON.parse(
      catalogItem.metadata.annotations[`${BABYLON_DOMAIN}/incident`],
    );
    if (catalog_incident) {
      return {
        name: catalog_incident.status,
        updated: { author: catalog_incident.created_by, updatedAt: catalog_incident.updated_at },
        disabled: catalog_incident.disabled,
        incidentUrl: catalog_incident.incident_url,
      };
    }
  }
  return { name: 'Operational', disabled: false, incidentUrl: null };
}

export function isAutoStopDisabled(catalogItem: CatalogItem) {
  if (catalogItem.spec.runtime?.default) {
    return catalogItem.spec.runtime.default.includes('999h');
  }
  return false;
}

export function formatTime(time: string): string {
  if (!time || time.length === 0) {
    return '-';
  }
  const timeUnit = time.charAt(time.length - 1);
  const timeValue = Math.ceil(parseInt(time.slice(0, -1), 10));
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
  if (!string) return '';
  return (string.charAt(0).toUpperCase() + string.slice(1)).replace(/_/g, ' ');
}
export function convertToGitHubUrl(agnosticVRepo: AgnosticVRepo, hash: string) {
  if (!agnosticVRepo) {
    return `https://github.com/rhpds/agnosticv/commit/${hash}`;
  }
  if (!agnosticVRepo.git.url.startsWith('git@github.com:')) {
    throw new Error('Invalid GitHub SSH URL');
  }

  const repoPath = agnosticVRepo.git.url.replace('git@github.com:', '').replace('.git', '');

  // If commit hash is present, link to the commit; otherwise, link to the branch
  return hash
    ? `https://github.com/${repoPath}/commit/${hash}`
    : `https://github.com/${repoPath}/tree/${agnosticVRepo.git.ref}`;
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
  [name in
    | 'CATEGORY'
    | 'PROVIDER'
    | 'PRODUCT'
    | 'PRODUCT_FAMILY'
    | 'SLA'
    | 'RATING'
    | 'ESTIMATED_COST'
    | 'FEATURED_SCORE'
    | 'STAGE'
    | 'DISABLED']: {
    key: string;
    weight: number;
    domain: string;
  };
} = {
  CATEGORY: { key: 'category', weight: 70, domain: BABYLON_DOMAIN },
  PROVIDER: { key: 'Provider', weight: 60, domain: BABYLON_DOMAIN },
  PRODUCT: { key: 'Product', weight: 60, domain: BABYLON_DOMAIN },
  PRODUCT_FAMILY: { key: 'Product_Family', weight: 60, domain: BABYLON_DOMAIN },
  SLA: { key: 'SLA', weight: 50, domain: BABYLON_DOMAIN },
  RATING: { key: 'rating', weight: 30, domain: CATALOG_MANAGER_DOMAIN },
  ESTIMATED_COST: { key: 'Estimated_Cost', weight: 20, domain: BABYLON_DOMAIN },
  FEATURED_SCORE: { key: 'Featured_Score', weight: 0, domain: BABYLON_DOMAIN },
  STAGE: { key: 'stage', weight: 0, domain: BABYLON_DOMAIN },
  DISABLED: { key: 'disabled', weight: 0, domain: BABYLON_DOMAIN },
};
export const HIDDEN_LABELS = [
  'userCatalogItem',
  'Base_Component',
  CUSTOM_LABELS.DISABLED.key,
  CUSTOM_LABELS.STAGE.key,
  CUSTOM_LABELS.FEATURED_SCORE.key,
  CUSTOM_LABELS.ESTIMATED_COST.key,
];
export const HIDDEN_LABELS_DETAIL_VIEW = [
  'userCatalogItem',
  'Base_Component',
  CUSTOM_LABELS.DISABLED.key,
  CUSTOM_LABELS.STAGE.key,
  CUSTOM_LABELS.FEATURED_SCORE.key,
  CUSTOM_LABELS.PRODUCT.key,
];
export const HIDDEN_ANNOTATIONS = ['ops', 'displayNameComponent0', 'displayNameComponent1'];
