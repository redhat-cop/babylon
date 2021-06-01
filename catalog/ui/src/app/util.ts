// Use asciidoctor to translate descriptions
import * as AsciiDoctor from 'asciidoctor';
const asciidoctor = AsciiDoctor();

// Use dompurify to make asciidoctor output safe
import dompurify from 'dompurify';
// Force all links to target new window and not pass unsafe attributes
dompurify.addHook('afterSanitizeAttributes', function(node) {
  if (node.tagName == 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function displayName(item: object): string {
  if (item.kind === 'ResourceClaim') {
    const catalogItemName = item.metadata.labels?.['babylon.gpte.redhat.com/catalogItemName'];
    const catalogItemDisplayName = item.metadata.annotations?.['babylon.gpte.redhat.com/catalogItemDisplayName'];
    console.log(catalogItemName);
    if (catalogItemName && catalogItemDisplayName && item.metadata.name.startsWith(catalogItemName)) {
      return `${catalogItemDisplayName} - ${item.metadata.name.substring(1 + catalogItemName.length)}`;
    } else {
      return item.metadata.name;
    }
  } else {
    return (
      item?.metadata?.annotations?.['babylon.gpte.redhat.com/displayName'] ||
      item?.metadata?.annotations?.['babylon.gpte.redhat.com/display-name'] ||
      item?.metadata?.annotations?.['openshift.io/display-name'] ||
      item.metadata.name
    );
  }
}

export function renderAsciiDoc(asciidoc: string, options?: object): string {
  const sanitize_opt = {
    ADD_TAGS: [],
    ADD_ATTR: [],
  };
  if (options && options.allowIFrame) {
    sanitize_opt.ADD_TAGS.push('iframe');
    sanitize_opt.ADD_ATTR.push('allowfullscreen', 'frameborder');
  }
  return dompurify.sanitize(asciidoctor.convert(asciidoc), sanitize_opt);
}

export function checkResourceClaimCanStart(resourceClaim) {
  return !!(
    (resourceClaim?.status?.resources || []).find((r, idx) => {
      const state = r.state;
      const template = resourceClaim.spec.resources[idx]?.template;
      if (!state || !template) { return false }
      const startTimestamp = template?.spec?.vars?.action_schedule?.start || state?.spec?.vars?.action_schedule?.start;
      const stopTimestamp = template?.spec?.vars?.action_schedule?.stop || state?.spec?.vars?.action_schedule?.stop;
      if (startTimestamp && stopTimestamp) {
        const startTime = Date.parse(startTimestamp);
        const stopTime = Date.parse(stopTimestamp);
        return startTime > Date.now() || stopTime < Date.now();
      } else {
        return false;
      }
    })
  );
}

export function checkResourceClaimCanStop(resourceClaim) {
  return !!(
    (resourceClaim?.status?.resources || []).find((r, idx) => {
      const state = r.state;
      const template = resourceClaim.spec.resources[idx]?.template;
      if (!state || !template) { return false }
      const startTimestamp = template?.spec?.vars?.action_schedule?.start || state?.spec?.vars?.action_schedule?.start;
      const stopTimestamp = template?.spec?.vars?.action_schedule?.stop || state?.spec?.vars?.action_schedule?.stop;
      if (startTimestamp && stopTimestamp) {
        const startTime = Date.parse(startTimestamp);
        const stopTime = Date.parse(stopTimestamp);
        return startTime < Date.now() && stopTime > Date.now();
      } else {
        return false;
      }
    })
  );
}
