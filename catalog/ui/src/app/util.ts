import AsciiDoctor from 'asciidoctor'; // Use asciidoctor to translate descriptions
import dompurify from 'dompurify'; // Use dompurify to make asciidoctor output safe
import { CostTracker, K8sObject, ResourceClaim } from '@app/types';

// Force all links to target new window and not pass unsafe attributes
dompurify.addHook('afterSanitizeAttributes', function (node) {
  if (node.tagName == 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export const BABYLON_DOMAIN = 'babylon.gpte.redhat.com';

export function checkAccessControl(accessConfig: any, groups: string[]): string {
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

export interface ConditionValues {
  [name: string]: boolean | number | string | string[] | undefined;
}

export function checkCondition(condition: string, vars: ConditionValues): boolean {
  const checkFunction = new Function(
    Object.entries(vars)
      .map(([k, v]) => 'const ' + k + ' = ' + JSON.stringify(v) + ';')
      .join('\n') +
      'return (' +
      condition +
      ');'
  );
  const ret: boolean | Error = checkFunction();
  if (ret instanceof Error) {
    throw ret;
  } else {
    return Boolean(ret);
  }
}

export function displayName(item: any): string {
  if (!item) {
    return '';
  }
  if (item.kind === 'ResourceClaim') {
    const catalogItemName = item.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`];
    const catalogItemDisplayName = item.metadata.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`];

    if (item.spec.resources[0].provider?.name === 'babylon-service-request-configmap') {
      if (catalogItemName && catalogItemDisplayName && item.metadata.name === catalogItemName) {
        return `${catalogItemDisplayName} Service Request`;
      } else if (catalogItemName && catalogItemDisplayName && item.metadata.name.startsWith(catalogItemName)) {
        return `${catalogItemDisplayName} Service Request - ${item.metadata.name.substring(
          1 + catalogItemName.length
        )}`;
      } else {
        return `${item.metadata.name} Service Request`;
      }
    } else {
      if (catalogItemName && catalogItemDisplayName && item.metadata.name === catalogItemName) {
        return catalogItemDisplayName;
      } else if (catalogItemName && catalogItemDisplayName && item.metadata.name.startsWith(catalogItemName)) {
        return `${catalogItemDisplayName} - ${item.metadata.name.substring(1 + catalogItemName.length)}`;
      } else {
        return item.metadata.name;
      }
    }
  } else {
    return (
      item.metadata?.annotations?.[`${BABYLON_DOMAIN}/displayName`] ||
      item.metadata?.annotations?.[`${BABYLON_DOMAIN}/display-name`] ||
      item.metadata?.annotations?.['openshift.io/display-name'] ||
      item.displayName ||
      item.spec?.displayName ||
      item.metadata?.name ||
      item.name
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

interface RenderContentOpt {
  allowIFrame?: boolean;
  format?: 'asciidoc' | 'html';
}

export function renderContent(content: string, options: RenderContentOpt = {}): string {
  const sanitize_opt = {
    ADD_TAGS: [] as any,
    ADD_ATTR: [] as any,
  };
  if (options.allowIFrame) {
    sanitize_opt.ADD_TAGS.push('iframe');
    sanitize_opt.ADD_ATTR.push('allowfullscreen', 'frameborder');
  }
  if (options.format === 'html') {
    return dompurify.sanitize(content, sanitize_opt);
  } else {
    const asciidoctor = AsciiDoctor();
    return dompurify.sanitize(asciidoctor.convert(content).toString(), sanitize_opt);
  }
}

export function checkResourceClaimCanStart(resourceClaim: ResourceClaim): boolean {
  return !!(resourceClaim?.status?.resources || []).find((r, idx) => {
    const state = r.state;
    const template = resourceClaim.spec.resources[idx]?.template;
    if (!state || !template) {
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

export function formatDuration(ms: number): string {
  if (ms < 0) ms = -ms;
  const time = {
    day: Math.floor(ms / 86400000),
    hour: Math.floor(ms / 3600000) % 24,
    minute: Math.floor(ms / 60000) % 60,
    second: Math.floor(ms / 1000) % 60,
    millisecond: Math.floor(ms) % 1000,
  };
  return Object.entries(time)
    .filter((val) => val[1] !== 0)
    .map(([key, val]) => `${val} ${key}${val !== 1 ? 's' : ''}`)
    .join(', ');
}

export function keywordMatch(resourceClaim: ResourceClaim, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  const resourceHandleName = resourceClaim.status?.resourceHandle?.name;
  const guid = resourceHandleName ? resourceHandleName.replace(/^guid-/, '') : null;
  if (resourceClaim.metadata.name.includes(keywordLowerCased)) {
    return true;
  }
  if (displayName(resourceClaim).toLowerCase().includes(keywordLowerCased)) {
    return true;
  }
  if (guid && guid.includes(keywordLowerCased)) {
    return true;
  }
  return false;
}

export const compareK8sObjects = (obj1?: K8sObject[], obj2?: K8sObject[]): boolean => {
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
