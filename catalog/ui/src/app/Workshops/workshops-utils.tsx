import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { canExecuteAction, checkResourceClaimCanStart, checkResourceClaimCanStop, DEMO_DOMAIN } from '@app/util';
import { getAutoStopTime, getMinDefaultRuntime } from '@app/Services/service-utils';

export function isWorkshopStarted(workshop: Workshop, workshopProvisions: WorkshopProvision[]): boolean {
  const startTime = getWorkshopStartTime(workshop, workshopProvisions);
  return startTime && startTime < Date.now();
}

export function getWorkshopStartTime(workshop: Workshop, workshopProvisions?: WorkshopProvision[]): number {
  // Lifespan start propagates from Workshop.
  if (workshop.spec.lifespan?.start) {
    return Date.parse(workshop.spec.lifespan.start);
  }

  // If workshop does not have workshop start then check WorkshopProvisions
  const provisionsStartTime = workshopProvisions
    ? workshopProvisions
        .map((workshopProvision) =>
          workshopProvision.spec.lifespan?.start ? Date.parse(workshopProvision.spec.lifespan.start) : null
        )
        .filter(Number)
    : [];
  return provisionsStartTime.length > 0 ? Math.min(...provisionsStartTime) : null;
}

export function getWorkshopLifespan(
  workshop: Workshop,
  workshopProvisions: WorkshopProvision[]
): { start: number; end: number } {
  const endTime = workshop.spec.lifespan?.end ? Date.parse(workshop.spec.lifespan.end) : null;
  return { start: getWorkshopStartTime(workshop, workshopProvisions), end: endTime };
}

export function getWorkshopAutoStopTime(workshop: Workshop, resourceClaims: ResourceClaim[]): number {
  // Workshop stop schedule propagates to all ResourceClaims
  if (workshop.spec.actionSchedule?.stop) {
    return Date.parse(workshop.spec.actionSchedule.stop);
  }
  // Fallback to getting stop time from ResourceClaims
  const resourcesTime = resourceClaims && resourceClaims.length > 0 ? resourceClaims.flatMap(getAutoStopTime) : [];
  return resourcesTime.length > 0 ? Math.min(...resourcesTime) : null;
}
export function getWorkshopDefaultRuntime(resourceClaims: ResourceClaim[]) {
  const resourcesTime = resourceClaims && resourceClaims.length > 0 ? resourceClaims.flatMap(getMinDefaultRuntime) : [];
  return resourcesTime.length > 0 ? Math.min(...resourcesTime) : null;
}

export function checkWorkshopCanStop(resourceClaims: ResourceClaim[] = []) {
  const resourceClaimsCanStop = resourceClaims.filter(checkResourceClaimCanStop);

  return resourceClaimsCanStop && resourceClaimsCanStop.length > 0;
}

export function supportAction(
  resourceClaims: ResourceClaim[] = [],
  action: 'start' | 'stop' | 'status' | 'provision' | 'destroy'
) {
  function canResourceClaimExecuteAction(resourceClaim: ResourceClaim) {
    return !!(resourceClaim?.status?.resources || []).find((r) => {
      const state = r.state;
      if (!state) return false;
      return canExecuteAction(state, action);
    });
  }

  const resourceClaimsSupportStopAction = resourceClaims.filter(canResourceClaimExecuteAction);

  return resourceClaimsSupportStopAction && resourceClaimsSupportStopAction.length > 0;
}

export function checkWorkshopCanStart(resourceClaims: ResourceClaim[] = []) {
  const resourceClaimsCanStart = resourceClaims.filter(checkResourceClaimCanStart);

  return resourceClaimsCanStart && resourceClaimsCanStart.length > 0;
}

export function isWorkshopLocked(workshop: Workshop, isAdmin: boolean) {
  if (workshop.metadata?.labels?.[`${DEMO_DOMAIN}/lock-enabled`]) {
    return workshop.metadata?.labels?.[`${DEMO_DOMAIN}/lock-enabled`] === 'true';
  }
  return false;
}
