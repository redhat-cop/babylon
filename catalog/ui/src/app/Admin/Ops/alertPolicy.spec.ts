import { AlertVariant } from '@patternfly/react-core';

import { ALERT_AUTO_DISMISS_MS, shouldAutoDismiss } from './alertPolicy';

describe('alertPolicy', () => {
  it('keeps failures and warnings until dismissed', () => {
    expect(shouldAutoDismiss(AlertVariant.danger)).toBe(false);
    expect(shouldAutoDismiss(AlertVariant.warning)).toBe(false);
  });

  it('auto-dismisses success and info', () => {
    expect(shouldAutoDismiss(AlertVariant.success)).toBe(true);
    expect(shouldAutoDismiss(AlertVariant.info)).toBe(true);
  });

  it('auto-dismisses an unrecognised variant', () => {
    expect(shouldAutoDismiss(AlertVariant.custom)).toBe(true);
  });

  it('keeps the eight second timeout', () => {
    expect(ALERT_AUTO_DISMISS_MS).toBe(8000);
  });
});
