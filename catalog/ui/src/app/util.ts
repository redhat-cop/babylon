import AsciiDoctor from 'asciidoctor'; // Use asciidoctor to translate descriptions
import dompurify from 'dompurify'; // Use dompurify to make asciidoctor output safe
import {
  AccessControl,
  AnarchySubject,
  CatalogNamespace,
  CostTracker,
  K8sObject,
  Namespace,
  Nullable,
  ResourceClaim,
  Service,
  ServiceNamespace,
  Workshop,
} from '@app/types';

export const BABYLON_DOMAIN = 'babylon.gpte.redhat.com';
export const DEMO_DOMAIN = 'demo.redhat.com';
export const CATALOG_MANAGER_DOMAIN = `catalog-manager.${DEMO_DOMAIN}`;

// Force all links to target new window and not pass unsafe attributes
dompurify.addHook('afterSanitizeAttributes', function (node) {
  if (node.tagName == 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function displayName(item: K8sObject | CatalogNamespace | ServiceNamespace): string {
  if (!item) {
    return '';
  }
  const k8sObject = item as ResourceClaim | Workshop;
  const catalog = item as CatalogNamespace;
  if (k8sObject.kind === 'ResourceClaim') {
    const _item = k8sObject as ResourceClaim;
    const catalogItemName = _item.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`];
    const catalogItemDisplayName = _item.metadata.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`];

    if (_item.spec.resources[0].provider?.name === 'babylon-service-request-configmap') {
      if (catalogItemName && catalogItemDisplayName && _item.metadata.name === catalogItemName) {
        return `${catalogItemDisplayName} Service Request`;
      } else if (catalogItemName && catalogItemDisplayName && _item.metadata.name.startsWith(catalogItemName)) {
        return `${catalogItemDisplayName} Service Request - ${_item.metadata.name.substring(
          1 + catalogItemName.length
        )}`;
      } else {
        return `${_item.metadata.name} Service Request`;
      }
    } else {
      if (catalogItemName && catalogItemDisplayName && _item.metadata.name === catalogItemName) {
        return catalogItemDisplayName;
      } else if (catalogItemName && catalogItemDisplayName && _item.metadata.name.startsWith(catalogItemName)) {
        return `${catalogItemDisplayName} - ${_item.metadata.name.substring(1 + catalogItemName.length)}`;
      } else {
        return _item.metadata.name;
      }
    }
  } else if (k8sObject.kind === 'Workshop') {
    const _item = k8sObject as Workshop;
    const catalogItemName = _item.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`];
    const catalogItemDisplayName = _item.spec?.displayName;
    if (catalogItemName && catalogItemDisplayName && _item.metadata.name === catalogItemName) {
      return catalogItemDisplayName;
    } else if (catalogItemName && catalogItemDisplayName && _item.metadata.name.startsWith(catalogItemName)) {
      return `${catalogItemDisplayName} - ${_item.metadata.name.substring(1 + catalogItemName.length)}`;
    } else {
      return _item.metadata.name;
    }
  } else {
    return (
      k8sObject.metadata?.annotations?.[`${BABYLON_DOMAIN}/displayName`] ||
      k8sObject.metadata?.annotations?.[`${BABYLON_DOMAIN}/display-name`] ||
      k8sObject.metadata?.annotations?.['openshift.io/display-name'] ||
      catalog.displayName ||
      k8sObject.metadata?.name ||
      catalog.name
    );
  }
}

export function randomString(length: number): string {
  // Restrict to characters that are easy to read and unlikely to be mistyped
  const characters = '23456789abcdefghjkmnpqrstuzwxyz';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return text;
}

export function recursiveAssign(target: object, source: object): any {
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === 'object' && k in target && target[k] !== null && typeof target[k] === 'object') {
      recursiveAssign(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

type RenderContentOpt = {
  allowIFrame?: boolean;
  format?: 'asciidoc' | 'html';
  vars?: object;
};

export function renderContent(content: string, options: RenderContentOpt = {}): string {
  const sanitize_opt = {
    ADD_TAGS: [],
    ADD_ATTR: [],
  };
  if (options.allowIFrame) {
    sanitize_opt.ADD_TAGS.push('iframe');
    sanitize_opt.ADD_ATTR.push('allowfullscreen', 'frameborder');
  }
  if (options.format === 'html') {
    return dompurify.sanitize(content, sanitize_opt);
  } else {
    const asciidoctor = AsciiDoctor();
    return dompurify.sanitize(asciidoctor.convert(content, { attributes: options.vars }).toString(), sanitize_opt);
  }
}

export function checkAccessControl(accessConfig: AccessControl, groups: string[]): 'allow' | 'viewOnly' | 'deny' {
  if (!accessConfig) {
    return 'allow';
  }
  if ((accessConfig.denyGroups || []).filter((group) => groups.includes(group)).length > 0) {
    return 'deny';
  }
  if ((accessConfig.allowGroups || []).filter((group) => groups.includes(group)).length > 0) {
    return 'allow';
  }
  if ((accessConfig.viewOnlyGroups || []).filter((group) => groups.includes(group)).length > 0) {
    return 'viewOnly';
  }
  return 'deny';
}

export function checkResourceClaimCanStart(resourceClaim: ResourceClaim): boolean {
  return !!(resourceClaim?.status?.resources || []).find((r, idx) => {
    const state = r.state;
    const template = resourceClaim.spec.resources[idx]?.template;
    if (!state || !template) {
      return false;
    }
    if (!canExecuteAction(state, 'start')) {
      return false;
    }
    const currentState = state?.spec?.vars?.current_state;
    if (currentState && (currentState.endsWith('-failed') || currentState === 'provision-canceled')) {
      return false;
    }
    const startTimestamp = template?.spec?.vars?.action_schedule?.start || state?.spec?.vars?.action_schedule?.start;
    const stopTimestamp = template?.spec?.vars?.action_schedule?.stop || state?.spec?.vars?.action_schedule?.stop;
    if (startTimestamp && stopTimestamp) {
      const startTime = Date.parse(startTimestamp);
      const stopTime = Date.parse(stopTimestamp);
      return startTime > Date.now() || stopTime < Date.now();
    } else {
      return false;
    }
  });
}

export function checkResourceClaimCanStop(resourceClaim: ResourceClaim): boolean {
  return !!(resourceClaim?.status?.resources || []).find((r, idx) => {
    const state = r.state;
    const template = resourceClaim.spec.resources[idx]?.template;
    if (!state || !template) {
      return false;
    }
    if (!canExecuteAction(state, 'stop')) {
      return false;
    }
    const currentState = state?.spec?.vars?.current_state;
    if (currentState && (currentState.endsWith('-failed') || currentState === 'provision-canceled')) {
      return false;
    }
    const startTimestamp = template?.spec?.vars?.action_schedule?.start || state?.spec?.vars?.action_schedule?.start;
    const stopTimestamp = template?.spec?.vars?.action_schedule?.stop || state?.spec?.vars?.action_schedule?.stop;
    if (startTimestamp && stopTimestamp) {
      const startTime = Date.parse(startTimestamp);
      const stopTime = Date.parse(stopTimestamp);
      return startTime < Date.now() && stopTime > Date.now();
    } else {
      return false;
    }
  });
}

export function checkResourceClaimCanRate(resourceClaim: ResourceClaim): boolean {
  return !!(resourceClaim?.status?.resources || []).find((r, idx) => {
    const state = r.state;
    const template = resourceClaim.spec.resources[idx]?.template;
    if (!state || !template) {
      return false;
    }
    const notReadyStates = ['new', 'provision-pending', 'provisioning', 'provision-canceled'];
    const currentState = state?.spec?.vars?.current_state;
    if (currentState && (currentState.endsWith('-failed') || notReadyStates.includes(currentState))) {
      return false;
    }
    return true;
  });
}

export function isResourceClaimPartOfWorkshop(resourceClaim: ResourceClaim) {
  if (!resourceClaim) return false;
  return (
    resourceClaim.metadata.ownerReferences &&
    resourceClaim.metadata.ownerReferences.filter((x) => x.kind === 'WorkshopProvision' || x.kind === 'Workshop')
      .length > 0
  );
}

export function isWorkshopPartOfResourceClaim(workshop: Workshop) {
  if (!workshop) return false;
  return (
    workshop.metadata.ownerReferences &&
    workshop.metadata.ownerReferences.filter((x) => x.kind === 'ResourceClaim').length > 0
  );
}

export function getStageFromK8sObject(k8sObject: K8sObject): 'dev' | 'test' | 'event' | 'prod' {
  if (!k8sObject) return null;
  const nameSplitted = k8sObject.metadata.name.split('.');
  if (Array.isArray(nameSplitted) && nameSplitted.length > 0) {
    const stage = nameSplitted[nameSplitted.length - 1];
    const validStages = ['dev', 'test', 'event', 'prod'];
    if (validStages.includes(stage)) {
      return stage as 'dev' | 'test' | 'event' | 'prod';
    }
    return null;
  }
  return null;
}

export function formatDuration(ms: number): string {
  const absoluteMs = Math.abs(ms);
  const time = {
    day: Math.floor(absoluteMs / 86400000),
    hour: Math.floor(absoluteMs / 3600000) % 24,
    minute: Math.floor(absoluteMs / 60000) % 60,
    second: Math.floor(absoluteMs / 1000) % 60,
    millisecond: Math.floor(absoluteMs) % 1000,
  };
  return Object.entries(time)
    .filter((val) => val[1] !== 0)
    .map(([key, val]) => `${val} ${key}${val !== 1 ? 's' : ''}`)
    .join(', ');
}

export function keywordMatch(service: Service, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  const resourceHandleName = service.status?.resourceHandle?.name;
  const guid = resourceHandleName ? resourceHandleName.replace(/^guid-/, '') : null;
  if (service.metadata.name.includes(keywordLowerCased)) {
    return true;
  }
  if (displayName(service).toLowerCase().includes(keywordLowerCased)) {
    return true;
  }
  if (guid && guid.includes(keywordLowerCased)) {
    return true;
  }
  return false;
}

export const compareK8sObjects = (obj1?: K8sObject, obj2?: K8sObject): boolean => {
  return compareK8sObjectsArr(obj1 ? Array.of(obj1) : null, obj2 ? Array.of(obj2) : null);
};

export const compareK8sObjectsArr = (obj1?: K8sObject[], obj2?: K8sObject[]): boolean => {
  function areMapsEqual(map1: Map<string, string>, map2: Map<string, string>) {
    let testVal: string;
    if (map1.size !== map2.size) {
      return false;
    }
    for (const [key, val] of map1) {
      testVal = map2.get(key);
      // in cases of an undefined value, make sure the key
      // actually exists on the object so there are no false positives
      if (testVal !== val || (testVal === undefined && !map2.has(key))) {
        return false;
      }
    }
    return true;
  }
  if ((!obj1 && obj2) || (obj1 && !obj2)) return false;
  if (obj1 !== obj2) {
    const map1 = new Map<string, string>();
    const map2 = new Map<string, string>();
    if (obj1) obj1.map((i: K8sObject) => map1.set(i.metadata.uid, i.metadata.resourceVersion));
    if (obj2) obj2.map((i: K8sObject) => map2.set(i.metadata.uid, i.metadata.resourceVersion));
    return areMapsEqual(map1, map2);
  }
  return true;
};

export const FETCH_BATCH_LIMIT = 100;

export function stripHtml(html: string): string {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function getCostTracker(resourceClaim?: ResourceClaim): CostTracker {
  if (!resourceClaim || !resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/cost-tracker`]) return null;
  return JSON.parse(resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/cost-tracker`]);
}

export function compareStringDates(stringDate1: string, stringDate2: string): number {
  const date1 = new Date(stringDate1).getTime();
  const date2 = new Date(stringDate2).getTime();
  return Math.abs(date1 - date2);
}

export function getLang(): string {
  if (navigator.languages != undefined) return navigator.languages[0];
  return navigator.language || 'en-US';
}

export function isLabDeveloper(groups: string[]): boolean {
  return groups.includes('rhpds-devs');
}

export function CSVToArray(strData: string, strDelimiter = ','): string[][] {
  const objPattern = new RegExp(
    '(\\' + strDelimiter + '|\\r?\\n|\\r|^)' + '(?:"([^"]*(?:""[^"]*)*)"|' + '([^"\\' + strDelimiter + '\\r\\n]*))',
    'gi'
  );
  const arrData: string[][] = [[]];
  let arrMatches = null;
  while ((arrMatches = objPattern.exec(strData))) {
    const strMatchedDelimiter = arrMatches[1];
    if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) {
      arrData.push([]);
    }
    let strMatchedValue: Nullable<string> = null;
    if (arrMatches[2]) {
      strMatchedValue = arrMatches[2].replace(new RegExp('""', 'g'), '"');
    } else {
      strMatchedValue = arrMatches[3];
    }
    arrData[arrData.length - 1].push(strMatchedValue);
  }
  return arrData;
}

export function canExecuteAction(
  anarchySubject: AnarchySubject,
  action: 'start' | 'stop' | 'status' | 'provision' | 'destroy'
): boolean {
  if (action === 'status') {
    if (!anarchySubject?.status?.towerJobs?.provision?.completeTimestamp) {
      return false;
    }
  }
  return anarchySubject?.status?.supportedActions && action in anarchySubject.status.supportedActions;
}

export function escapeRegex(string: string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function stripTags(unStrippedHtml: string) {
  const parseHTML = new DOMParser().parseFromString(
    dompurify.sanitize(unStrippedHtml.replace(/<\!--.*?-->/g, '').replace(/(\r\n|\n|\r)/gm, '')),
    'text/html'
  );
  return parseHTML.body.textContent || '';
}

export function getHelpUrl(userEmail: string) {
  if (userEmail.includes('@redhat.com')) {
    return 'https://red.ht/demo-help';
  }
  return 'https://red.ht/open-support';
}

export function namespaceToServiceNamespaceMapper(ns: Namespace): ServiceNamespace {
  return {
    name: ns.metadata.name,
    displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
    requester: ns.metadata.annotations['openshift.io/requester'],
  };
}
