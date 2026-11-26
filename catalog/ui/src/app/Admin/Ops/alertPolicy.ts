import { AlertVariant } from '@patternfly/react-core';

export const ALERT_AUTO_DISMISS_MS = 8000;

/** Failures and warnings stay until the operator closes them; everything else clears itself. */
const PERSISTENT = new Set<AlertVariant>([AlertVariant.danger, AlertVariant.warning]);

export function shouldAutoDismiss(variant: AlertVariant): boolean {
  return !PERSISTENT.has(variant);
}
