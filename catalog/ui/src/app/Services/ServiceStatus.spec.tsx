import '@testing-library/jest-dom';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import anarchySubjectObj from '../__mocks__/anarchySubject.json';
import anarchySubjectFailedObj from '../__mocks__/anarchySubject--provision-failed.json';
import ServiceStatus from './ServiceStatus';

describe('ServiceStatus', () => {
  test('When ServiceStatus layout renders, should display ServiceStatus', async () => {
    const { getByText } = render(
      <ServiceStatus creationTime={1} resource={anarchySubjectObj} resourceTemplate={anarchySubjectObj} />
    );
    const status = getByText('Stopped');
    await waitFor(() => expect(status).toBeInTheDocument());
  });
  test('When ServiceStatus layout renders with a failure, should display retry option', async () => {
    const { getByText } = render(
      <ServiceStatus creationTime={1} resource={anarchySubjectFailedObj} resourceTemplate={anarchySubjectFailedObj} />
    );
    const status = getByText('Provision Failed');
    const retry = getByText('Retry');
    await waitFor(() => {
      expect(status).toBeInTheDocument();
      expect(retry).toBeInTheDocument();
    });
  });
});
