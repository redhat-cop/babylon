import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ResourceClaim } from '@app/types';
import WorkshopDetailStatus from './WorkshopDetailStatus';

const makeResourceClaim = (state: string, name: string): ResourceClaim =>
  ({
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourceClaim',
    metadata: { name, namespace: 'test-ns', creationTimestamp: new Date().toISOString() },
    spec: {},
    status: { summary: { state } },
  }) as unknown as ResourceClaim;

describe('WorkshopDetailStatus', () => {
  test('shows aggregated instances status', () => {
    render(
      <WorkshopDetailStatus
        resourceClaims={[makeResourceClaim('started', 'a'), makeResourceClaim('provisioning', 'b')]}
        expectedCount={3}
      />,
    );
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.queryByText('Instances')).not.toBeInTheDocument();
  });

  test('labels instances and clusters when both exist', () => {
    render(
      <WorkshopDetailStatus
        resourceClaims={[makeResourceClaim('started', 'a'), makeResourceClaim('started', 'b')]}
        clusterResourceClaims={[makeResourceClaim('started', 'c')]}
        expectedCount={2}
      />,
    );
    expect(screen.getByText('Instances')).toBeInTheDocument();
    expect(screen.getByText('Clusters')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  test('ignores ResourceClaims being deleted', () => {
    const deleting = makeResourceClaim('provisioning', 'b');
    deleting.metadata.deletionTimestamp = new Date().toISOString();
    render(<WorkshopDetailStatus resourceClaims={[makeResourceClaim('started', 'a'), makeResourceClaim('started', 'c'), deleting]} expectedCount={2} />);
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  test('scheduled workshop shows scheduled status', () => {
    render(<WorkshopDetailStatus resourceClaims={[]} expectedCount={5} autoStartTime={Date.now() + 3 * 60 * 60 * 1000} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(/Starts/)).toBeInTheDocument();
  });
});
