import parseDuration from 'parse-duration';
import {
  createServiceRequest,
  createWorkshop,
  createWorkshopProvision,
  CreateServiceRequestParameterValues,
} from '@app/api';
import {
  CatalogItem,
  ResourceClaim,
  ServiceNamespace,
  Workshop,
  WorkshopProvision,
} from '@app/types';
import {
  BABYLON_DOMAIN,
  checkAccessControl,
  DEMO_DOMAIN,
  getWhiteGloved,
  isResourceClaimPartOfWorkshop,
  parseSalesforceItems,
} from '@app/util';

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

export function getStopMaxDate(
  schedule: ReorderSchedule,
  maxRuntimeMs: number | null | undefined,
): number | null {
  if (!schedule.endDate || !schedule.startDate) {
    return null;
  }
  const destroyLimit = schedule.endDate.getTime() - 60000;
  if (!maxRuntimeMs || Number.isNaN(maxRuntimeMs)) {
    return destroyLimit;
  }
  return Math.min(destroyLimit, schedule.startDate.getTime() + maxRuntimeMs);
}

export function parseCatalogDuration(value?: string): number | null {
  if (!value) {
    return null;
  }
  const ms = parseDuration(value);
  return ms && !Number.isNaN(ms) ? ms : null;
}

export function getStopMinDate(schedule: ReorderSchedule, now = Date.now()): number {
  if (!schedule.startDate) {
    return now;
  }
  return Math.max(now, schedule.startDate.getTime() + 60000);
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

function getSkippedSfdc(annotations: Record<string, string>): boolean {
  return annotations[`${DEMO_DOMAIN}/provide_salesforce-id_later`] === 'true';
}

function getServiceNamespaceFromObject(
  namespace: string,
  annotations: Record<string, string>,
): ServiceNamespace {
  return {
    name: namespace,
    displayName: namespace,
    requester: annotations[`${DEMO_DOMAIN}/requester`],
  };
}

function getParameterValuesFromResourceClaim(resourceClaim: ResourceClaim): CreateServiceRequestParameterValues {
  const parameterValues: CreateServiceRequestParameterValues = {
    ...(resourceClaim.spec.provider?.parameterValues || {}),
  };
  delete parameterValues.stop_timestamp;

  const annotations = resourceClaim.metadata.annotations || {};
  if (annotations[`${DEMO_DOMAIN}/purpose`]) {
    parameterValues.purpose = annotations[`${DEMO_DOMAIN}/purpose`];
  }
  if (annotations[`${DEMO_DOMAIN}/purpose-activity`]) {
    parameterValues.purpose_activity = annotations[`${DEMO_DOMAIN}/purpose-activity`];
  }
  if (annotations[`${DEMO_DOMAIN}/purpose-explanation`]) {
    parameterValues.purpose_explanation = annotations[`${DEMO_DOMAIN}/purpose-explanation`];
  }

  return parameterValues;
}

function getParameterValuesFromWorkshopProvision(
  workshopProvision: WorkshopProvision,
): CreateServiceRequestParameterValues {
  const parameters: CreateServiceRequestParameterValues = { ...(workshopProvision.spec.parameters || {}) };
  delete parameters.salesforce_items;
  return parameters;
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

export async function reorderResourceClaim({
  resourceClaim,
  catalogItem,
  groups,
  isAdmin,
  email,
  schedule: scheduleOverride,
}: {
  resourceClaim: ResourceClaim;
  catalogItem: CatalogItem;
  groups: string[];
  isAdmin: boolean;
  email: string;
  schedule?: ReorderSchedule;
}): Promise<ResourceClaim> {
  const schedule = scheduleOverride ?? getResourceClaimReorderSchedule(resourceClaim);
  if (!schedule.endDate) {
    throw new Error('Cannot reorder: auto-destroy date is missing from the original service.');
  }
  if (!isValidReorderSchedule(schedule)) {
    throw new Error('Cannot reorder: schedule dates are invalid.');
  }
  const annotations = resourceClaim.metadata.annotations || {};
  const serviceNamespace = getServiceNamespaceFromObject(resourceClaim.metadata.namespace, annotations);
  const selectedResourcePool = annotations['poolboy.gpte.redhat.com/resource-pool-name'];
  const catalogNamespaceName =
    annotations[`${BABYLON_DOMAIN}/catalogDisplayName`] || catalogItem.metadata.namespace;

  return createServiceRequest({
    catalogItem,
    catalogNamespaceName,
    groups,
    isAdmin,
    parameterValues: getParameterValuesFromResourceClaim(resourceClaim),
    serviceNamespace,
    startDate: schedule.startDate,
    stopDate: schedule.stopDate,
    endDate: schedule.endDate,
    selectedResourcePool,
    useAutoDetach: !!resourceClaim.spec.autoDetach,
    email,
    skippedSfdc: getSkippedSfdc(annotations),
    whiteGloved: getWhiteGloved(resourceClaim),
    salesforceItems: parseSalesforceItems(annotations),
  });
}

export async function reorderWorkshop({
  workshop,
  workshopProvision,
  catalogItem,
  email,
  schedule: scheduleOverride,
}: {
  workshop: Workshop;
  workshopProvision: WorkshopProvision;
  catalogItem: CatalogItem;
  email: string;
  schedule?: ReorderSchedule;
}): Promise<Workshop> {
  const schedule = scheduleOverride ?? getWorkshopReorderSchedule(workshop);
  if (!schedule.endDate) {
    throw new Error('Cannot reorder: auto-destroy date is missing from the original workshop.');
  }
  if (!isValidReorderSchedule(schedule)) {
    throw new Error('Cannot reorder: schedule dates are invalid.');
  }
  const annotations = workshop.metadata.annotations || {};
  const serviceNamespace = getServiceNamespaceFromObject(workshop.metadata.namespace, annotations);
  const parameterValues = getParameterValuesFromWorkshopProvision(workshopProvision);
  const readyByDate = parseOptionalDate(workshop.spec.lifespan?.readyBy);

  const newWorkshop = await createWorkshop({
    accessPassword: workshop.spec.accessPassword,
    catalogItem,
    description: workshop.spec.description,
    displayName: workshop.spec.displayName,
    openRegistration: workshop.spec.openRegistration ?? true,
    serviceNamespace,
    stopDate: schedule.stopDate,
    endDate: schedule.endDate,
    startDate: schedule.startDate,
    readyByDate,
    email,
    parameterValues,
    skippedSfdc: getSkippedSfdc(annotations),
    whiteGloved: getWhiteGloved(workshop),
    salesforceItems: parseSalesforceItems(annotations),
  });

  await createWorkshopProvision({
    catalogItem,
    concurrency: workshopProvision.spec.concurrency,
    count: workshopProvision.spec.count,
    parameters: {
      ...parameterValues,
      salesforce_items: JSON.stringify(parseSalesforceItems(annotations)),
    },
    startDelay: workshopProvision.spec.startDelay,
    workshop: newWorkshop,
    useAutoDetach: !!workshopProvision.spec.autoDetach,
    selectedResourcePool: workshopProvision.spec.resourcePool,
  });

  return newWorkshop;
}
