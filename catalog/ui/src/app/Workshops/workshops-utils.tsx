import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { checkResourceClaimCanStart, checkResourceClaimCanStop } from '@app/util';
import { getAutoStopTime, getStartTime } from '@app/Services/service-utils';

export function isWorkshopStarted(workshop: Workshop, workshopProvisions: WorkshopProvision[]): boolean {
  const startTime = getWorkshopStartTime(workshop, workshopProvisions);
  return startTime && startTime < Date.now();
}

export function getWorkshopStartTime(workshop: Workshop, workshopProvisions: WorkshopProvision[]): number {
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
export function getWorkshopServicesStartTime(workshop: Workshop, resourceClaims: ResourceClaim[]): number {
  // Workshop start schedule propagates to all ResourceClaims
  if (workshop.spec.actionSchedule?.start) {
    return Date.parse(workshop.spec.actionSchedule.start);
  }
  // Fallback to getting stop time from ResourceClaims
  return resourceClaims.length > 0 ? Math.min(...resourceClaims.flatMap(getStartTime)) : null;
}

export function checkWorkshopCanStop(resourceClaims: ResourceClaim[] = []): boolean {
  const resourceClaimsCanStop = resourceClaims.filter((resourceClaim) => checkResourceClaimCanStop(resourceClaim));

  return resourceClaimsCanStop && resourceClaimsCanStop.length > 0;
}

export function checkWorkshopCanStart(resourceClaims: ResourceClaim[] = []): boolean {
  const resourceClaimsCanStart = resourceClaims.filter((resourceClaim) => checkResourceClaimCanStart(resourceClaim));

  return resourceClaimsCanStart && resourceClaimsCanStart.length > 0;
}
