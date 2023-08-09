import React from 'react';
import resourceClaimObj from '../__mocks__/resourceClaim.json';
import anarchySubjectObj from '../__mocks__/anarchySubject.json';
import anarchySubjectFailedObj from '../__mocks__/anarchySubject--start-failed.json';
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
      <ServiceStatus
        creationTime={1}
        resource={anarchySubjectObj}
        resourceTemplate={anarchySubjectObj}
        resourceClaim={resourceClaimObj as ResourceClaim}
      />,
    );
    const status = getByText('Stopped');
    await waitFor(() => expect(status).toBeInTheDocument());
  });
  test('When ServiceStatus layout renders with start-failed, should display ServiceStatus', async () => {
    const { getByText } = render(
      <ServiceStatus
        creationTime={1}
        resource={anarchySubjectFailedObj}
        resourceTemplate={anarchySubjectFailedObj}
        resourceClaim={resourceClaimObj as ResourceClaim}
      />,
    );
    const status = getByText(/Start Failed/i);
    await waitFor(() => expect(status).toBeInTheDocument());
  });
});
