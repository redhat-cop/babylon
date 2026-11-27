import parseDuration from 'parse-duration';
import type { CatalogItem, ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { BABYLON_DOMAIN, checkAccessControl, isResourceClaimPartOfWorkshop } from '@app/util';

export interface ReorderSchedule {
  startDate?: Date;
  stopDate?: Date;
  endDate?: Date;
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed);
}

export function getResourceClaimReorderSchedule(resourceClaim: ResourceClaim): ReorderSchedule {
  const stopTimestamp = resourceClaim.spec.provider?.parameterValues?.stop_timestamp;
  return {
    startDate: parseOptionalDate(resourceClaim.spec.lifespan?.start),
    stopDate: parseOptionalDate(stopTimestamp),
    endDate: parseOptionalDate(
      resourceClaim.spec.lifespan?.end || resourceClaim.status?.lifespan?.end,
    ),
  };
}

export function getWorkshopReorderSchedule(workshop: Workshop): ReorderSchedule {
  return {
    startDate: parseOptionalDate(workshop.spec.lifespan?.start || workshop.spec.actionSchedule?.start),
    stopDate: parseOptionalDate(workshop.spec.actionSchedule?.stop),
    endDate: parseOptionalDate(workshop.spec.lifespan?.end),
  };
}

export function getInitialReorderSchedule(schedule: ReorderSchedule, catalogItem: CatalogItem): ReorderSchedule {
  const now = Date.now();
  const defaultRuntime = parseDuration(catalogItem.spec.runtime?.default || '4h');
  const defaultLifespan = parseDuration(catalogItem.spec.lifespan?.default || '72h');

  let endDate = schedule.endDate;
  let stopDate = schedule.stopDate;
  let startDate = schedule.startDate ?? new Date(now);

  if (!endDate || endDate.getTime() <= now) {
    startDate = new Date(now);
    endDate = new Date(now + defaultLifespan);
    if (schedule.stopDate) {
      stopDate = new Date(Math.min(startDate.getTime() + defaultRuntime, endDate.getTime() - 60000));
    }
  } else {
    if (startDate.getTime() < now) {
      startDate = new Date(now);
    }
    if (stopDate && stopDate.getTime() <= now) {
      if (endDate && stopDate.getTime() >= endDate.getTime()) {
        stopDate = undefined;
      } else {
        stopDate = new Date(Math.min(startDate.getTime() + defaultRuntime, endDate.getTime() - 60000));
      }
    }
    if (stopDate && endDate && stopDate.getTime() >= endDate.getTime()) {
      stopDate = undefined;
    }
    if (stopDate && stopDate.getTime() <= startDate.getTime()) {
      stopDate = new Date(Math.min(startDate.getTime() + defaultRuntime, endDate.getTime() - 60000));
    }
  }

  return { startDate, stopDate, endDate };
}

export function isNoAutoStop(schedule: ReorderSchedule): boolean {
  return !schedule.stopDate;
}

export function parseCatalogDuration(value?: string): number | null {
  if (!value) {
    return null;
  }
  const ms = parseDuration(value);
  return ms && !Number.isNaN(ms) ? ms : null;
}

export function isValidReorderSchedule(schedule: ReorderSchedule, now = Date.now()): boolean {
  if (!schedule.endDate || schedule.endDate.getTime() <= now) {
    return false;
  }
  if (!schedule.startDate) {
    return false;
  }
  if (schedule.stopDate) {
    if (schedule.stopDate.getTime() <= now) {
      return false;
    }
    if (schedule.startDate.getTime() >= schedule.stopDate.getTime()) {
      return false;
    }
  }
  if (schedule.startDate.getTime() >= schedule.endDate.getTime()) {
    return false;
  }
  return true;
}

function canReorderCatalogItem(
  catalogItem: CatalogItem | undefined,
  groups: string[],
  isAdmin: boolean,
): catalogItem is CatalogItem {
  if (!catalogItem) {
    return false;
  }
  if (catalogItem.spec.externalUrl) {
    return false;
  }
  return checkAccessControl(catalogItem.spec.accessControl, groups, isAdmin) === 'allow';
}

export function canReorderResourceClaim(
  resourceClaim: ResourceClaim,
  catalogItem: CatalogItem | undefined,
  groups: string[],
  isAdmin: boolean,
): boolean {
  if (isResourceClaimPartOfWorkshop(resourceClaim)) {
    return false;
  }
  if (
    !resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`] ||
    !resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`]
  ) {
    return false;
  }
  if (
    resourceClaim.spec.resources?.[0]?.provider?.name === 'babylon-service-request-configmap' &&
    !isAdmin
  ) {
    return false;
  }
  const schedule = getResourceClaimReorderSchedule(resourceClaim);
  if (!schedule.endDate) {
    return false;
  }
  return canReorderCatalogItem(catalogItem, groups, isAdmin);
}

export function canReorderWorkshop(
  workshop: Workshop,
  catalogItem: CatalogItem | undefined,
  workshopProvision: WorkshopProvision | undefined,
  groups: string[],
  isAdmin: boolean,
): boolean {
  if (workshop.spec.provisionDisabled) {
    return false;
  }
  if (
    !workshop.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`] ||
    !workshop.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`]
  ) {
    return false;
  }
  if (!workshopProvision) {
    return false;
  }
  return canReorderCatalogItem(catalogItem, groups, isAdmin);
}
