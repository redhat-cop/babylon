import {
  AnarchySubject,
  ResourceClaim,
  ResourceClaimSpecResource,
  ResourceClaimSpecResourceTemplate,
} from '@app/types';
import { phaseProps, getStatus } from './ServiceStatus';

export function getMostRelevantResourceAndTemplate(resourceClaim: ResourceClaim): {
  resource: AnarchySubject;
  template: ResourceClaimSpecResourceTemplate;
} {
  const { resources } = resourceClaim.status;
  const { resources: specResources } = resourceClaim.spec;
  function getSpecResourceByName(name: string): ResourceClaimSpecResource {
    return specResources.find((s) => s.name === name);
  }
  if (!resources) return null;
  if (resources.length === 1)
    return { resource: resources[0].state, template: getSpecResourceByName(resources[0].name)?.template };

  const resourcesStatus: { index: number; phase: phaseProps }[] = [];
  for (const [i, resource] of resources.entries()) {
    const resourceK8s = resource.state;
    const currentState = resourceK8s?.kind === 'AnarchySubject' ? resourceK8s?.spec?.vars?.current_state : 'available';
    const specResource = getSpecResourceByName(resource.name);
    const desiredState = specResource?.template?.spec?.vars?.desired_state;
    const startTimestamp =
      specResource?.template?.spec?.vars?.action_schedule?.start || resourceK8s?.spec?.vars?.action_schedule?.start;
    const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
    const stopTimestamp =
      specResource?.template?.spec?.vars?.action_schedule?.stop || resourceK8s?.spec?.vars?.action_schedule?.stop;
    const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;

    resourcesStatus.push({
      index: i,
      phase: getStatus(
        currentState,
        desiredState,
        Date.parse(resourceClaim.metadata.creationTimestamp),
        startTime,
        stopTime
      ).phase,
    });
  }
  const codeLevels = ['failed', 'stopped', 'in-progress', 'running', 'available'];
  function cmp(a: { phase: phaseProps }, b: { phase: phaseProps }): number {
    return codeLevels.indexOf(a.phase) > codeLevels.indexOf(b.phase) ? 1 : -1;
  }
  const mostRelevantResourceIndex = resourcesStatus.sort(cmp)[0].index;

  return {
    resource: resources[mostRelevantResourceIndex].state,
    template: getSpecResourceByName(resources[mostRelevantResourceIndex].name)?.template,
  };
}
