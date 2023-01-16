import {
  AnarchySubject,
  ResourceClaim,
  ResourceClaimSpecResource,
  ResourceClaimSpecResourceTemplate,
} from '@app/types';
import parseDuration from 'parse-duration';
import { canExecuteAction } from '@app/util';
import { phaseProps, getStatus } from './ServiceStatus';

export function getAutoTimes(resourceClaim: ResourceClaim): { startTime: number; stopTime: number } {
  const resources = resourceClaim.status?.resources;
  const { resources: specResources } = resourceClaim.spec;
  function getSpecResourceByName(name: string): ResourceClaimSpecResource {
    return specResources.find((s) => s.name === name);
  }
  if (!resources) return { startTime: null, stopTime: null };
  // The start time for a multi-component service is the earliest start time of all components and the stop time is the latest stop time
  const stopTimes = [];
  const startTimes = [];
  for (const [, resource] of resources.entries()) {
    const resourceK8s = resource.state;
    const specResource = getSpecResourceByName(resource.name);
    const stopTimestamp =
      specResource?.template?.spec?.vars?.action_schedule?.stop || resourceK8s?.spec?.vars?.action_schedule?.stop;
    const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;
    stopTimes.push(stopTime);
    const startTimestamp =
      specResource?.template?.spec?.vars?.action_schedule?.start || resourceK8s?.spec?.vars?.action_schedule?.start;
    const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
    startTimes.push(startTime);
  }
  return { stopTime: Math.max(...stopTimes), startTime: Math.min(...startTimes) };
}

export function getMostRelevantResourceAndTemplate(resourceClaim: ResourceClaim): {
  resource: AnarchySubject;
  template: ResourceClaimSpecResourceTemplate;
} {
  const resources = resourceClaim.status?.resources;
  const { resources: specResources } = resourceClaim.spec;
  function getSpecResourceByName(name: string): ResourceClaimSpecResource {
    return specResources.find((s) => s.name === name);
  }
  if (!resources) return { resource: null, template: null };
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

export function getAutoStopTime(resourceClaim: ResourceClaim): number {
  const autoStopTimes = resourceClaim.spec?.resources
    ? resourceClaim.spec.resources
        ?.map((specResource, idx) => {
          const statusResource = resourceClaim.status?.resources?.[idx];
          if (!canExecuteAction(statusResource?.state, 'stop')) return null;
          const stopTimestamp =
            specResource.template?.spec?.vars?.action_schedule?.stop ||
            statusResource.state.spec.vars.action_schedule.stop;
          if (stopTimestamp && !isNaN(Date.parse(stopTimestamp))) return Date.parse(stopTimestamp);
          return null;
        })
        .filter((time) => time !== null)
    : [];
  if (autoStopTimes && autoStopTimes.length > 0) {
    return Math.max(...autoStopTimes);
  }
  return null;
}

export function getStartTime(resourceClaim: ResourceClaim): number {
  const autoStartTimes = resourceClaim.status?.resources
    ? resourceClaim.status.resources
        .map((r) => {
          if (!r.state) return null;
          const startTimestamp = r.state.spec.vars.action_schedule.start;
          const resourceMaximumRuntime = r.state.spec.vars.action_schedule.maximum_runtime;
          if (resourceMaximumRuntime && startTimestamp && !isNaN(Date.parse(startTimestamp))) {
            return Date.parse(startTimestamp) + parseDuration(resourceMaximumRuntime);
          }
          return null;
        })
        .filter((runtime) => runtime !== null)
    : [];
  if (autoStartTimes.length > 0) {
    return Math.min(...autoStartTimes);
  }
  return null;
}

export function createAsciiDocTemplate(template: string, varsObj: object) {
  function setAttributesFromObj(obj: object, prependAttr = '') {
    return Object.entries(obj)
      .map(([k, v]) => {
        let attr = k;
        if (prependAttr !== '') {
          attr = `${prependAttr}--${k}`;
        }
        if (typeof v === 'object' && v) {
          return setAttributesFromObj(v, attr);
        }
        return `:${attr}: ${v}\n`;
      })
      .join('');
  }
  return `${setAttributesFromObj(varsObj)}\n${template}`;
}
