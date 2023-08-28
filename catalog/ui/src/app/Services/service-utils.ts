import {
  AnarchySubject,
  MessageTemplate,
  ResourceClaim,
  ResourceClaimSpecResource,
  ResourceClaimSpecResourceTemplate,
} from '@app/types';
import parseDuration from 'parse-duration';
import { canExecuteAction, DEMO_DOMAIN } from '@app/util';
import { phaseProps, getStatus } from './ServiceStatus';

export function getAutoTimes(resourceClaim: ResourceClaim): { startTime: number; stopTime: number } {
  if (
    resourceClaim.spec.provider?.parameterValues?.start_timestamp &&
    resourceClaim.spec.provider?.parameterValues?.stop_timestamp
  ) {
    return {
      startTime: Date.parse(resourceClaim.spec.provider.parameterValues.start_timestamp),
      stopTime: Date.parse(resourceClaim.spec.provider.parameterValues.stop_timestamp),
    };
  }
  const resources = resourceClaim.status?.resources;
  const { resources: specResources } = resourceClaim.spec;
  function getSpecResourceByName(name: string): ResourceClaimSpecResource {
    return specResources?.find((s) => s.name === name);
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
    return specResources?.find((s) => s.name === name);
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

  const codeLevels = ['failed', 'stopped', 'in-progress', 'available', 'running'];
  function cmp(a: { phase: phaseProps }, b: { phase: phaseProps }) {
    return codeLevels.indexOf(a.phase) > codeLevels.indexOf(b.phase) ? 1 : -1;
  }
  const mostRelevantResourceIndex = resourcesStatus.sort(cmp)[0].index;

  return {
    resource: resources[mostRelevantResourceIndex].state,
    template: getSpecResourceByName(resources[mostRelevantResourceIndex].name)?.template,
  };
}

export function getAutoStopTime(resourceClaim: ResourceClaim): number {
  if (resourceClaim.spec?.provider?.parameterValues?.stop_timestamp) {
    return Date.parse(resourceClaim.spec.provider.parameterValues.stop_timestamp);
  }
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

export function getMinDefaultRuntime(resourceClaim: ResourceClaim): number {
  if (resourceClaim.status?.summary?.runtime_default) {
    return parseDuration(resourceClaim.status.summary.runtime_default);
  }
  const defaultAutoStops = resourceClaim.status?.resources
    ? resourceClaim.status.resources
        .map((statusResource) => {
          const defaultStop = statusResource.state?.spec.vars?.action_schedule?.default_runtime;
          if (defaultStop) return parseDuration(defaultStop);
          return null;
        })
        .filter((time) => time !== null)
    : [];
  if (defaultAutoStops && defaultAutoStops.length > 0) {
    return Math.min(...defaultAutoStops);
  }
  return null;
}

export function getStartTime(resourceClaim: ResourceClaim): number {
  if (resourceClaim.spec.provider?.parameterValues?.start_timestamp) {
    return Date.parse(resourceClaim.spec.provider.parameterValues.start_timestamp);
  }
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

export function getInfoMessageTemplate(resourceClaim?: ResourceClaim): MessageTemplate {
  if (!resourceClaim || !resourceClaim.metadata?.annotations?.[`${DEMO_DOMAIN}/info-message-template`]) return null;
  return JSON.parse(resourceClaim.metadata?.annotations?.[`${DEMO_DOMAIN}/info-message-template`]);
}

export function createAsciiDocAttributes(varsObj: object, separator = '--'): object {
  function setAttributesFromObj(obj: object, prependAttr = '') {
    return Object.entries(obj)
      .map(([k, v]) => {
        let attr = k;
        if (prependAttr !== '') {
          attr = `${prependAttr}${separator}${k}`;
        }
        if (typeof v === 'object' && v) {
          return setAttributesFromObj(v, attr);
        }
        return { [k]: v, [attr]: v };
      })
      .reduce((obj1, obj2) => Object.assign(obj1, obj2), {});
  }
  return setAttributesFromObj(varsObj);
}
