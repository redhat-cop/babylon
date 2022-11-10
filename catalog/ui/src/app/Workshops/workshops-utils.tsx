import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { checkResourceClaimCanStart, checkResourceClaimCanStop } from '@app/util';
import { getAutoStopTime, getStartTime } from '@app/Services/service-utils';

export function isWorkshopStarted(workshopProvisions: WorkshopProvision[]): boolean {
  const startTime = getWorkshopStartTime(workshopProvisions);
  return startTime && startTime < Date.now();
}

export function getWorkshopStartTime(workshopProvisions: WorkshopProvision[]): number {
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
  return { start: getWorkshopStartTime(workshopProvisions), end: endTime };
}

export function getWorkshopAutoStopTime(resourceClaims: ResourceClaim[]): number {
  const resourcesTime = resourceClaims && resourceClaims.length > 0 ? resourceClaims.flatMap(getAutoStopTime) : [];
  return resourcesTime.length > 0 ? Math.min(...resourcesTime) : null;
}
export function getWorkshopServicesStartTime(resourceClaims: ResourceClaim[]): number {
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
