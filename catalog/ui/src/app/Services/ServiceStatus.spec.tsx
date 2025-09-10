import React from 'react';
import stoppedResourceClaimObj from '../__mocks__/resourceClaim--stopped.json';
import failedResourceClaimObj from '../__mocks__/resourceClaim--provision-fail.json';
import { render, waitFor } from '@app/utils/test-utils';
import { ResourceClaim } from '@app/types';
import ServiceStatus from './ServiceStatus';

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn().mockReturnValue(true),
}));

describe('ServiceStatus', () => {
  test('When ServiceStatus layout renders with stopped, should display ServiceStatus', async () => {
    const { getByText } = render(
      <ServiceStatus resourceClaim={stoppedResourceClaimObj as unknown as ResourceClaim} />,
    );
    const status = getByText(/Stopped/i);
    await waitFor(() => expect(status).toBeInTheDocument());
  });
  test('When ServiceStatus layout renders with provision-failed, should display ServiceStatus', async () => {
    const { getByText } = render(
      <ServiceStatus resourceClaim={failedResourceClaimObj as unknown as ResourceClaim} />,
    );
    const status = getByText(/Provision Failed/i);
    await waitFor(() => expect(status).toBeInTheDocument());
  });
});
